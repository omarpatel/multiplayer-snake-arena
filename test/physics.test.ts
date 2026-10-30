import test from 'node:test'
import assert from 'node:assert/strict'
import { checkSnakeCollisions, checkPelletCollisions, updateSnakePosition } from '../shared/physics'
import { GAME_CONFIG, Snake } from '../shared/types'

function snake(id: string, segments: Array<[number, number]>, length = 20): Snake {
  return {
    id,
    name: id,
    isBot: false,
    segments: segments.map(([x, y]) => ({ x, y })),
    angle: 0,
    length,
    speed: GAME_CONFIG.SNAKE_BASE_SPEED,
    boosting: false,
    alive: true,
    killCount: 0,
    color: '#fff',
  }
}

test('turning is capped at SNAKE_TURN_SPEED per tick', () => {
  const s = snake('a', [[1000, 1000]])
  updateSnakePosition(s, Math.PI / 2, 1 / 30)
  assert.ok(Math.abs(s.angle - GAME_CONFIG.SNAKE_TURN_SPEED) < 1e-9)
})

test('boost only applies once the snake is long enough', () => {
  const short = snake('a', [[1000, 1000]], GAME_CONFIG.SNAKE_MIN_BOOST_LENGTH - 1)
  short.boosting = true
  updateSnakePosition(short, 0, 1 / 30)
  assert.equal(short.segments[0].x, 1000 + GAME_CONFIG.SNAKE_BASE_SPEED)
  assert.equal(short.boosting, false)

  const long = snake('b', [[1000, 1000]], GAME_CONFIG.SNAKE_MIN_BOOST_LENGTH)
  long.boosting = true
  updateSnakePosition(long, 0, 1 / 30)
  assert.equal(long.segments[0].x, 1000 + GAME_CONFIG.SNAKE_BOOST_SPEED)
})

test('leaving the map kills the snake', () => {
  const s = snake('a', [[GAME_CONFIG.MAP_WIDTH - 1, 1000]])
  updateSnakePosition(s, 0, 1 / 30)
  assert.equal(s.alive, false)
})

test('head into another body kills the mover and credits the owner', () => {
  const victim = snake('victim', [[500, 500]])
  const owner = snake('owner', [[300, 500], [400, 500], [500, 505], [600, 500]])
  checkSnakeCollisions([victim, owner])
  assert.equal(victim.alive, false)
  assert.equal(victim.killedBy, 'owner')
  assert.equal(owner.killCount, 1)
  assert.equal(owner.alive, true)
})

test('head-on collision goes to the longer snake and is only counted once', () => {
  const big = snake('big', [[500, 500]], 40)
  const small = snake('small', [[505, 500]], 20)
  checkSnakeCollisions([big, small])
  assert.equal(small.alive, false)
  assert.equal(small.killedBy, 'big')
  assert.equal(big.alive, true)
  assert.equal(big.killCount, 1)
  assert.equal(big.length, 40 + 20 * 0.5)
})

test('pellets within reach are eaten and add their value', () => {
  const s = snake('a', [[100, 100]], 10)
  const eaten = checkPelletCollisions(s, [
    { id: 'near', position: { x: 105, y: 100 }, value: 3 },
    { id: 'far', position: { x: 300, y: 300 }, value: 5 },
  ])
  assert.deepEqual(eaten.map(p => p.id), ['near'])
  assert.equal(s.length, 13)
})
