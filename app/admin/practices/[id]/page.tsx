'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'
import PracticeForm, { emptyPractice, type PracticeFormValues } from '../PracticeForm'
import ProviderForm, { emptyProvider, type ProviderFormValues } from '../../providers/ProviderForm'

interface PracticeProvider {
  id: string
  firstName: string
  lastName: string
  credentials: string | null
  npi: string | null
  specialty: string | null
  active: boolean
  practiceCount: number
}

interface PracticeStaff {
  id: string
  firstName: string
  lastName: string
  email: string | null
  role: string
  active: boolean
}

export default function EditPracticePage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }

  const [initial, setInitial] = useState<PracticeFormValues | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [providers, setProviders] = useState<PracticeProvider[]>([])
  const [allProviders, setAllProviders] = useState<PracticeProvider[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [providerError, setProviderError] = useState('')
  const [providerBusy, setProviderBusy] = useState(false)

  const [staff, setStaff] = useState<PracticeStaff[]>([])
  const [allStaffUsers, setAllStaffUsers] = useState<PracticeStaff[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [staffError, setStaffError] = useState('')
  const [staffBusy, setStaffBusy] = useState(false)

  // Modal state — reuses ProviderForm for both create and edit.
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'new' | 'edit'>('new')
  const [modalInitial, setModalInitial] = useState<ProviderFormValues | null>(null)
  const [modalEditingId, setModalEditingId] = useState<string | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState('')

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
        setStaff(Array.isArray(p.staff) ? p.staff : [])
      })
  }, [id])

  useEffect(() => { loadPractice() }, [loadPractice])

  useEffect(() => {
    fetch('/api/admin/providers')
      .then(r => r.json())
      .then(data => setAllProviders(Array.isArray(data) ? data : []))
  }, [])

  // Reuses the generic users list (already tenant-scoped) rather than a new
  // endpoint — filtered client-side to OFFICE/ADMIN, mirroring how the
  // Providers section reuses /api/admin/providers for its own "all" list.
  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then((data: PracticeStaff[]) =>
        setAllStaffUsers(Array.isArray(data) ? data.filter(u => u.role === 'OFFICE' || u.role === 'ADMIN') : [])
      )
  }, [])

  const availableProviders = allProviders.filter(p => !providers.some(pp => pp.id === p.id))
  const availableStaff = allStaffUsers.filter(u => !staff.some(s => s.id === u.id))

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

  const addStaff = async () => {
    if (!selectedStaffId) return
    setStaffError('')
    setStaffBusy(true)
    const res = await fetch(`/api/admin/practices/${id}/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedStaffId }),
    })
    if (res.ok) {
      setSelectedStaffId('')
      loadPractice()
    } else {
      const data = await res.json().catch(() => ({}))
      setStaffError(data.error ?? 'Failed to add staff member')
    }
    setStaffBusy(false)
  }

  const removeStaff = async (userId: string) => {
    setStaffError('')
    const res = await fetch(`/api/admin/practices/${id}/staff/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      loadPractice()
    } else {
      const data = await res.json().catch(() => ({}))
      setStaffError(data.error ?? 'Failed to remove staff member')
    }
  }

  const openNewProviderModal = () => {
    setModalMode('new')
    setModalEditingId(null)
    setModalError('')
    setModalInitial({ ...emptyProvider, practiceIds: [id] })
    setModalOpen(true)
  }

  const openEditProviderModal = async (providerId: string) => {
    setModalError('')
    const res = await fetch(`/api/admin/providers/${providerId}`)
    if (!res.ok) {
      setProviderError('Failed to load provider')
      return
    }
    const p = await res.json()
    setModalMode('edit')
    setModalEditingId(providerId)
    setModalInitial({
      ...emptyProvider,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      credentials: p.credentials ?? '',
      email: p.email ?? '',
      username: p.username ?? '',
      npi: p.npi ?? '',
      licenseNumber: p.licenseNumber ?? '',
      specialty: p.specialty ?? '',
      address: p.address ?? '',
      phone: p.phone ?? '',
      active: p.active ?? true,
      practiceIds: Array.isArray(p.practices) ? p.practices.map((pr: { id: string }) => pr.id) : [],
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalInitial(null)
    setModalEditingId(null)
    setModalError('')
  }

  const submitModal = async (values: ProviderFormValues) => {
    setModalError('')
    setModalSaving(true)
    const url = modalMode === 'new' ? '/api/admin/providers' : `/api/admin/providers/${modalEditingId}`
    const res = await fetch(url, {
      method: modalMode === 'new' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      closeModal()
      loadPractice()
    } else {
      const data = await res.json().catch(() => ({}))
      setModalError(data.error ?? 'Failed to save provider')
      setModalSaving(false)
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

      <div className="mt-8">
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
            <Button size="lg" onClick={openNewProviderModal}>+ New Provider</Button>
          </div>
        </div>

        {providerError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{providerError}</p>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {providers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No providers assigned yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Name', 'Credentials', 'NPI', 'Specialty', 'Practices', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-slate-800">{p.lastName}, {p.firstName}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{p.credentials ?? '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{p.npi ?? '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{p.specialty ?? '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{p.practiceCount}</td>
                    <td className="px-5 py-4"><Badge variant={p.active ? 'active' : 'inactive'} label={p.active ? 'Active' : 'Inactive'} /></td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEditProviderModal(p.id)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium mr-4"
                      >
                        Edit
                      </button>
                      <button onClick={() => removeProvider(p.id)} className="text-sm font-medium text-red-600 hover:text-red-800">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Staff</h3>
          <div className="flex items-center gap-2">
            <select
              value={selectedStaffId}
              onChange={e => setSelectedStaffId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a staff member...</option>
              {availableStaff.map(u => (
                <option key={u.id} value={u.id}>
                  {u.lastName}, {u.firstName} ({u.role})
                </option>
              ))}
            </select>
            <button
              onClick={addStaff}
              disabled={!selectedStaffId || staffBusy}
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-2 rounded-lg"
            >
              Add
            </button>
          </div>
        </div>

        {staffError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{staffError}</p>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {staff.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No staff assigned yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Name', 'Role', 'Email', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-slate-800">{s.lastName}, {s.firstName}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 capitalize">{s.role.toLowerCase()}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{s.email ?? '—'}</td>
                    <td className="px-5 py-4"><Badge variant={s.active ? 'active' : 'inactive'} label={s.active ? 'Active' : 'Inactive'} /></td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button onClick={() => removeStaff(s.id)} className="text-sm font-medium text-red-600 hover:text-red-800">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && modalInitial && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-base font-semibold text-white">
                {modalMode === 'new' ? 'New Provider' : 'Edit Provider'}
              </h3>
              <button onClick={closeModal} className="text-white/80 hover:text-white text-xl leading-none">×</button>
            </div>
            <ProviderForm
              initial={modalInitial}
              onSubmit={submitModal}
              onCancel={closeModal}
              saving={modalSaving}
              error={modalError}
              submitLabel={modalMode === 'new' ? 'Create Provider' : 'Save Changes'}
              showActive={modalMode === 'edit'}
              isNew={modalMode === 'new'}
            />
          </div>
        </div>
      )}
    </AdminShell>
  )
}
