'use client'

import { useEffect, useState } from 'react'
import type { LeaderboardEntry } from '@/server/history'
import type { MatchResult } from '@/shared/types'

const SERVER = process.env.NEXT_PUBLIC_SOCKET_URL

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${SERVER}/api/leaderboard`).then(r => r.json()),
      fetch(`${SERVER}/api/matches`).then(r => r.json()),
    ])
      .then(([l, m]) => {
        setLeaders(l)
        setMatches(m)
      })
      .catch(() => setError(`Could not reach the game server at ${SERVER}`))
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white">
      <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <span className="text-2xl font-bold text-green-400">Snake Arena</span>
        <a href="/" className="neon-button-outline px-6 py-2 rounded-lg font-bold smooth-transition">
          ← Play
        </a>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {error && <p className="text-red-400 text-center">{error}</p>}

        <section>
          <h1 className="text-3xl font-bold text-green-400 mb-1">Leaderboard</h1>
          <p className="text-gray-500 text-sm mb-4">Human players only, since the server started.</p>
          {leaders.length === 0 ? (
            <p className="text-gray-400">No finished games yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-2">#</th>
                  <th className="py-2">Player</th>
                  <th className="py-2 text-right">Wins</th>
                  <th className="py-2 text-right">Games</th>
                  <th className="py-2 text-right">Kills</th>
                  <th className="py-2 text-right">Best length</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((p, i) => (
                  <tr key={p.name} className="border-b border-gray-800">
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 font-bold">{p.name}</td>
                    <td className="py-2 text-right text-yellow-400">{p.wins}</td>
                    <td className="py-2 text-right">{p.games}</td>
                    <td className="py-2 text-right">{p.kills}</td>
                    <td className="py-2 text-right text-green-400">{p.bestLength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-bold text-green-400 mb-4">Recent matches</h2>
          {matches.length === 0 ? (
            <p className="text-gray-400">No finished games yet.</p>
          ) : (
            <ul className="space-y-2">
              {matches.map(m => (
                <li key={m.id} className="flex justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                  <span>
                    <span className="text-gray-400">{m.players.length} players · </span>
                    winner <span className="font-bold">{m.winnerName ?? 'none'}</span>
                  </span>
                  <span className="text-gray-400">
                    {m.durationSeconds}s · {new Date(m.endedAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
