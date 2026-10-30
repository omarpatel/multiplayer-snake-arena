import { v4 as uuidv4 } from 'uuid'
import { GAME_MODES, GameMode, LobbyConfig, PlayerResult } from '../../shared/types'
import { GameInstance } from './GameInstance'

const BOT_NAMES = ['Viper', 'Mamba', 'Cobra', 'Python', 'Boa', 'Adder', 'Krait', 'Taipan', 'Asp', 'Racer']

export interface LobbyManagerOptions {
  /** How long a lobby waits for humans before empty seats are filled with bots. */
  botFillMs: number
  /** Countdown between a lobby filling up and the round starting. */
  startDelayMs: number
  onLobbyUpdate: (lobby: LobbyConfig) => void
  onGameStart: (lobby: LobbyConfig) => void
  onGameEnd: (lobby: LobbyConfig, winnerId: string | null, results: PlayerResult[]) => void
  onKill?: (lobby: LobbyConfig, killerId: string, victimId: string) => void
}

/**
 * Matchmaking: one open lobby per mode. Humans join the open lobby; when it
 * reaches its player count (or the bot-fill timer runs out) a GameInstance starts.
 */
export class LobbyManager {
  private lobbies = new Map<string, LobbyConfig>()
  private games = new Map<string, GameInstance>()
  private playerToLobby = new Map<string, string>()
  private fillTimers = new Map<string, NodeJS.Timeout>()
  private startTimers = new Map<string, NodeJS.Timeout>()
  private botCounter = 0

  constructor(private options: LobbyManagerOptions) {}

  /** Puts a human in the open lobby for `mode`, creating one if needed. Returns null if already seated. */
  public join(mode: GameMode, playerId: string, name: string): LobbyConfig | null {
    if (this.playerToLobby.has(playerId)) return null

    const lobby = this.openLobby(mode) ?? this.createLobby(mode)
    lobby.players.push({ id: playerId, name, isBot: false })
    this.playerToLobby.set(playerId, lobby.id)

    if (!this.fillTimers.has(lobby.id)) {
      this.fillTimers.set(lobby.id, setTimeout(() => this.fillWithBots(lobby.id), this.options.botFillMs))
    }
    this.options.onLobbyUpdate(lobby)
    if (lobby.players.length >= lobby.minPlayers) this.scheduleStart(lobby)
    return lobby
  }

  /** Removes a player. Waiting lobbies drop the seat; lobbies left with no humans are discarded. */
  public leave(playerId: string): void {
    const lobbyId = this.playerToLobby.get(playerId)
    if (!lobbyId) return
    this.playerToLobby.delete(playerId)
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return

    if (lobby.status === 'waiting') {
      lobby.players = lobby.players.filter(p => p.id !== playerId)
      if (!lobby.players.some(p => !p.isBot)) {
        this.discard(lobby.id)
        return
      }
      this.options.onLobbyUpdate(lobby)
      return
    }

    // A round with no humans left watching has no reason to keep running
    const game = this.games.get(lobby.id)
    if (game && !game.hasLiveHumans(id => this.playerToLobby.get(id) === lobby.id)) {
      game.stop()
      this.discard(lobby.id)
    }
  }

  /** Seats bots in every empty slot up to the lobby's minimum and starts the countdown. */
  public fillWithBots(lobbyId: string): void {
    this.clearTimer(this.fillTimers, lobbyId)
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'waiting') return
    while (lobby.players.length < lobby.minPlayers) {
      const n = this.botCounter++
      lobby.players.push({ id: `bot-${n}`, name: `${BOT_NAMES[n % BOT_NAMES.length]} (bot)`, isBot: true })
    }
    this.options.onLobbyUpdate(lobby)
    this.scheduleStart(lobby)
  }

  public getGame(lobbyId: string): GameInstance | undefined {
    return this.games.get(lobbyId)
  }

  public getLobby(lobbyId: string): LobbyConfig | undefined {
    return this.lobbies.get(lobbyId)
  }

  public getPlayerLobby(playerId: string): LobbyConfig | undefined {
    const id = this.playerToLobby.get(playerId)
    return id ? this.lobbies.get(id) : undefined
  }

  public activeGames(): Array<[LobbyConfig, GameInstance]> {
    const out: Array<[LobbyConfig, GameInstance]> = []
    for (const [id, game] of this.games) {
      const lobby = this.lobbies.get(id)
      if (lobby) out.push([lobby, game])
    }
    return out
  }

  public counts() {
    let waitingPlayers = 0
    let playingHumans = 0
    for (const lobby of this.lobbies.values()) {
      const humans = lobby.players.filter(p => !p.isBot).length
      if (lobby.status === 'waiting') waitingPlayers += humans
      else if (lobby.status === 'active') playingHumans += humans
    }
    return { activeGames: this.games.size, waitingPlayers, playingHumans }
  }

  private openLobby(mode: GameMode): LobbyConfig | undefined {
    for (const lobby of this.lobbies.values()) {
      if (lobby.mode === mode && lobby.status === 'waiting' && lobby.players.length < lobby.maxPlayers) return lobby
    }
    return undefined
  }

  private createLobby(mode: GameMode): LobbyConfig {
    const { minPlayers, maxPlayers } = GAME_MODES[mode]
    const lobby: LobbyConfig = { id: uuidv4(), mode, minPlayers, maxPlayers, status: 'waiting', players: [] }
    this.lobbies.set(lobby.id, lobby)
    return lobby
  }

  private scheduleStart(lobby: LobbyConfig): void {
    if (this.startTimers.has(lobby.id)) return
    this.clearTimer(this.fillTimers, lobby.id)
    this.startTimers.set(lobby.id, setTimeout(() => this.start(lobby.id), this.options.startDelayMs))
  }

  private start(lobbyId: string): void {
    this.clearTimer(this.startTimers, lobbyId)
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby || lobby.status !== 'waiting') return
    // Someone left during the countdown: top up with bots rather than stall
    if (lobby.players.length < lobby.minPlayers) {
      this.fillWithBots(lobbyId)
      return
    }

    lobby.status = 'active'
    const game = new GameInstance(lobby.id, lobby.players, {
      onGameEnd: (winnerId, results) => this.finish(lobby.id, winnerId, results),
      onKill: (killerId, victimId) => this.options.onKill?.(lobby, killerId, victimId),
    })
    this.games.set(lobby.id, game)
    game.start()
    this.options.onGameStart(lobby)
  }

  private finish(lobbyId: string, winnerId: string | null, results: PlayerResult[]): void {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return
    lobby.status = 'finished'
    this.options.onGameEnd(lobby, winnerId, results)
    this.discard(lobbyId)
  }

  private discard(lobbyId: string): void {
    this.clearTimer(this.fillTimers, lobbyId)
    this.clearTimer(this.startTimers, lobbyId)
    const lobby = this.lobbies.get(lobbyId)
    for (const p of lobby?.players ?? []) {
      if (this.playerToLobby.get(p.id) === lobbyId) this.playerToLobby.delete(p.id)
    }
    this.games.get(lobbyId)?.stop()
    this.games.delete(lobbyId)
    this.lobbies.delete(lobbyId)
  }

  private clearTimer(timers: Map<string, NodeJS.Timeout>, lobbyId: string): void {
    clearTimeout(timers.get(lobbyId))
    timers.delete(lobbyId)
  }

  /** Stops every timer and game. Used on shutdown and in tests. */
  public shutdown(): void {
    for (const id of Array.from(this.lobbies.keys())) this.discard(id)
  }
}
