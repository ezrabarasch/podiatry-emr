import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  label: string
  width?: string
  render?: (row: T) => ReactNode
}

export default function Table<T extends { id?: string }>({
  columns,
  rows,
  onRowClick,
  empty = 'No records found.',
}: {
  columns: Column<T>[]
  rows: T[]
  onRowClick?: (row: T) => void
  empty?: string
}) {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {rows.length === 0 ? (
        <div className="p-8 text-center text-text-muted text-sm">{empty}</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              {columns.map(c => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-slate-100 transition-colors ${
                  onRowClick ? 'hover:bg-blue-50 cursor-pointer' : ''
                } ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}
              >
                {columns.map(c => (
                  <td key={c.key} className="px-5 py-4 text-sm text-text">
                    {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
