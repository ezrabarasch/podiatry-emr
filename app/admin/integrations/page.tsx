'use client'

import { useEffect, useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'
import { FREQUENCIES, RESOURCE_LABELS, type Frequency } from '@/lib/integrations'

interface Config {
  id: string
  resourceName: string
  enabled: boolean
  frequency: string
  lastSyncAt: string | null
  lastCount: number | null
  lastError: string | null
}
interface Source {
  id: string
  name: string
  status: string
  lastSyncAt: string | null
  configs: Config[]
}

const TABS = [
  { key: 'PCC', label: 'PointClickCare' },
  { key: 'MATRIX', label: 'MatrixCare' },
  { key: 'MEDREX', label: 'Medrex' },
  { key: 'SIGMA', label: 'Sigma' },
]

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function IntegrationsPage() {
  const [tab, setTab] = useState('PCC')
  const [sources, setSources] = useState<Source[]>([])
  const [configs, setConfigs] = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = () =>
    fetch('/api/admin/integrations').then(r => r.json()).then((data: Source[]) => {
      const list = Array.isArray(data) ? data : []
      setSources(list)
      setConfigs(list.find(s => s.name === 'PCC')?.configs ?? [])
      setLoading(false)
    })

  useEffect(() => { load() }, [])

  const pcc = sources.find(s => s.name === 'PCC')

  const setConfig = (resourceName: string, patch: Partial<Config>) =>
    setConfigs(cs => cs.map(c => (c.resourceName === resourceName ? { ...c, ...patch } : c)))

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/integrations/pcc/configs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs: configs.map(c => ({ resourceName: c.resourceName, enabled: c.enabled, frequency: c.frequency })) }),
    })
    await load()
    setSaving(false)
  }

  const runSync = async () => {
    setSyncing(true)
    await fetch('/api/admin/integrations/pcc/sync', { method: 'POST' })
    setSyncing(false)
  }

  const connected = pcc?.status === 'connected'

  return (
    <AdminShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-text">Integration Hub</h2>
        <p className="text-sm text-text-muted mt-0.5">Manage external EMR sync sources and schedules</p>
      </div>

      {/* Source tabs */}
      <div className="border-b border-border mb-6 flex gap-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'PCC' ? (
        loading ? (
          <div className="p-8 text-center text-text-muted text-sm">Loading...</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Badge variant={connected ? 'active' : 'inactive'} label={connected ? 'Connected' : 'Disconnected'} />
                <span className="text-sm text-text-muted">Last sync: {fmtDate(pcc?.lastSyncAt ?? null)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={runSync} loading={syncing}>Run Full Sync Now</Button>
                <Button onClick={save} loading={saving}>Save Schedule</Button>
              </div>
            </div>

            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-[#F8FAFC]">
                    {['Resource', 'Enabled', 'Frequency', 'Last Run', 'Last Count', 'Last Error'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {configs.map(c => (
                    <tr key={c.id} className="border-b border-[#F1F5F9]">
                      <td className="px-5 py-4 text-sm font-medium text-text">{RESOURCE_LABELS[c.resourceName] ?? c.resourceName}</td>
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          onChange={e => setConfig(c.resourceName, { enabled: e.target.checked })}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={c.frequency}
                          onChange={e => setConfig(c.resourceName, { frequency: e.target.value })}
                          className="px-2 py-1.5 rounded-lg border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {(Object.keys(FREQUENCIES) as Frequency[]).map(f => (
                            <option key={f} value={f}>{FREQUENCIES[f].label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">{fmtDate(c.lastSyncAt)}</td>
                      <td className="px-5 py-4 text-sm text-text-muted">{c.lastCount ?? '—'}</td>
                      <td className="px-5 py-4 text-sm text-danger">{c.lastError ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : (
        <div className="bg-surface rounded-lg border border-border p-12 text-center">
          <Badge variant="inactive" label="Not Connected" />
          <p className="text-sm text-text-muted mt-3 mb-4">{TABS.find(t => t.key === tab)?.label} is not yet configured.</p>
          <Button variant="secondary" disabled>Configure Connection</Button>
        </div>
      )}
    </AdminShell>
  )
}
