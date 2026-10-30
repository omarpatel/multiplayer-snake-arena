import { Snake, GameState, PlayerInput, GAME_CONFIG, LobbyPlayer, PlayerResult } from '../../shared/types'
import { updateSnakePosition, checkSnakeCollisions, checkPelletCollisions, generateStaticPelletGrid, createPelletsFromDeath } from '../../shared/physics'
import { BotPlayer } from './BotPlayer'

const COLORS = ['#00ff00', '#ff0000', '#3b82f6', '#ffff00', '#ff00ff', '#00ffff', '#f97316', '#a855f7', '#ffffff', '#84cc16']

/** No winner is declared during the first few seconds, so early collisions can't end a round instantly. */
const MIN_ROUND_MS = 5000

export interface GameCallbacks {
  onGameEnd: (winnerId: string | null, results: PlayerResult[]) => void
  onKill?: (killerId: string, victimId: string) => void
}

/**
 * One authoritative round. The server owns all snake state; clients only send
 * a target angle and a boost flag. Bots get their input from BotPlayer each tick.
 */
export class GameInstance {
  public readonly id: string
  public state: GameState
  private playerInputs = new Map<string, PlayerInput>()
  private bots = new Map<string, BotPlayer>()
  private deathTimes = new Map<string, number>()
  private tickInterval: NodeJS.Timeout | null = null
  private callbacks: GameCallbacks

  constructor(id: string, players: LobbyPlayer[], callbacks: GameCallbacks) {
    this.id = id
    this.callbacks = callbacks
    this.state = {
      snakes: new Map(),
      pellets: generateStaticPelletGrid(),
      tick: 0,
      startTime: Date.now(),
    }
    this.spawnSnakes(players)
  }

  /** Spawns snakes evenly on a circle around the map centre, each facing inwards. */
  private spawnSnakes(players: LobbyPlayer[]): void {
    const angleStep = (Math.PI * 2) / players.length
    const spawnRadius = Math.min(GAME_CONFIG.MAP_WIDTH, GAME_CONFIG.MAP_HEIGHT) * 0.3

    players.forEach((player, index) => {
      const angle = angleStep * index
      const snake: Snake = {
        id: player.id,
        name: player.name,
        isBot: player.isBot,
        segments: [{
          x: GAME_CONFIG.MAP_WIDTH / 2 + Math.cos(angle) * spawnRadius,
          y: GAME_CONFIG.MAP_HEIGHT / 2 + Math.sin(angle) * spawnRadius,
        }],
        angle: angle + Math.PI,
        length: GAME_CONFIG.SNAKE_INITIAL_LENGTH,
        speed: GAME_CONFIG.SNAKE_BASE_SPEED,
        boosting: false,
        alive: true,
        killCount: 0,
        color: COLORS[index % COLORS.length],
      }
      this.state.snakes.set(player.id, snake)
      this.playerInputs.set(player.id, { angle: snake.angle, boosting: false })
      if (player.isBot) this.bots.set(player.id, new BotPlayer(player.id, 0.4 + Math.random() * 0.4))
    })
  }

  public start(): void {
    this.state.startTime = Date.now()
    this.tickInterval = setInterval(() => this.tick(), GAME_CONFIG.TICK_MS)
  }

  public stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
  }

  /** Advances the simulation by one tick. Public so tests can step it deterministically. */
  public tick(now = Date.now()): void {
    this.state.tick++
    const snakes = Array.from(this.state.snakes.values())

    for (const [botId, bot] of this.bots) {
      const snake = this.state.snakes.get(botId)
      if (snake?.alive) this.playerInputs.set(botId, bot.getInput(snake, snakes, this.state.pellets))
    }

    const aliveBefore = new Set(snakes.filter(s => s.alive).map(s => s.id))

    for (const snake of snakes) {
      const input = this.playerInputs.get(snake.id)
      if (input && snake.alive) {
        snake.boosting = input.boosting
        updateSnakePosition(snake, input.angle, 1 / GAME_CONFIG.TICK_RATE)
      }
    }

    checkSnakeCollisions(snakes)

    for (const snake of snakes) {
      if (aliveBefore.has(snake.id) && !snake.alive) {
        this.deathTimes.set(snake.id, now)
        if (snake.killedBy) this.callbacks.onKill?.(snake.killedBy, snake.id)
      }
    }

    const collected = new Set<string>()
    for (const snake of snakes) {
      for (const pellet of checkPelletCollisions(snake, this.state.pellets)) collected.add(pellet.id)
    }
    if (collected.size > 0) this.state.pellets = this.state.pellets.filter(p => !collected.has(p.id))

    // Dead snakes turn into food
    for (const snake of snakes) {
      if (!snake.alive && snake.segments.length > 0) {
        this.state.pellets.push(...createPelletsFromDeath(snake))
        snake.segments = []
      }
    }

    if (now - this.state.startTime > MIN_ROUND_MS) {
      const alive = snakes.filter(s => s.alive)
      if (alive.length === 1 && snakes.length > 1) this.endGame(alive[0], now)
      else if (alive.length === 0) this.endGame(null, now)
    }
  }

  private endGame(winner: Snake | null, now: number): void {
    this.stop()
    const results: PlayerResult[] = Array.from(this.state.snakes.values()).map(snake => ({
      id: snake.id,
      name: snake.name,
      isBot: snake.isBot,
      finalLength: Math.floor(snake.length),
      killCount: snake.killCount,
      survivalTime: Math.floor(((this.deathTimes.get(snake.id) ?? now) - this.state.startTime) / 1000),
    }))
    // Winner first, then whoever survived longest
    results.sort((a, b) => (a.id === winner?.id ? -1 : b.id === winner?.id ? 1 : b.survivalTime - a.survivalTime))
    this.callbacks.onGameEnd(winner?.id ?? null, results)
  }

  public updatePlayerInput(playerId: string, input: PlayerInput): void {
    if (this.bots.has(playerId) || !this.state.snakes.has(playerId)) return
    if (!Number.isFinite(input.angle) || typeof input.boosting !== 'boolean') return
    this.playerInputs.set(playerId, { angle: input.angle, boosting: input.boosting })
  }

  /** True if any human in this round is still connected, per the callback. */
  public hasLiveHumans(connected: (id: string) => boolean): boolean {
    for (const snake of this.state.snakes.values()) {
      if (!snake.isBot && connected(snake.id)) return true
    }
    return false
  }

  public getSerializableState() {
    return {
      snakes: Array.from(this.state.snakes.values()).map(s => ({
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        segments: s.segments,
        angle: s.angle,
        length: s.length,
        boosting: s.boosting,
        alive: s.alive,
        killCount: s.killCount,
        color: s.color,
      })),
      pellets: this.state.pellets,
      tick: this.state.tick,
    }
  }
}
