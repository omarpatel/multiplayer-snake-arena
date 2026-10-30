import { Vector2, Snake, Pellet, GAME_CONFIG } from './types'

export function normalizeAngle(angle: number): number {
  while (angle < 0) angle += Math.PI * 2
  while (angle >= Math.PI * 2) angle -= Math.PI * 2
  return angle
}

export function distance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function updateSnakePosition(snake: Snake, targetAngle: number, dt: number): void {
  if (!snake.alive) return

  // Smooth angle transition with max turn speed
  let angleDiff = targetAngle - snake.angle
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
  
  // Turn faster when boosting for better control
  const turnSpeedMultiplier = snake.boosting ? 1.5 : 1.0
  const maxTurn = GAME_CONFIG.SNAKE_TURN_SPEED * turnSpeedMultiplier
  
  if (Math.abs(angleDiff) > maxTurn) {
    angleDiff = angleDiff > 0 ? maxTurn : -maxTurn
  }
  
  snake.angle = normalizeAngle(snake.angle + angleDiff)

  // Calculate speed - can only boost if long enough
  const canBoost = snake.length >= (GAME_CONFIG.SNAKE_MIN_BOOST_LENGTH || 15)
  const speed = (snake.boosting && canBoost) ? GAME_CONFIG.SNAKE_BOOST_SPEED : GAME_CONFIG.SNAKE_BASE_SPEED
  
  // Update boosting state if not long enough
  if (snake.boosting && !canBoost) {
    snake.boosting = false
  }

  // Move head
  const head = snake.segments[0]
  const newHead: Vector2 = {
    x: head.x + Math.cos(snake.angle) * speed,
    y: head.y + Math.sin(snake.angle) * speed,
  }

  // Check boundaries
  if (newHead.x < 0 || newHead.x > GAME_CONFIG.MAP_WIDTH ||
      newHead.y < 0 || newHead.y > GAME_CONFIG.MAP_HEIGHT) {
    snake.alive = false
    return
  }

  // Add new head
  snake.segments.unshift(newHead)

  // One stored head position per unit of length, so the body trails the head by length * speed
  const targetSegments = Math.floor(snake.length)
  while (snake.segments.length > targetSegments && snake.segments.length > 2) {
    snake.segments.pop()
  }
}

export function checkSnakeCollisions(snakes: Snake[]): void {
  const aliveSnakes = snakes.filter(s => s.alive)

  for (let i = 0; i < aliveSnakes.length; i++) {
    const snake = aliveSnakes[i]
    const head = snake.segments[0]

    // Check self collision (skip first few segments)
    for (let j = 5; j < snake.segments.length; j++) {
      if (distance(head, snake.segments[j]) < GAME_CONFIG.SNAKE_RADIUS) {
        snake.alive = false
        break
      }
    }

    // Check collision with other snakes
    for (let j = 0; j < aliveSnakes.length; j++) {
      if (i === j) continue
      const other = aliveSnakes[j]
      // Either snake may already have died earlier in this pass
      if (!snake.alive) break
      if (!other.alive) continue

      // Head to head collision
      if (distance(head, other.segments[0]) < GAME_CONFIG.SNAKE_RADIUS * 2) {
        if (snake.length > other.length) {
          other.alive = false
          other.killedBy = snake.id
          snake.killCount++
          snake.length += other.length * 0.5
        } else if (other.length > snake.length) {
          snake.alive = false
          snake.killedBy = other.id
          other.killCount++
          other.length += snake.length * 0.5
        } else {
          snake.alive = false
          other.alive = false
        }
        continue
      }

      // Head to body collision
      for (let k = 1; k < other.segments.length; k++) {
        if (distance(head, other.segments[k]) < GAME_CONFIG.SNAKE_RADIUS) {
          snake.alive = false
          snake.killedBy = other.id
          other.killCount++
          other.length += snake.length * 0.3
          break
        }
      }
    }
  }
}

export function checkPelletCollisions(snake: Snake, pellets: Pellet[]): Pellet[] {
  if (!snake.alive) return []
  
  const collected: Pellet[] = []
  const head = snake.segments[0]

  for (const pellet of pellets) {
    if (distance(head, pellet.position) < GAME_CONFIG.SNAKE_RADIUS + GAME_CONFIG.PELLET_RADIUS) {
      collected.push(pellet)
      snake.length += pellet.value
    }
  }

  return collected
}

export function generateStaticPelletGrid(): Pellet[] {
  const pellets: Pellet[] = []
  const pelletCount = 500 // Total pellets to spawn

  for (let i = 0; i < pelletCount; i++) {
    // Random position across the map
    const x = Math.random() * GAME_CONFIG.MAP_WIDTH
    const y = Math.random() * GAME_CONFIG.MAP_HEIGHT
    
    // Random size (value affects growth)
    const sizeRoll = Math.random()
    let value: number
    let radius: number
    
    if (sizeRoll < 0.7) {
      // 70% small pellets
      value = 1
      radius = 3
    } else if (sizeRoll < 0.9) {
      // 20% medium pellets
      value = 3
      radius = 5
    } else {
      // 10% large pellets
      value = 5
      radius = 8
    }

    pellets.push({
      id: `pellet-${i}`,
      position: { x, y },
      value,
      radius, // Add radius for rendering
    })
  }

  return pellets
}

export function createPelletsFromDeath(snake: Snake): Pellet[] {
  const pellets: Pellet[] = []
  const pelletCount = Math.floor(snake.length / 10)
  
  for (let i = 0; i < Math.min(pelletCount, snake.segments.length); i++) {
    pellets.push({
      id: `death-${snake.id}-${i}-${Date.now()}`,
      position: { ...snake.segments[i] },
      value: GAME_CONFIG.PELLET_VALUE,
    })
  }

  return pellets
}
