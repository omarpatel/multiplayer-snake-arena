'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import MobileControls from './MobileControls'

interface GameCanvasProps {
  mode: string
  nickname: string
}

interface GameOver {
  winnerId: string | null
  winnerName: string | null
  players: Array<{ id: string; name: string; isBot: boolean; finalLength: number; killCount: number; survivalTime: number }>
}

interface LobbySnapshot {
  players: Array<{ id: string; nickname: string; isBot: boolean }>
  playerCount: number
  requiredPlayers: number
}

export default function GameCanvas({ mode, nickname }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const [gameState, setGameState] = useState<any>(null)
  const [mySnakeId, setMySnakeId] = useState<string | null>(null)
  const [lobbyId, setLobbyId] = useState<string | null>(null)
  const [gameOver, setGameOver] = useState<GameOver | null>(null)
  const [isDead, setIsDead] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [killFeed, setKillFeed] = useState<Array<{ killer: string; victim: string; time: number }>>([])
  const [lobbyPlayers, setLobbyPlayers] = useState<Array<{ id: string; nickname: string; isBot: boolean }>>([])
  const [lobbyInfo, setLobbyInfo] = useState<{ current: number; required: number } | null>(null)
  const [isConnecting, setIsConnecting] = useState(true)
  const inputRef = useRef({ angle: 0, boosting: false })
  const cameraRef = useRef({ x: 0, y: 0 })
  const lastInputSentRef = useRef(0)

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ['websocket'],
    })
    socketRef.current = socket

    const applyLobby = (data: LobbySnapshot) => {
      setLobbyPlayers(data.players || [])
      setLobbyInfo({ current: data.playerCount || 0, required: data.requiredPlayers || 5 })
    }

    socket.on('connect', () => {
      setIsConnecting(false)
      socket.emit('join', { mode, nickname })
    })

    socket.on('joined', (data: LobbySnapshot & { playerId: string; lobbyId: string }) => {
      setMySnakeId(data.playerId)
      setLobbyId(data.lobbyId)
      applyLobby(data)
    })

    socket.on('join_error', (data: { message: string }) => setJoinError(data.message))
    socket.on('lobby_update', applyLobby)

    socket.on('game_state', (state: any) => {
      setGameState(state)
      const mine = state.snakes.find((s: any) => s.id === socket.id)
      if (mine && !mine.alive) setIsDead(true)
    })

    socket.on('game_end', (data: GameOver) => setGameOver(data))

    socket.on('player_killed', (data: { killer: string; victim: string }) => {
      setKillFeed(prev => [...prev, { ...data, time: Date.now() }].slice(-5))
    })

    return () => {
      socket.disconnect()
    }
  }, [mode, nickname])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !gameState) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size only if changed
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    // Find my snake
    const mySnake = gameState.snakes.find((s: any) => s.id === mySnakeId)
    
    // Update camera to follow player (smooth)
    if (mySnake && mySnake.segments.length > 0) {
      const targetX = mySnake.segments[0].x - canvas.width / 2
      const targetY = mySnake.segments[0].y - canvas.height / 2
      cameraRef.current.x += (targetX - cameraRef.current.x) * 0.1
      cameraRef.current.y += (targetY - cameraRef.current.y) * 0.1
    }

    // Clear canvas
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 1
    const gridSize = 50
    for (let x = -cameraRef.current.x % gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = -cameraRef.current.y % gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Draw pellets (optimized - batch by color)
    const viewPadding = 50
    const visiblePellets = gameState.pellets.filter((pellet: any) => {
      const x = pellet.position.x - cameraRef.current.x
      const y = pellet.position.y - cameraRef.current.y
      return x > -viewPadding && x < canvas.width + viewPadding && 
             y > -viewPadding && y < canvas.height + viewPadding
    })

    // Batch draw by color for performance
    const pelletsByColor: { [key: string]: any[] } = {}
    visiblePellets.forEach((pellet: any) => {
      const radius = pellet.radius || 5
      let color = '#fff'
      if (radius <= 3) color = '#fff'
      else if (radius <= 5) color = '#4ade80'
      else color = '#fbbf24'
      
      if (!pelletsByColor[color]) pelletsByColor[color] = []
      pelletsByColor[color].push(pellet)
    })

    // Draw each color batch
    Object.entries(pelletsByColor).forEach(([color, pellets]) => {
      ctx.fillStyle = color
      pellets.forEach((pellet: any) => {
        const x = pellet.position.x - cameraRef.current.x
        const y = pellet.position.y - cameraRef.current.y
        const radius = pellet.radius || 5
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      })
    })

    // Draw snakes
    for (const snake of gameState.snakes) {
      if (!snake.alive || snake.segments.length === 0) continue

      ctx.strokeStyle = snake.color
      ctx.lineWidth = 20
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Draw glow
      ctx.shadowBlur = 20
      ctx.shadowColor = snake.color

      ctx.beginPath()
      const firstSeg = snake.segments[0]
      ctx.moveTo(firstSeg.x - cameraRef.current.x, firstSeg.y - cameraRef.current.y)

      for (let i = 1; i < snake.segments.length; i++) {
        const seg = snake.segments[i]
        ctx.lineTo(seg.x - cameraRef.current.x, seg.y - cameraRef.current.y)
      }
      ctx.stroke()

      // Draw head
      ctx.shadowBlur = 0
      ctx.fillStyle = snake.color
      ctx.beginPath()
      ctx.arc(
        firstSeg.x - cameraRef.current.x,
        firstSeg.y - cameraRef.current.y,
        12,
        0,
        Math.PI * 2
      )
      ctx.fill()

      // Name and length above the head
      ctx.fillStyle = '#fff'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(
        `${snake.name} · ${Math.floor(snake.length)}`,
        firstSeg.x - cameraRef.current.x,
        firstSeg.y - cameraRef.current.y - 20
      )
    }
  }, [gameState, mySnakeId])

  useEffect(() => {
    const INPUT_THROTTLE = 50 // Send input every 50ms (20 times per second)

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas || !mySnakeId || !gameState) return

      const mySnake = gameState.snakes.find((s: any) => s.id === mySnakeId)
      if (!mySnake || !mySnake.segments || mySnake.segments.length === 0) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left + cameraRef.current.x
      const mouseY = e.clientY - rect.top + cameraRef.current.y

      const dx = mouseX - mySnake.segments[0].x
      const dy = mouseY - mySnake.segments[0].y
      const angle = Math.atan2(dy, dx)

      inputRef.current.angle = angle
      
      // Throttle input sending
      const now = Date.now()
      if (now - lastInputSentRef.current >= INPUT_THROTTLE) {
        socketRef.current?.emit('player_input', inputRef.current)
        lastInputSentRef.current = now
      }
    }

    let isMouseDown = false
    let isSpaceDown = false

    const updateBoostState = () => {
      const shouldBoost = isMouseDown || isSpaceDown
      if (inputRef.current.boosting !== shouldBoost) {
        inputRef.current.boosting = shouldBoost
        socketRef.current?.emit('player_input', inputRef.current)
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (!gameState) return
      isMouseDown = true
      updateBoostState()
    }

    const handleMouseUp = () => {
      if (!gameState) return
      isMouseDown = false
      updateBoostState()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && gameState && !isSpaceDown) {
        e.preventDefault()
        isSpaceDown = true
        updateBoostState()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && gameState) {
        e.preventDefault()
        isSpaceDown = false
        updateBoostState()
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, mySnakeId])

  const handleMobileInput = (angle: number, boosting: boolean) => {
    inputRef.current = { angle, boosting }
    socketRef.current?.emit('player_input', inputRef.current)
  }

  return (
    <div className="relative w-full h-screen bg-black">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Waiting Room */}
      {!gameState && (
        <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-24 h-24 rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center mx-auto mb-6 animate-pulse">
                <div className="text-4xl">🎮</div>
              </div>
              <h2 className="text-5xl font-bold text-green-400 mb-3">
                {joinError ? 'Could not join' : isConnecting ? 'Connecting...' : 'Waiting Room'}
              </h2>
              {joinError && <p className="text-red-400 text-lg">{joinError}</p>}
              {lobbyId && <p className="text-gray-400 text-lg">Lobby: {lobbyId.slice(0, 8)}...</p>}
              {isConnecting && (
                <p className="text-gray-500 text-sm mt-2">Connecting to {process.env.NEXT_PUBLIC_SOCKET_URL}...</p>
              )}
            </div>

            {/* Player Count */}
            {lobbyInfo && (
              <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-green-500/30 rounded-2xl p-6 mb-6">
                <div className="text-center mb-4">
                  <div className="text-6xl font-bold text-green-400 mb-2">
                    {lobbyInfo.current} / {lobbyInfo.required}
                  </div>
                  <p className="text-xl text-gray-400">
                    {lobbyInfo.current >= lobbyInfo.required 
                      ? '🎉 Starting soon...' 
                      : `Waiting for ${lobbyInfo.required - lobbyInfo.current} more player${lobbyInfo.required - lobbyInfo.current !== 1 ? 's' : ''}...`
                    }
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${(lobbyInfo.current / lobbyInfo.required) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Players List */}
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-green-500/30 rounded-2xl p-6">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <span>👥</span>
                <span>Players in Lobby</span>
              </h3>
              
              {lobbyPlayers.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lobbyPlayers.map((player, index) => (
                    <div 
                      key={player.id}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        player.id === mySnakeId 
                          ? 'bg-green-500/20 border-2 border-green-500' 
                          : 'bg-gray-800/50 border border-gray-700'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center font-bold text-green-400">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white">
                          {player.nickname}
                          {player.id === mySnakeId && (
                            <span className="ml-2 text-xs bg-green-500 text-black px-2 py-1 rounded-full">YOU</span>
                          )}
                        </p>
                      </div>
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No players yet...</p>
                </div>
              )}
            </div>

            {/* Loading Animation */}
            <div className="flex items-center justify-center gap-2 mt-6">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}
      
      {/* Death Overlay */}
      {isDead && !gameOver && (
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/50 to-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="mb-6 animate-pulse">
              <h2 className="text-8xl font-bold mb-4" style={{ textShadow: '0 0 30px #ef4444' }}>
                💀
              </h2>
              <h3 className="text-6xl font-bold text-red-500 mb-2" style={{ textShadow: '0 0 20px #ef4444' }}>
                ELIMINATED
              </h3>
            </div>
            <p className="text-2xl text-gray-300">Spectating remaining players...</p>
          </div>
        </div>
      )}
      
      {/* Victory Screen */}
      {gameOver && (
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/95 to-black flex items-center justify-center z-50">
          <div className="text-center max-w-3xl w-full p-8">
            <div className="text-8xl mb-4">{gameOver.winnerId === mySnakeId ? '🏆' : '🐍'}</div>
            <h1 className="text-6xl font-bold mb-4 neon-text">
              {gameOver.winnerId === mySnakeId ? 'VICTORY!' : 'GAME OVER'}
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              {gameOver.winnerName ? <>Winner: <span className="text-white font-bold">{gameOver.winnerName}</span></> : 'No survivors'}
            </p>

            <table className="w-full text-left mb-8 text-sm md:text-base">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-2">Player</th>
                  <th className="py-2 text-right">Length</th>
                  <th className="py-2 text-right">Kills</th>
                  <th className="py-2 text-right">Survived</th>
                </tr>
              </thead>
              <tbody>
                {gameOver.players.map(p => (
                  <tr key={p.id} className={p.id === mySnakeId ? 'text-green-400 font-bold' : 'text-gray-200'}>
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 text-right">{p.finalLength}</td>
                    <td className="py-1 text-right">{p.killCount}</td>
                    <td className="py-1 text-right">{p.survivalTime}s</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-4 justify-center flex-wrap">
              <button
                onClick={() => window.location.reload()}
                className="neon-button px-10 py-4 rounded-xl font-bold text-xl smooth-transition"
              >
                Play Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-10 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-xl smooth-transition border-2 border-gray-700"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* HUD - Top Left */}
      <div className="absolute top-2 md:top-4 left-2 md:left-4 space-y-2 md:space-y-3">
        {/* Lobby Info */}
        <div className="neon-border-green bg-black bg-opacity-80 backdrop-blur-sm p-2 md:p-4 rounded-lg md:rounded-xl">
          <p className="text-xs text-gray-400 mb-1">LOBBY</p>
          <p className="text-sm md:text-base text-white font-bold">{lobbyId?.slice(0, 8) ?? '...'}</p>
        </div>

        {/* Player Stats */}
        {gameState && mySnakeId && (() => {
          const mySnake = gameState.snakes.find((s: any) => s.id === mySnakeId)
          const minBoostLength = 15
          const canBoost = mySnake && mySnake.length >= minBoostLength
          
          return mySnake ? (
            <div className="neon-border-green bg-black bg-opacity-80 backdrop-blur-sm p-2 md:p-4 rounded-lg md:rounded-xl">
              <p className="text-xs text-gray-400 mb-1 md:mb-2">YOUR STATS</p>
              <div className="space-y-1 md:space-y-2">
                <div className="flex justify-between gap-2 md:gap-4">
                  <span className="text-gray-300 text-xs md:text-sm">Length</span>
                  <span className="text-green-400 font-bold text-base md:text-lg">{Math.floor(mySnake.length)}</span>
                </div>
                
                {/* Boost Status */}
                <div className="pt-2 border-t border-gray-700">
                  {mySnake.boosting ? (
                    <div className="flex items-center gap-2 px-2 py-1 bg-yellow-500 bg-opacity-20 rounded">
                      <span className="text-yellow-400 text-xs font-bold">🚀 BOOSTING</span>
                    </div>
                  ) : canBoost ? (
                    <div className="flex items-center gap-2 px-2 py-1 bg-green-500 bg-opacity-20 rounded">
                      <span className="text-green-400 text-xs font-bold">✓ Boost Ready</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-700 bg-opacity-50 rounded">
                      <span className="text-gray-400 text-xs">Need {minBoostLength - Math.floor(mySnake.length)} more</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1 text-center">Hold Click/Space</p>
                </div>
              </div>
            </div>
          ) : null
        })()}

        {/* Players Alive */}
        {gameState && (
          <div className="neon-border-purple bg-black bg-opacity-80 backdrop-blur-sm p-2 md:p-4 rounded-lg md:rounded-xl">
            <p className="text-xs text-gray-400 mb-1">ALIVE</p>
            <p className="text-purple-400 font-bold text-xl md:text-2xl">
              {gameState.snakes.filter((s: any) => s.alive).length}
            </p>
          </div>
        )}
      </div>

      {/* Leaderboard - Top Right */}
      <div className="absolute top-2 md:top-4 right-2 md:right-4 neon-border-green bg-black bg-opacity-80 backdrop-blur-sm p-2 md:p-4 rounded-lg md:rounded-xl min-w-[180px] md:min-w-[250px]">
        <h3 className="text-green-400 font-bold mb-2 md:mb-3 text-sm md:text-lg flex items-center gap-1 md:gap-2">
          <span className="text-base md:text-xl">🏆</span>
          <span className="hidden md:inline">TOP PLAYERS</span>
          <span className="md:hidden">TOP</span>
        </h3>
        <div className="space-y-1 md:space-y-2">
          {gameState?.snakes
            .filter((s: any) => s.alive)
            .sort((a: any, b: any) => b.length - a.length)
            .slice(0, 5)
            .map((snake: any, idx: number) => (
              <div
                key={snake.id}
                className={`flex justify-between items-center p-1 md:p-2 rounded ${
                  idx === 0 ? 'bg-yellow-500 bg-opacity-20' : 'bg-gray-800 bg-opacity-50'
                }`}
              >
                <div className="flex items-center gap-1 md:gap-2">
                  <span className={`font-bold text-xs md:text-sm ${idx === 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {idx + 1}
                  </span>
                  <span className="text-white text-xs md:text-sm truncate max-w-[120px]">
                    {snake.name}
                  </span>
                </div>
                <span className="text-green-400 font-bold text-xs md:text-base">{Math.floor(snake.length)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Kill Feed - Top Center */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 space-y-2 min-w-[300px]">
        {killFeed.filter(k => Date.now() - k.time < 5000).map((kill, idx) => (
          <div
            key={idx}
            className="bg-red-900 bg-opacity-90 backdrop-blur-sm px-6 py-3 rounded-xl text-white text-sm font-bold border-2 border-red-500 shadow-lg animate-fade-in"
          >
            <span className="text-red-400">💀</span>
            {' '}
            <span className="text-white">{kill.killer}</span>
            {' '}
            <span className="text-gray-400">eliminated</span>
            {' '}
            <span className="text-white">{kill.victim}</span>
          </div>
        ))}
      </div>

      {/* Mobile Controls */}
      <MobileControls onInput={handleMobileInput} />
    </div>
  )
}
