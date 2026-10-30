import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { LobbyManager } from './game/LobbyManager'
import { MatchHistory } from './history'
import { GAME_CONFIG, LobbyConfig, isGameMode } from '../shared/types'

const PORT = Number(process.env.PORT) || 3001
const APP_URL = process.env.APP_URL || 'http://localhost:3000'
const BOT_FILL_SECONDS = Number(process.env.BOT_FILL_SECONDS ?? 10)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: APP_URL, methods: ['GET', 'POST'] } })
const history = new MatchHistory()

function lobbySummary(lobby: LobbyConfig) {
  return {
    lobbyId: lobby.id,
    mode: lobby.mode,
    status: lobby.status,
    players: lobby.players.map(p => ({ id: p.id, nickname: p.name, isBot: p.isBot })),
    playerCount: lobby.players.length,
    requiredPlayers: lobby.minPlayers,
  }
}

const lobbies = new LobbyManager({
  botFillMs: BOT_FILL_SECONDS * 1000,
  startDelayMs: 3000,
  onLobbyUpdate: lobby => io.to(lobby.id).emit('lobby_update', lobbySummary(lobby)),
  onGameStart: lobby => io.to(lobby.id).emit('game_start', lobbySummary(lobby)),
  onKill: (lobby, killerId, victimId) => {
    const name = (id: string) => lobby.players.find(p => p.id === id)?.name ?? 'unknown'
    io.to(lobby.id).emit('player_killed', { killer: name(killerId), victim: name(victimId) })
  },
  onGameEnd: (lobby, winnerId, results) => {
    const winner = results.find(r => r.id === winnerId)
    const match = {
      id: lobby.id,
      mode: lobby.mode,
      winnerId,
      winnerName: winner?.name ?? null,
      endedAt: Date.now(),
      durationSeconds: Math.max(0, ...results.map(r => r.survivalTime)),
      players: results,
    }
    history.record(match)
    io.to(lobby.id).emit('game_end', match)
    io.in(lobby.id).socketsLeave(lobby.id)
  },
})

/** Trims, strips control characters and caps at 20 characters. Empty result means invalid. */
function cleanNickname(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20)
}

io.on('connection', socket => {
  socket.on('join', (data: { mode?: unknown; nickname?: unknown }) => {
    const nickname = cleanNickname(data?.nickname)
    if (!nickname) return socket.emit('join_error', { message: 'Nickname required' })
    if (!isGameMode(data?.mode)) return socket.emit('join_error', { message: 'Unknown game mode' })

    // The joined event carries the lobby snapshot, since this socket was not in the room for the first lobby_update
    const lobby = lobbies.join(data.mode, socket.id, nickname)
    if (!lobby) return socket.emit('join_error', { message: 'Already in a lobby' })
    socket.join(lobby.id)
    socket.emit('joined', { playerId: socket.id, ...lobbySummary(lobby) })
  })

  socket.on('player_input', (data: { angle?: unknown; boosting?: unknown }) => {
    const lobby = lobbies.getPlayerLobby(socket.id)
    if (!lobby || typeof data?.angle !== 'number') return
    lobbies.getGame(lobby.id)?.updatePlayerInput(socket.id, { angle: data.angle, boosting: data.boosting === true })
  })

  socket.on('disconnect', () => lobbies.leave(socket.id))
})

// Broadcast every running game's state at the simulation rate
setInterval(() => {
  for (const [lobby, game] of lobbies.activeGames()) {
    io.to(lobby.id).emit('game_state', game.getSerializableState())
  }
}, GAME_CONFIG.TICK_MS)

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', APP_URL)
  next()
})
app.get('/health', (_req, res) => res.json({ ok: true, ...lobbies.counts() }))
app.get('/api/leaderboard', (_req, res) => res.json(history.leaderboard()))
app.get('/api/matches', (_req, res) => res.json(history.recent()))
app.get('/api/matches/:id', (req, res) => {
  const match = history.get(req.params.id)
  if (!match) return res.status(404).json({ error: 'not found' })
  res.json(match)
})

httpServer.listen(PORT, () => {
  console.log(`Game server listening on :${PORT} (bots fill empty seats after ${BOT_FILL_SECONDS}s)`)
})
