'use client'

import { useEffect, useState } from 'react'
import Button from './Button'

export const PAGE_SIZES = [25, 50, 100]

export default function Pagination({
  total,
  page,
  limit,
  onPageChange,
  onLimitChange,
  unit = 'records',
}: {
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  unit?: string
}) {
  if (total === 0) return null

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
      <p className="text-sm text-text-muted">
        Showing {from}-{to} of {total} {unit}
      </p>
      <div className="flex items-center gap-3">
        <select
          value={limit}
          onChange={e => onLimitChange(Number(e.target.value))}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
        </select>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</Button>
        <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</Button>
      </div>
    </div>
  )
}

/**
 * Fetches one page of a `{ [key]: rows, total }` endpoint and owns the
 * page/limit state that <Pagination /> drives.
 *
 *   const meds = usePaged<Medication>(`/api/patients/${id}/medications`, 'medications')
 *   ...
 *   <Pagination {...meds} onPageChange={meds.setPage} onLimitChange={meds.setLimit} />
 *
 * Pass `url: null` to skip fetching (e.g. while the tab is not visible).
 * Extra fields on the response are available via `data`.
 */
export function usePaged<T>(url: string | null, key: string) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(PAGE_SIZES[0])
  const [result, setResult] = useState<{
    token: string
    rows: T[]
    total: number
    data: Record<string, unknown> | null
  }>({ token: '', rows: [], total: 0, data: null })

  // One token per (url, page, limit); `loading` is simply "no response for the
  // token we're currently asking about" — no setState needed in the effect body.
  const token = url ? `${url}|${page}|${limit}` : ''
  const loading = url !== null && result.token !== token

  useEffect(() => {
    if (!url) return
    let stale = false
    fetch(`${url}${url.includes('?') ? '&' : '?'}page=${page}&limit=${limit}`)
      .then(r => r.json())
      .then(data => {
        if (!stale) setResult({
          token,
          rows: Array.isArray(data?.[key]) ? data[key] : [],
          total: data?.total ?? 0,
          data,
        })
      })
      .catch(() => { if (!stale) setResult({ token, rows: [], total: 0, data: null }) })
    return () => { stale = true }
  }, [url, key, page, limit, token])

  return {
    rows: result.rows,
    total: result.total,
    data: result.data,
    page,
    limit,
    loading,
    setPage,
    // A different page size invalidates the current page number.
    setLimit: (l: number) => { setLimit(l); setPage(1) },
  }
}
