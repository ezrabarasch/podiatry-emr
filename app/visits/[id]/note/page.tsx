'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GeneratedNote {
  noteText: string
  procedureNotes: Array<{ label: string; text: string }>
  specialSections: Array<{ label: string; text: string }>
  diagnoses: Array<{ icd10: string; description: string }>
  cptCodes: Array<{ code: string; description: string; qualifier: string | null }>
  billingAlerts: Array<{ code: string; message: string }>
  addendum: string
  isSigned: boolean
}

interface VisitInfo {
  id: string
  visitDate: string
  status: string
  signedAt: string | null
  patient: {
    id: string
    firstName: string
    lastName: string
    dob: string
    facilityType: string
    facility: { name: string }
  }
  provider: { firstName: string; lastName: string; credentials: string | null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function NotePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const visitId = params.id as string

  const [visit, setVisit] = useState<VisitInfo | null>(null)
  const [note, setNote] = useState<GeneratedNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [addendum, setAddendum] = useState('')
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')

  useEffect(() => {
    if (session === null) router.push('/login')
  }, [session, router])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [visitRes, noteRes] = await Promise.all([
        fetch(`/api/visits/${visitId}`),
        fetch(`/api/visits/${visitId}/generate`),
      ])
      if (!visitRes.ok || !noteRes.ok) throw new Error('Failed to load')
      const [visitData, noteData]: [VisitInfo, GeneratedNote] = await Promise.all([
        visitRes.json(),
        noteRes.json(),
      ])
      setVisit(visitData)
      setNote(noteData)
      setAddendum(noteData.addendum ?? '')
    } catch {
      setLoadError('Failed to generate note. Please go back and try again.')
    } finally {
      setLoading(false)
    }
  }, [visitId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSign = async () => {
    if (!note) return
    setSigning(true)
    setSignError('')
    try {
      const res = await fetch(`/api/visits/${visitId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addendum: addendum.trim() || null,
          noteText: note.noteText,
          procedureNotes: note.procedureNotes,
          specialSections: note.specialSections,
          diagnoses: note.diagnoses,
          cptCodes: note.cptCodes,
          billingAlerts: note.billingAlerts,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSignError(data.error ?? 'Signing failed — please try again')
        return
      }
      // Reload to show signed state
      await loadData()
    } catch {
      setSignError('Network error — please try again')
    } finally {
      setSigning(false)
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const fmtDt = (d: string) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Generating note...</p>
      </div>
    )
  }

  if (loadError || !visit || !note) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600 text-sm">{loadError || 'Something went wrong.'}</p>
        <button
          onClick={() => router.push(`/visits/${visitId}`)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Back to visit form
        </button>
      </div>
    )
  }

  const user = session?.user as { name?: string; credentials?: string } | undefined
  const alertCodes = new Set(note.billingAlerts.map(a => a.code))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/visits/${visitId}`)}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Edit Form
          </button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-semibold text-slate-800">QWC Podiatry</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {user?.name}{user?.credentials && `, ${user.credentials}`}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Visit header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {visit.patient.lastName}, {visit.patient.firstName}
              </h2>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                <span>DOB: {fmt(visit.patient.dob)}</span>
                <span>·</span>
                <span>{visit.patient.facility.name}</span>
                <span>·</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  visit.patient.facilityType === 'SNF'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {visit.patient.facilityType}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-medium text-slate-700">{fmt(visit.visitDate)}</div>
              <div className="flex items-center gap-2 justify-end mt-1.5">
                <span className="text-xs text-slate-500">
                  {visit.provider.firstName} {visit.provider.lastName}
                  {visit.provider.credentials && `, ${visit.provider.credentials}`}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  note.isSigned
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {note.isSigned ? 'Signed' : 'Draft'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_308px] gap-6">

          {/* ── Left: note content ─────────────────────────────────────────── */}
          <div className="space-y-4 min-w-0">

            {/* Progress Note */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">Progress Note</h3>
              </div>
              <div className="p-5">
                {note.noteText ? (
                  <pre className="text-sm text-slate-800 font-mono whitespace-pre-wrap leading-relaxed bg-slate-50/60 rounded-lg p-4 border border-slate-100">
                    {note.noteText}
                  </pre>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    No note content — complete the visit form and return here.
                  </p>
                )}
              </div>
            </div>

            {/* Procedure Notes */}
            {note.procedureNotes.map((proc, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700">{proc.label}</h3>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {proc.text}
                  </p>
                </div>
              </div>
            ))}

            {/* Special Sections (Smoking Cessation, etc.) */}
            {note.specialSections.map((sec, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700">{sec.label}</h3>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {sec.text}
                  </p>
                </div>
              </div>
            ))}

            {/* Addendum */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">Addendum</h3>
              </div>
              <div className="p-5">
                {note.isSigned ? (
                  addendum ? (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{addendum}</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No addendum.</p>
                  )
                ) : (
                  <textarea
                    value={addendum}
                    onChange={e => setAddendum(e.target.value)}
                    placeholder="Optional addendum to be included with this note..."
                    rows={4}
                    className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Right: diagnoses, CPT, sign ────────────────────────────────── */}
          <div className="space-y-4">

            {/* Billing Alerts */}
            {note.billingAlerts.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-yellow-800 uppercase tracking-wide mb-2">
                  Billing Alerts
                </h3>
                <ul className="space-y-2">
                  {note.billingAlerts.map((alert, i) => (
                    <li key={i} className="text-xs text-yellow-800 leading-snug">
                      <span className="font-mono font-bold">{alert.code}</span>
                      {' — '}
                      {alert.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Diagnoses */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Diagnoses</h3>
                {note.diagnoses.length > 0 && (
                  <span className="text-xs text-slate-400">{note.diagnoses.length} code{note.diagnoses.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="p-4">
                {note.diagnoses.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No diagnoses generated.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {note.diagnoses.map((dx, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                          {dx.icd10}
                        </span>
                        <span className="text-xs text-slate-700 leading-snug">{dx.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* CPT Codes */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">CPT Codes</h3>
                {note.cptCodes.length > 0 && (
                  <span className="text-xs text-slate-400">{note.cptCodes.length} code{note.cptCodes.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="p-4">
                {note.cptCodes.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No CPT codes generated.</p>
                ) : (
                  <ul className="space-y-2">
                    {note.cptCodes.map((cpt, i) => (
                      <li
                        key={i}
                        className={`rounded-lg p-2.5 ${
                          alertCodes.has(cpt.code)
                            ? 'bg-yellow-50 border border-yellow-200'
                            : 'bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-800">
                            {cpt.code}
                          </span>
                          {cpt.qualifier && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              cpt.qualifier === 'class_c'
                                ? 'bg-yellow-100 text-yellow-700'
                                : cpt.qualifier === 'class_b'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {cpt.qualifier.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                          {alertCodes.has(cpt.code) && (
                            <span className="text-yellow-600 text-xs">⚠</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-snug">{cpt.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Sign & Lock */}
            {note.isSigned ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-sm font-semibold text-green-800">Note Signed &amp; Locked</p>
                {visit.signedAt && (
                  <p className="text-xs text-green-700 mt-1">{fmtDt(visit.signedAt)}</p>
                )}
                <p className="text-xs text-green-600 mt-0.5">
                  {visit.provider.firstName} {visit.provider.lastName}
                  {visit.provider.credentials && `, ${visit.provider.credentials}`}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                {signError && (
                  <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {signError}
                  </p>
                )}
                {note.billingAlerts.length > 0 && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    Billing alerts present — please review before signing.
                  </p>
                )}
                <button
                  onClick={handleSign}
                  disabled={signing}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-lg transition-colors"
                >
                  {signing ? 'Signing...' : 'Sign & Lock Note'}
                </button>
                <p className="text-xs text-slate-400 text-center leading-snug">
                  Signing is permanent and will lock the note.
                </p>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}
