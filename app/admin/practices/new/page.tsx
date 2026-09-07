'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import PracticeForm, { emptyPractice, type PracticeFormValues } from '../PracticeForm'

export default function NewPracticePage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (values: PracticeFormValues) => {
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/practices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      router.push('/admin/practices')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create practice')
      setSaving(false)
    }
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/practices')} className="text-sm text-slate-500 hover:text-slate-800">← Back to practices</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">New Practice</h2>
      </div>
      <PracticeForm
        initial={emptyPractice}
        onSubmit={save}
        onCancel={() => router.push('/admin/practices')}
        saving={saving}
        error={error}
        submitLabel="Create Practice"
      />
    </AdminShell>
  )
}
