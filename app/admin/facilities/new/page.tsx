'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import FacilityForm, { emptyFacility, type FacilityFormValues } from '../FacilityForm'

export default function NewFacilityPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (values: FacilityFormValues) => {
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/facilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      router.push('/admin/facilities')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create facility')
      setSaving(false)
    }
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/facilities')} className="text-sm text-slate-500 hover:text-slate-800">← Back to facilities</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">New Facility</h2>
      </div>
      <FacilityForm
        initial={emptyFacility}
        onSubmit={save}
        onCancel={() => router.push('/admin/facilities')}
        saving={saving}
        error={error}
        submitLabel="Create Facility"
      />
    </AdminShell>
  )
}
