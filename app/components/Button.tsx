'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary hover:bg-primary-dark text-white border-transparent',
  secondary: 'bg-surface hover:bg-slate-50 text-text border-border',
  danger: 'bg-danger hover:brightness-90 text-white border-transparent',
  ghost: 'bg-transparent hover:bg-slate-100 text-text-muted border-transparent',
}

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-sm px-6 py-2.5',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...rest
}: {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg border transition-colors disabled:bg-slate-300 disabled:border-transparent disabled:text-white disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}
