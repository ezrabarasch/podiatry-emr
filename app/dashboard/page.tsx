'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/app/components/Nav'

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
}

export default function DashboardPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/patients')
      .then(r => r.json())
      .then(data => {
        setPatients(data)
        setLoading(false)
      })
  }, [])

  const filtered = patients.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    p.facility.name.toLowerCase().includes(search.toLowerCase())
  )

  const formatDob = (dob: string) => {
    const d = new Date(dob)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const calcAge = (dob: string) => {
    const diff = Date.now() - new Date(dob).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">Patients</h2>
            <p className="text-sm text-slate-500 mt-0.5">Select a patient to begin or continue a visit</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or facility..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Patient List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading patients...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No patients found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Patient</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">DOB / Age</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Facility</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((patient, i) => (
                  <tr
                    key={patient.id}
                    className={`border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                    onClick={() => router.push(`/patients/${patient.id}`)}
                  >
                    <td className="px-5 py-4">
                      <span className="font-medium text-slate-800 text-sm">
                        {patient.lastName}, {patient.firstName}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDob(patient.dob)} <span className="text-slate-400">({calcAge(patient.dob)}y)</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{patient.facility.name}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        patient.facilityType === 'SNF'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {patient.facilityType}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-blue-600 font-medium">Start Visit →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
