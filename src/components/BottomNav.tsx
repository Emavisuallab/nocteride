'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface BottomNavProps {
  items: NavItem[]
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#13131F] border-t border-[rgba(155,127,232,0.1)] safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-semibold',
                isActive
                  ? 'bg-[#9B7FE8] text-[#0D0D14]'
                  : 'text-[#8888A8] hover:text-[#BBBBDD]'
              )}
            >
              {item.icon}
              {isActive && <span>{item.label}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
