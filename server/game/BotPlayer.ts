import { PlayerInput, GAME_CONFIG, Vector2, Snake, Pellet } from '../../shared/types'

export class BotPlayer {
  private id: string
  private currentAngle: number = Math.random() * Math.PI * 2
  private targetAngle: number = this.currentAngle
  private changeDirectionTimer: number = 0
  private boostTimer: number = 0
  private difficulty: number // 0-1, higher = smarter

  constructor(id: string, difficulty: number = 0.5) {
    this.id = id
    this.difficulty = difficulty
  }

  public getInput(mySnake?: Snake, allSnakes?: Snake[], pellets?: Pellet[]): PlayerInput {
    if (!mySnake || !mySnake.segments[0]) {
      // Fallback to random movement
      return this.getRandomInput()
    }

    const head = mySnake.segments[0]
    
    // Check for dangers and opportunities
    const dangerAngle = this.findDangerDirection(head, allSnakes || [])
    const pelletAngle = this.findNearestPellet(head, pellets || [])
    const wallAngle = this.findWallAvoidance(head)

    // Decision making based on difficulty
    if (dangerAngle !== null && Math.random() < this.difficulty) {
      // Avoid danger
      this.targetAngle = dangerAngle
    } else if (wallAngle !== null) {
      // Avoid walls (always)
      this.targetAngle = wallAngle
    } else if (pelletAngle !== null && Math.random() < this.difficulty * 0.7) {
      // Seek pellets
      this.targetAngle = pelletAngle
    } else {
      // Random movement
      this.changeDirectionTimer++
      if (this.changeDirectionTimer > 60 + Math.random() * 180) {
        this.targetAngle = Math.random() * Math.PI * 2
        this.changeDirectionTimer = 0
      }
    }

    // Smoothly turn towards target angle
    let angleDiff = this.targetAngle - this.currentAngle
    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2
    
    this.currentAngle += angleDiff * 0.08

    // Smart boosting: boost when chasing pellets or escaping danger
    this.boostTimer++
    const shouldBoost = mySnake.length >= GAME_CONFIG.SNAKE_MIN_BOOST_LENGTH && 
                       (dangerAngle !== null || (pelletAngle !== null && Math.random() < 0.3))

    return {
      angle: this.currentAngle,
      boosting: shouldBoost,
    }
  }

  private getRandomInput(): PlayerInput {
    this.changeDirectionTimer++
    if (this.changeDirectionTimer > 60 + Math.random() * 180) {
      this.targetAngle = Math.random() * Math.PI * 2
      this.changeDirectionTimer = 0
    }

    let angleDiff = this.targetAngle - this.currentAngle
    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2
    this.currentAngle += angleDiff * 0.05

    return {
      angle: this.currentAngle,
      boosting: false,
    }
  }

  private findDangerDirection(head: Vector2, snakes: Snake[]): number | null {
    const dangerDistance = 150
    
    for (const snake of snakes) {
      if (snake.id === this.id || !snake.alive) continue
      
      for (const segment of snake.segments) {
        const dx = segment.x - head.x
        const dy = segment.y - head.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < dangerDistance) {
          // Move away from danger
          const dangerAngle = Math.atan2(dy, dx)
          return dangerAngle + Math.PI // Opposite direction
        }
      }
    }
    
    return null
  }

  private findNearestPellet(head: Vector2, pellets: Pellet[]): number | null {
    if (pellets.length === 0) return null
    
    let nearest: Pellet | null = null
    let nearestDist = Infinity
    const searchRadius = 300
    
    for (const pellet of pellets) {
      const dx = pellet.position.x - head.x
      const dy = pellet.position.y - head.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < searchRadius && distance < nearestDist) {
        nearest = pellet
        nearestDist = distance
      }
    }
    
    if (nearest) {
      const dx = nearest.position.x - head.x
      const dy = nearest.position.y - head.y
      return Math.atan2(dy, dx)
    }
    
    return null
  }

  private findWallAvoidance(head: Vector2): number | null {
    const margin = 200
    const mapWidth = GAME_CONFIG.MAP_WIDTH
    const mapHeight = GAME_CONFIG.MAP_HEIGHT
    
    // Check if near any wall
    if (head.x < margin) {
      // Near left wall, go right
      return 0
    } else if (head.x > mapWidth - margin) {
      // Near right wall, go left
      return Math.PI
    } else if (head.y < margin) {
      // Near top wall, go down
      return Math.PI / 2
    } else if (head.y > mapHeight - margin) {
      // Near bottom wall, go up
      return -Math.PI / 2
    }
    
    return null
  }

  public getId(): string {
    return this.id
  }
}
