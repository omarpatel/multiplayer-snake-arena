'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import GameCanvas from '@/components/GameCanvas'
import { isGameMode } from '@/shared/types'

function GameContent() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const nickname = searchParams.get('nickname')?.trim()

  if (!isGameMode(mode) || !nickname) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-8">
        <p>
          Missing game mode or nickname. <a href="/" className="text-green-400 underline">Start from the home page.</a>
        </p>
      </div>
    )
  }

  return <GameCanvas mode={mode} nickname={nickname} />
}

export default function GamePage() {
  return (
    <Suspense fallback={<div>Loading game...</div>}>
      <GameContent />
    </Suspense>
  )
}
