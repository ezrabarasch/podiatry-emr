import type { ReactNode } from 'react'

export default function Card({
  children,
  className = '',
  padding = 'p-6',
}: {
  children: ReactNode
  className?: string
  padding?: string
}) {
  return (
    <div className={`bg-surface rounded-xl border border-border ${padding} ${className}`}>
      {children}
    </div>
  )
}
