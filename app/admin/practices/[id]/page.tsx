'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import PracticeForm, { emptyPractice, type PracticeFormValues } from '../PracticeForm'

export default function EditPracticePage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }

  const [initial, setInitial] = useState<PracticeFormValues | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
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
      })
  }, [id])

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
    </AdminShell>
  )
}
