'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'

interface Facility {
  id: string
  name: string
  facilityType: string
}

interface Patient {
  id: string
  firstName: string
  lastName: string
  dob: string
  facilityType: string
  facility: Facility
  pccPatientId: string | null
}

interface Visit {
  id: string
  visitDate: string
  visitType: string
  status: string
  provider: {
    firstName: string
    lastName: string
    credentials: string | null
  }
}

export default function PatientPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [patient, setPatient] = useState<Patient | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/patients/${patientId}`).then(r => r.json()),
      fetch(`/api/patients/${patientId}/visits`).then(r => r.json()),
    ]).then(([patientData, visitsData]) => {
      setPatient(patientData)
      setVisits(visitsData)
      setLoading(false)
    })
  }, [patientId])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })

  const calcAge = (dob: string) => {
    const diff = Date.now() - new Date(dob).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  }

  const handleNewVisit = async () => {
    setCreating(true)
    const res = await fetch(`/api/patients/${patientId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: session?.user?.id }),
    })
    const visit = await res.json()
    router.push(`/visits/${visit.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Patient not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Patient List
          </button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-semibold text-slate-800">QWC Podiatry</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {session?.user?.name}{session?.user?.credentials && `, ${session.user.credentials}`}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Patient Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-800">
                {patient.lastName}, {patient.firstName}
              </h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                <span>DOB: {formatDate(patient.dob)} ({calcAge(patient.dob)}y)</span>
                <span>·</span>
                <span>{patient.facility.name}</span>
                <span>·</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  patient.facilityType === 'SNF'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {patient.facilityType}
                </span>
              </div>
            </div>
            <button
              onClick={handleNewVisit}
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : '+ New Visit'}
            </button>
          </div>
        </div>

        {/* Visit History */}
        <div>
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Visit History</h3>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {visits.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No visits yet. Click <strong>+ New Visit</strong> to begin.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Date of Service</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Provider</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((visit, i) => (
                    <tr
                      key={visit.id}
                      className={`border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                      onClick={() => router.push(`/visits/${visit.id}`)}
                    >
                      <td className="px-5 py-4 text-sm text-slate-800 font-medium">
                        {formatDate(visit.visitDate)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600 capitalize">
                        {visit.visitType.replace('_', ' ')}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {visit.provider.firstName} {visit.provider.lastName}{visit.provider.credentials && `, ${visit.provider.credentials}`}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          visit.status === 'signed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {visit.status === 'signed' ? 'Signed' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm text-blue-600 font-medium">
                          {visit.status === 'signed' ? 'View →' : 'Continue →'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
