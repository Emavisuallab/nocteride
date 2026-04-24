'use client'

import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-bold transition-all duration-200 rounded-full disabled:opacity-50 disabled:cursor-not-allowed'
    const variants = {
      primary: 'bg-[#9B7FE8] text-[#0D0D14] shadow-[0_2px_16px_rgba(155,127,232,0.35)] hover:bg-[#7B5FD8] active:scale-[0.97]',
      secondary: 'bg-[#2A2A45] text-[#F0F0FF] hover:bg-[#3A3A55]',
      danger: 'bg-[#E05A5A] text-white hover:bg-[#C04040]',
      ghost: 'bg-transparent text-[#BBBBDD] hover:bg-[#1A1A2E]',
    }
    const sizes = {
      sm: 'h-10 px-4 text-sm',
      md: 'h-12 px-6 text-base',
      lg: 'h-14 px-8 text-base',
    }
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : null}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
