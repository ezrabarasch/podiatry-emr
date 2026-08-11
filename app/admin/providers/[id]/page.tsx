'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import ProviderForm, { emptyProvider, type ProviderFormValues } from '../ProviderForm'

export default function EditProviderPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }

  const [initial, setInitial] = useState<ProviderFormValues | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/providers/${id}`)
      .then(r => r.json())
      .then(p => {
        setName(`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim())
        setInitial({
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
      })
  }, [id])

  const save = async (values: ProviderFormValues) => {
    setError('')
    setSaving(true)
    const res = await fetch(`/api/admin/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      router.push('/admin/providers')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to save')
      setSaving(false)
    }
  }

  if (!initial) {
    return <AdminShell><p className="text-slate-400 text-sm">Loading provider...</p></AdminShell>
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/providers')} className="text-sm text-slate-500 hover:text-slate-800">← Back to providers</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">{name}</h2>
      </div>
      <ProviderForm
        initial={initial}
        onSubmit={save}
        onCancel={() => router.push('/admin/providers')}
        saving={saving}
        error={error}
        submitLabel="Save Changes"
        showActive
      />
    </AdminShell>
  )
}
