import { MatchResult } from '../shared/types'

export interface LeaderboardEntry {
  name: string
  wins: number
  games: number
  kills: number
  bestLength: number
}

/**
 * In-memory record of finished matches. Keeps the most recent `limit` matches
 * and running per-name totals for humans (bots are excluded from the leaderboard).
 * Everything resets when the server restarts.
 */
export class MatchHistory {
  private matches: MatchResult[] = []
  private totals = new Map<string, LeaderboardEntry>()

  constructor(private limit = 100) {}

  public record(match: MatchResult): void {
    this.matches.unshift(match)
    if (this.matches.length > this.limit) this.matches.length = this.limit

    for (const p of match.players) {
      if (p.isBot) continue
      const key = p.name.toLowerCase()
      const entry = this.totals.get(key) ?? { name: p.name, wins: 0, games: 0, kills: 0, bestLength: 0 }
      entry.games++
      entry.kills += p.killCount
      entry.bestLength = Math.max(entry.bestLength, p.finalLength)
      if (p.id === match.winnerId) entry.wins++
      this.totals.set(key, entry)
    }
  }

  public recent(count = 20): MatchResult[] {
    return this.matches.slice(0, count)
  }

  public get(id: string): MatchResult | undefined {
    return this.matches.find(m => m.id === id)
  }

  /** Sorted by wins, then kills, then best length. */
  public leaderboard(count = 20): LeaderboardEntry[] {
    return Array.from(this.totals.values())
      .sort((a, b) => b.wins - a.wins || b.kills - a.kills || b.bestLength - a.bestLength)
      .slice(0, count)
  }
}
