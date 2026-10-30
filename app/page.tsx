'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_MODES, GameMode } from '@/shared/types'

export default function Home() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')

  useEffect(() => {
    setNickname(localStorage.getItem('playerNickname') ?? '')
  }, [])

  const name = nickname.trim()

  const play = (mode: GameMode) => {
    localStorage.setItem('playerNickname', name)
    router.push(`/game?mode=${mode}&nickname=${encodeURIComponent(name)}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white">
      <nav className="border-b border-green-500/20 bg-black/50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <span className="text-2xl font-bold text-green-400">Snake Arena</span>
          <a href="/leaderboard" className="px-4 py-2 text-gray-300 hover:text-green-400 transition-colors">
            Leaderboard
          </a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-6xl font-bold mb-3 bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 bg-clip-text text-transparent">
            Snake Arena
          </h1>
          <p className="text-lg text-gray-400">Last snake alive wins. Empty seats are filled with bots.</p>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-green-500/30 rounded-2xl p-6 mb-6">
          <label htmlFor="nickname" className="block text-sm font-bold text-gray-300 mb-2">
            Nickname
          </label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="Enter your nickname..."
            maxLength={20}
            className="w-full px-4 py-3 bg-black/50 border-2 border-gray-700 rounded-xl text-white text-lg focus:outline-none focus:border-green-500 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {(Object.keys(GAME_MODES) as GameMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => play(mode)}
              disabled={!name}
              className="bg-gradient-to-br from-green-600 to-emerald-700 p-6 rounded-2xl border-2 border-green-400 hover:scale-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <h3 className="text-2xl font-bold mb-1">{GAME_MODES[mode].label}</h3>
              <p className="text-sm text-green-100">Round starts when the lobby is full</p>
            </button>
          ))}
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-sm text-gray-300 space-y-2">
          <h2 className="text-lg font-bold text-white">How to play</h2>
          <p>Steer with the mouse (or the on-screen joystick on touch devices).</p>
          <p>Hold click or Space to boost once your snake is at least 15 long.</p>
          <p>Eat pellets to grow. Run your head into another snake&apos;s body and you die; it gets the kill.</p>
          <p>Head-on collisions go to the longer snake.</p>
        </div>
      </div>
    </div>
  )
}
