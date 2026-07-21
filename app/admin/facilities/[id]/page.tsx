'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import FacilityForm, { emptyFacility, type FacilityFormValues } from '../FacilityForm'

export default function EditFacilityPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }

  const [initial, setInitial] = useState<FacilityFormValues | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/facilities/${id}`)
      .then(r => r.json())
      .then(f => {
        setName(f.name ?? '')
        setInitial({
          ...emptyFacility,
          name: f.name ?? '',
          facilityType: f.facilityType ?? 'SNF',
          address: f.address ?? '',
          npi: f.npi ?? '',
          posCode: f.posCode ?? '',
          pccFacilityId: f.pccFacilityId ?? '',
          adminContactName: f.adminContactName ?? '',
          adminContactPhone: f.adminContactPhone ?? '',
          adminContactEmail: f.adminContactEmail ?? '',
          donContactName: f.donContactName ?? '',
          donContactPhone: f.donContactPhone ?? '',
          donContactEmail: f.donContactEmail ?? '',
          active: f.active ?? true,
        })
      })
  }, [id])

  const save = async (values: FacilityFormValues) => {
    setError('')
    setSaving(true)
    const res = await fetch(`/api/admin/facilities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      router.push('/admin/facilities')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to save')
      setSaving(false)
    }
  }

  if (!initial) {
    return <AdminShell><p className="text-slate-400 text-sm">Loading facility...</p></AdminShell>
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/facilities')} className="text-sm text-slate-500 hover:text-slate-800">← Back to facilities</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">{name}</h2>
      </div>
      <FacilityForm
        initial={initial}
        onSubmit={save}
        onCancel={() => router.push('/admin/facilities')}
        saving={saving}
        error={error}
        submitLabel="Save Changes"
        showActive
      />
    </AdminShell>
  )
}
