import test from 'node:test'
import assert from 'node:assert/strict'
import { LobbyManager, LobbyManagerOptions } from '../server/game/LobbyManager'
import { MatchHistory } from '../server/history'
import { GAME_MODES, LobbyConfig } from '../shared/types'

function manager(overrides: Partial<LobbyManagerOptions> = {}) {
  const events: string[] = []
  const lm = new LobbyManager({
    botFillMs: 60_000,
    startDelayMs: 60_000,
    onLobbyUpdate: (l: LobbyConfig) => events.push(`update:${l.players.length}`),
    onGameStart: () => events.push('start'),
    onGameEnd: () => events.push('end'),
    ...overrides,
  })
  return { lm, events }
}

test('humans share the open lobby for a mode; modes are separate', () => {
  const { lm } = manager()
  const a = lm.join('SMALL', 'p1', 'Ann')!
  const b = lm.join('SMALL', 'p2', 'Ben')!
  const c = lm.join('LARGE', 'p3', 'Cy')!
  assert.equal(a.id, b.id)
  assert.notEqual(a.id, c.id)
  assert.equal(c.maxPlayers, GAME_MODES.LARGE.maxPlayers)
  assert.equal(lm.join('SMALL', 'p1', 'Ann'), null, 'a player cannot sit in two lobbies')
  lm.shutdown()
})

test('fillWithBots tops the lobby up to its minimum and the round starts', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const { lm, events } = manager({ startDelayMs: 0 })
  const lobby = lm.join('SMALL', 'p1', 'Ann')!
  lm.fillWithBots(lobby.id)
  assert.equal(lobby.players.length, GAME_MODES.SMALL.minPlayers)
  assert.equal(lobby.players.filter(p => p.isBot).length, GAME_MODES.SMALL.minPlayers - 1)
  t.mock.timers.tick(1)
  assert.ok(events.includes('start'))
  assert.equal(lobby.status, 'active')
  assert.ok(lm.getGame(lobby.id))
  lm.shutdown()
})

test('a waiting lobby with no humans left is discarded', () => {
  const { lm } = manager()
  const lobby = lm.join('SMALL', 'p1', 'Ann')!
  lm.leave('p1')
  assert.equal(lm.getLobby(lobby.id), undefined)
  lm.shutdown()
})

test('a running round is stopped when its last human disconnects', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const { lm } = manager({ startDelayMs: 0 })
  const lobby = lm.join('SMALL', 'p1', 'Ann')!
  lm.fillWithBots(lobby.id)
  t.mock.timers.tick(1)
  lm.leave('p1')
  assert.equal(lm.getGame(lobby.id), undefined)
  lm.shutdown()
})

test('a round runs to completion and reports a winner', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  let result: { winnerId: string | null; players: number } | undefined
  const { lm } = manager({
    startDelayMs: 0,
    onGameEnd: (_l, winnerId, results) => { result = { winnerId, players: results.length } },
  })
  const lobby = lm.join('SMALL', 'p1', 'Ann')!
  lm.fillWithBots(lobby.id)
  t.mock.timers.tick(1)
  const game = lm.getGame(lobby.id)!
  // The 30 Hz interval is mocked, so the test drives ticks by hand

  // Everyone except the first snake dies; past the 5 s grace period that ends the round
  const snakes = Array.from(game.state.snakes.values())
  for (const s of snakes.slice(1)) s.alive = false
  game.tick(game.state.startTime + 6000)

  assert.equal(result?.winnerId, snakes[0].id)
  assert.equal(result?.players, GAME_MODES.SMALL.minPlayers)
  assert.equal(lm.getLobby(lobby.id), undefined, 'finished lobbies are cleaned up')
  lm.shutdown()
})

test('match history ranks humans by wins and ignores bots', () => {
  const h = new MatchHistory(2)
  const player = (id: string, name: string, isBot = false) =>
    ({ id, name, isBot, finalLength: 30, killCount: 1, survivalTime: 20 })
  h.record({ id: 'm1', mode: 'SMALL', winnerId: 'a', winnerName: 'Ann', endedAt: 1, durationSeconds: 20, players: [player('a', 'Ann'), player('b', 'Ben'), player('x', 'Bot', true)] })
  h.record({ id: 'm2', mode: 'SMALL', winnerId: 'b', winnerName: 'Ben', endedAt: 2, durationSeconds: 20, players: [player('a', 'Ann'), player('b', 'Ben')] })
  h.record({ id: 'm3', mode: 'SMALL', winnerId: 'b', winnerName: 'Ben', endedAt: 3, durationSeconds: 20, players: [player('b', 'Ben')] })

  assert.deepEqual(h.leaderboard().map(e => [e.name, e.wins, e.games]), [['Ben', 2, 3], ['Ann', 1, 2]])
  assert.deepEqual(h.recent().map(m => m.id), ['m3', 'm2'], 'only the last `limit` matches are kept')
})
