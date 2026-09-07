'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import ProviderForm, { emptyProvider, type ProviderFormValues } from '../ProviderForm'

export default function NewProviderPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (values: ProviderFormValues) => {
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      router.push('/admin/providers')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create provider')
      setSaving(false)
    }
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/providers')} className="text-sm text-slate-500 hover:text-slate-800">← Back to providers</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">New Provider</h2>
      </div>
      <ProviderForm
        initial={emptyProvider}
        onSubmit={save}
        onCancel={() => router.push('/admin/providers')}
        saving={saving}
        error={error}
        submitLabel="Create Provider"
        isNew
      />
    </AdminShell>
  )
}
