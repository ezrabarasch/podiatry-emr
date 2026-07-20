'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Card from '@/app/components/Card'
import FormField from '@/app/components/FormField'
import Button from '@/app/components/Button'

interface Facility { id: string; name: string; facilityType: string }

const inputCls = 'w-full px-3 py-2 rounded-lg border border-border text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'

export default function NewPatientPage() {
  const router = useRouter()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [form, setForm] = useState({ firstName: '', lastName: '', dob: '', facilityId: '', pccPatientId: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/facilities').then(r => r.json()).then(d => setFacilities(Array.isArray(d) ? d : []))
  }, [])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const facilityType = facilities.find(f => f.id === form.facilityId)?.facilityType ?? ''
  const canSave = form.firstName && form.lastName && form.dob && form.facilityId && !saving

  const save = async () => {
    setError('')
    setSaving(true)
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        dob: form.dob,
        facilityId: form.facilityId,
        pccPatientId: form.pccPatientId.trim() || null,
      }),
    })
    if (res.ok) {
      const patient = await res.json()
      router.push(`/patients/${patient.id}`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create patient')
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <div className="mb-6">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-text-muted hover:text-text">← Back to patients</button>
        <h2 className="text-2xl font-semibold text-text mt-2">New Patient</h2>
      </div>

      <Card className="max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First name" required>
            <input className={inputCls} value={form.firstName} onChange={set('firstName')} />
          </FormField>
          <FormField label="Last name" required>
            <input className={inputCls} value={form.lastName} onChange={set('lastName')} />
          </FormField>
        </div>
        <FormField label="Date of birth" required>
          <input type="date" className={inputCls} value={form.dob} onChange={set('dob')} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Facility" required>
            <select className={inputCls} value={form.facilityId} onChange={set('facilityId')}>
              <option value="">Select facility...</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormField>
          <FormField label="Facility type">
            <input className={`${inputCls} bg-slate-50`} value={facilityType} readOnly placeholder="—" />
          </FormField>
        </div>
        <FormField label="PCC Patient ID (optional)">
          <input className={inputCls} value={form.pccPatientId} onChange={set('pccPatientId')} placeholder="Leave blank for manual patients" />
        </FormField>

        {error && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>Cancel</Button>
          <Button size="lg" onClick={save} disabled={!canSave} loading={saving}>Create Patient</Button>
        </div>
      </Card>
    </PageShell>
  )
}
