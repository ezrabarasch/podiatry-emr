'use client'

import { useEffect, useState, useCallback } from 'react'
import AdminShell from '@/app/admin/AdminShell'

interface SessionLog {
  id: string
  username: string
  ipAddress: string | null
  userAgent: string | null
  action: string
  createdAt: string
}

const ACTIONS = ['LOGIN', 'LOGOUT', 'FAILED', 'LOCKED']

const ACTION_CLS: Record<string, string> = {
  LOGIN: 'bg-green-100 text-green-700',
  LOGOUT: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-yellow-100 text-yellow-700',
  LOCKED: 'bg-red-100 text-red-700',
}

export default function AdminSessionsPage() {
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [action, setAction] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (username.trim()) params.set('username', username.trim())
    if (action) params.set('action', action)
    fetch(`/api/admin/sessions?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setLogs(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [username, action])

  useEffect(() => { load() }, [load])

  const fmt = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

  return (
    <AdminShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">Session Log</h2>
        <p className="text-sm text-slate-500 mt-0.5">Login, logout, and failed/locked events</p>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Filter by username..."
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading log...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No matching events.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Time', 'Username', 'Action', 'IP', 'User Agent'].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{fmt(log.createdAt)}</td>
                  <td className="px-5 py-3 text-sm font-medium text-slate-800">{log.username}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_CLS[log.action] ?? 'bg-slate-100 text-slate-600'}`}>{log.action}</span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">{log.ipAddress ?? '—'}</td>
                  <td className="px-5 py-3 text-xs text-slate-400 max-w-xs truncate" title={log.userAgent ?? ''}>{log.userAgent ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  )
}
