import { cn } from '@/lib/utils'

type BadgeVariant = 'paid' | 'pending' | 'cancelled' | 'info'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variants: Record<BadgeVariant, string> = {
  paid: 'bg-[rgba(76,175,130,0.15)] text-[#4CAF82]',
  pending: 'bg-[rgba(240,160,112,0.15)] text-[#F0A070]',
  cancelled: 'bg-[rgba(224,90,90,0.15)] text-[#E05A5A]',
  info: 'bg-[rgba(155,127,232,0.15)] text-[#9B7FE8]',
}

export default function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold', variants[variant], className)}>
      {children}
    </span>
  )
}
