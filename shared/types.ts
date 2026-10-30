export interface Vector2 {
  x: number
  y: number
}

export interface Snake {
  id: string
  name: string
  isBot: boolean
  segments: Vector2[]
  angle: number
  length: number
  speed: number
  boosting: boolean
  alive: boolean
  killCount: number
  /** Id of the snake that caused this one's death, if any. */
  killedBy?: string
  color: string
}

export interface Pellet {
  id: string
  position: Vector2
  value: number
  radius?: number
}

export interface GameState {
  snakes: Map<string, Snake>
  pellets: Pellet[]
  tick: number
  startTime: number
}

export interface PlayerInput {
  angle: number
  boosting: boolean
}

export const GAME_CONFIG = {
  TICK_RATE: 30,
  TICK_MS: 1000 / 30,
  MAP_WIDTH: 4000,
  MAP_HEIGHT: 4000,
  SNAKE_BASE_SPEED: 4,
  SNAKE_BOOST_SPEED: 8,
  SNAKE_INITIAL_LENGTH: 10,
  SNAKE_MIN_BOOST_LENGTH: 15, // need at least this length to boost
  SNAKE_RADIUS: 10,
  SNAKE_TURN_SPEED: 0.12, // max radians per tick
  PELLET_VALUE: 2,
  PELLET_RADIUS: 5,
}

export const GAME_MODES = {
  SMALL: { label: '5 players', minPlayers: 5, maxPlayers: 5 },
  LARGE: { label: '10 players', minPlayers: 10, maxPlayers: 10 },
} as const

export type GameMode = keyof typeof GAME_MODES

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GAME_MODES, value)
}

export interface LobbyPlayer {
  id: string
  name: string
  isBot: boolean
}

export interface LobbyConfig {
  id: string
  mode: GameMode
  minPlayers: number
  maxPlayers: number
  status: 'waiting' | 'active' | 'finished'
  players: LobbyPlayer[]
}

export interface PlayerResult {
  id: string
  name: string
  isBot: boolean
  finalLength: number
  killCount: number
  survivalTime: number
}

export interface MatchResult {
  id: string
  mode: GameMode
  winnerId: string | null
  winnerName: string | null
  endedAt: number
  durationSeconds: number
  players: PlayerResult[]
}
