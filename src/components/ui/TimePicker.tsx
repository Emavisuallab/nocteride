'use client'

import { useState, useRef, useEffect } from 'react'
import { generateTimeSlots } from '@/lib/utils'

interface TimePickerProps {
  value: string
  onChange: (time: string) => void
}

export default function TimePicker({ value, onChange }: TimePickerProps) {
  const slots = generateTimeSlots()
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = slots.indexOf(value)
    return idx >= 0 ? idx : 0
  })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const itemHeight = 48
      containerRef.current.scrollTop = selectedIndex * itemHeight - itemHeight * 2
    }
  }, [selectedIndex])

  return (
    <div className="relative h-[240px] overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 bg-[#9B7FE8]/10 rounded-xl border border-[#9B7FE8]/30 pointer-events-none z-10" />
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="h-24" />
        {slots.map((slot, i) => (
          <button
            key={slot}
            className={`w-full h-12 flex items-center justify-center text-xl snap-center transition-all ${
              i === selectedIndex
                ? 'text-[#F0F0FF] font-bold scale-110'
                : 'text-[#8888A8] font-normal'
            }`}
            onClick={() => {
              setSelectedIndex(i)
              onChange(slot)
            }}
          >
            {slot}
          </button>
        ))}
        <div className="h-24" />
      </div>
    </div>
  )
}
