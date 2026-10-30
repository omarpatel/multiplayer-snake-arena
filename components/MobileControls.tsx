'use client'

import { useEffect, useRef, useState } from 'react'

interface MobileControlsProps {
  onInput: (angle: number, boosting: boolean) => void
}

export default function MobileControls({ onInput }: MobileControlsProps) {
  const joystickRef = useRef<HTMLDivElement>(null)
  const [boosting, setBoosting] = useState(false)
  const [angle, setAngle] = useState(0)
  const touchIdRef = useRef<number | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (!joystickRef.current) return
      
      const touch = e.touches[0]
      touchIdRef.current = touch.identifier

      const rect = joystickRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      updateAngle(touch.clientX, touch.clientY, centerX, centerY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!joystickRef.current || touchIdRef.current === null) return

      const touch = Array.from(e.touches).find(t => t.identifier === touchIdRef.current)
      if (!touch) return

      const rect = joystickRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      updateAngle(touch.clientX, touch.clientY, centerX, centerY)
    }

    const handleTouchEnd = () => {
      touchIdRef.current = null
    }

    const updateAngle = (x: number, y: number, centerX: number, centerY: number) => {
      const dx = x - centerX
      const dy = y - centerY
      const newAngle = Math.atan2(dy, dx)
      setAngle(newAngle)
      onInput(newAngle, boosting)
    }

    const joystick = joystickRef.current
    if (joystick) {
      joystick.addEventListener('touchstart', handleTouchStart)
      joystick.addEventListener('touchmove', handleTouchMove)
      joystick.addEventListener('touchend', handleTouchEnd)
    }

    return () => {
      if (joystick) {
        joystick.removeEventListener('touchstart', handleTouchStart)
        joystick.removeEventListener('touchmove', handleTouchMove)
        joystick.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [boosting, onInput])

  const handleBoostStart = () => {
    setBoosting(true)
    onInput(angle, true)
  }

  const handleBoostEnd = () => {
    setBoosting(false)
    onInput(angle, false)
  }

  return (
    <div className="md:hidden pointer-events-none">
      {/* Joystick */}
      <div className="fixed bottom-6 left-6 pointer-events-auto">
        <div
          ref={joystickRef}
          className="w-36 h-36 bg-black bg-opacity-60 backdrop-blur-sm rounded-full border-4 border-green-500 flex items-center justify-center shadow-2xl"
          style={{ touchAction: 'none' }}
        >
          <div className="w-16 h-16 bg-green-500 rounded-full shadow-lg" style={{
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.6)'
          }}></div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2 font-bold">MOVE</p>
      </div>

      {/* Boost Button */}
      <div className="fixed bottom-6 right-6 pointer-events-auto">
        <button
          onTouchStart={handleBoostStart}
          onTouchEnd={handleBoostEnd}
          className={`w-28 h-28 rounded-full font-bold text-lg shadow-2xl transition-all ${
            boosting 
              ? 'bg-yellow-500 border-4 border-yellow-300' 
              : 'bg-green-600 border-4 border-green-400'
          }`}
          style={{
            touchAction: 'none',
            boxShadow: boosting 
              ? '0 0 30px rgba(234, 179, 8, 0.8)' 
              : '0 0 20px rgba(0, 255, 136, 0.6)'
          }}
        >
          {boosting ? '🚀' : '⚡'}
          <div className="text-xs mt-1">BOOST</div>
        </button>
      </div>
    </div>
  )
}
