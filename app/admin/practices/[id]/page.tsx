'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import PracticeForm, { emptyPractice, type PracticeFormValues } from '../PracticeForm'

interface PracticeProvider { id: string; firstName: string; lastName: string; credentials: string | null }
interface ProviderOption { id: string; firstName: string; lastName: string; credentials: string | null }

export default function EditPracticePage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }

  const [initial, setInitial] = useState<PracticeFormValues | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [providers, setProviders] = useState<PracticeProvider[]>([])
  const [allProviders, setAllProviders] = useState<ProviderOption[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [providerError, setProviderError] = useState('')
  const [providerBusy, setProviderBusy] = useState(false)

  const loadPractice = useCallback(() => {
    fetch(`/api/admin/practices/${id}`)
      .then(r => r.json())
      .then(p => {
        setName(p.name ?? '')
        setInitial({
          ...emptyPractice,
          name: p.name ?? '',
          tin: p.tin ?? '',
          groupNpi: p.groupNpi ?? '',
          address: p.address ?? '',
          phone: p.phone ?? '',
          email: p.email ?? '',
          active: p.active ?? true,
          serviceTypes: Array.isArray(p.serviceTypes) ? p.serviceTypes : [],
        })
        setProviders(Array.isArray(p.providers) ? p.providers : [])
      })
  }, [id])

  useEffect(() => { loadPractice() }, [loadPractice])

  useEffect(() => {
    fetch('/api/admin/providers')
      .then(r => r.json())
      .then(data => setAllProviders(Array.isArray(data) ? data : []))
  }, [])

  const availableProviders = allProviders.filter(p => !providers.some(pp => pp.id === p.id))

  const addProvider = async () => {
    if (!selectedProviderId) return
    setProviderError('')
    setProviderBusy(true)
    const res = await fetch(`/api/admin/practices/${id}/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: selectedProviderId }),
    })
    if (res.ok) {
      setSelectedProviderId('')
      loadPractice()
    } else {
      const data = await res.json().catch(() => ({}))
      setProviderError(data.error ?? 'Failed to add provider')
    }
    setProviderBusy(false)
  }

  const removeProvider = async (providerId: string) => {
    setProviderError('')
    const res = await fetch(`/api/admin/practices/${id}/providers/${providerId}`, { method: 'DELETE' })
    if (res.ok) {
      loadPractice()
    } else {
      const data = await res.json().catch(() => ({}))
      setProviderError(data.error ?? 'Failed to remove provider')
    }
  }

  const save = async (values: PracticeFormValues) => {
    setError('')
    setSaving(true)
    const res = await fetch(`/api/admin/practices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      router.push('/admin/practices')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to save')
      setSaving(false)
    }
  }

  if (!initial) {
    return <AdminShell><p className="text-slate-400 text-sm">Loading practice...</p></AdminShell>
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/practices')} className="text-sm text-slate-500 hover:text-slate-800">← Back to practices</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">{name}</h2>
      </div>
      <PracticeForm
        initial={initial}
        onSubmit={save}
        onCancel={() => router.push('/admin/practices')}
        saving={saving}
        error={error}
        submitLabel="Save Changes"
        showActive
      />

      <div className="max-w-2xl mt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Providers</h3>
          <div className="flex items-center gap-2">
            <select
              value={selectedProviderId}
              onChange={e => setSelectedProviderId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a provider...</option>
              {availableProviders.map(p => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={addProvider}
              disabled={!selectedProviderId || providerBusy}
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-2 rounded-lg"
            >
              Add
            </button>
          </div>
        </div>

        {providerError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{providerError}</p>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {providers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No providers assigned yet.</div>
          ) : (
            <ul>
              {providers.map(p => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-700">
                    {p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ''}
                  </span>
                  <button onClick={() => removeProvider(p.id)} className="text-sm font-medium text-red-600 hover:text-red-800">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
