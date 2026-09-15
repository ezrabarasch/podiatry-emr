'use client'

import { useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Button from '@/app/components/Button'

interface BillingVisit {
  visitId: string
  dos: string
  patientName: string
  providerName: string
  facilityName: string
  cptCodes: string[]
  dxCodes: string[]
}

// Default range = most recently completed Mon-Sun week (not the current,
// in-progress one).
function defaultWeek() {
  const now = new Date()
  const day = now.getDay() // 0=Sun..6=Sat
  const daysSinceLastSunday = day === 0 ? 7 : day // end of the completed week is the most recent Sunday before today
  const end = new Date(now)
  end.setDate(now.getDate() - daysSinceLastSunday)
  const start = new Date(end)
  start.setDate(end.getDate() - 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { weekStart: fmt(start), weekEnd: fmt(end) }
}

export default function AdminBillingPage() {
  const [{ weekStart, weekEnd }, setWeek] = useState(defaultWeek)
  const [visits, setVisits] = useState<BillingVisit[] | null>(null)
  const [loading, setLoading] = useState(false)

  const download = () => {
    window.location.href = `/api/admin/billing/export?weekStart=${weekStart}&weekEnd=${weekEnd}`
  }

  const viewDetails = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billing/visits?weekStart=${weekStart}&weekEnd=${weekEnd}`)
      setVisits(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">Billing Export</h2>
        <p className="text-sm text-slate-500 mt-0.5">Weekly CPT/DX export for signed visits</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Week Start</span>
          <input
            type="date"
            value={weekStart}
            onChange={e => setWeek(w => ({ ...w, weekStart: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Week End</span>
          <input
            type="date"
            value={weekEnd}
            onChange={e => setWeek(w => ({ ...w, weekEnd: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </label>
        <Button onClick={download}>Download Export</Button>
        <Button variant="secondary" onClick={viewDetails} loading={loading}>View Details</Button>
      </div>

      {visits && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setVisits(null)}>
          <div
            className="bg-white rounded-xl border border-slate-200 max-w-4xl w-full max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">
                Visits: {weekStart} – {weekEnd} ({visits.length})
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setVisits(null)}>Close</Button>
            </div>
            {visits.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No signed visits in this range.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {['Patient', 'DOS', 'Provider', 'Facility', 'CPT Codes', 'DX Codes'].map((h, i) => (
                      <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visits.map(v => (
                    <tr key={v.visitId} className="border-b border-slate-100">
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{v.patientName}</td>
                      <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{v.dos}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{v.providerName}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{v.facilityName}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{v.cptCodes.join(', ')}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{v.dxCodes.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  )
}
