'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { SectionCard, SectionData } from './SectionCard'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface VisitData {
  id: string
  visitDate: string
  visitType: string
  facilityType: string
  status: string
  careflowType: string
  patient: {
    id: string
    firstName: string
    lastName: string
    dob: string
    facilityType: string
    facility: { name: string }
  }
  provider: { firstName: string; lastName: string; credentials: string | null }
  fieldSelections: Array<{ section: string; fieldKey: string; value: string }>
}

type Selections = Record<string, Record<string, string>>
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'


// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function VisitPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const visitId = params.id as string

  const [visit, setVisit] = useState<VisitData | null>(null)
  const [sections, setSections] = useState<SectionData[]>([])
  const [loading, setLoading] = useState(true)
  const [selections, setSelections] = useState<Selections>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (session === null) router.push('/login')
  }, [session, router])

  useEffect(() => {
    fetch(`/api/visits/${visitId}`)
      .then(r => r.json())
      .then((data: VisitData) => {
        setVisit(data)
        const map: Selections = {}
        for (const sel of data.fieldSelections) {
          if (!map[sel.section]) map[sel.section] = {}
          map[sel.section][sel.fieldKey] = sel.value
        }
        setSelections(map)
        // Form structure is service-line specific — fetched by careflowType
        // rather than imported as a constant, so each service line (podiatry,
        // wound care, cardiology, etc.) gets its own form with zero code changes.
        return fetch(`/api/careflows/${data.careflowType}/form`)
      })
      .then(r => r.json())
      .then(formData => {
        setSections(formData.sections ?? [])
        setLoading(false)
      })
  }, [visitId])

  const saveField = useCallback(async (section: string, fieldKey: string, value: string | null) => {
    clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    try {
      await fetch(`/api/visits/${visitId}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, fieldKey, value }),
      })
      setSaveStatus('saved')
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }, [visitId])

  // Single generic handler for every field type — radio, checkbox, and
  // anything added later (numeric, free_text, etc.) all just produce a
  // string value or null, matching VisitFieldSelection's storage shape.
  const handleFieldChange = useCallback((sectionId: string, fieldKey: string, value: string | null) => {
    setSelections(prev => {
      const next = { ...prev, [sectionId]: { ...prev[sectionId] } }
      if (value === null) {
        delete next[sectionId][fieldKey]
      } else {
        next[sectionId][fieldKey] = value
      }
      return next
    })
    saveField(sectionId, fieldKey, value)
  }, [saveField])

  const handleCancelVisit = async () => {
    setCancelling(true)
    try {
      await fetch(`/api/visits/${visitId}`, { method: 'DELETE' })
      router.push(`/patients/${visit!.patient.id}`)
    } catch {
      setCancelling(false)
      setShowCancelDialog(false)
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading visit...</p>
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Visit not found.</p>
      </div>
    )
  }

  const user = session?.user as { id?: string; name?: string; credentials?: string } | undefined

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/patients/${visit.patient.id}`)}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← {visit.patient.lastName}, {visit.patient.firstName}
          </button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-semibold text-slate-800">QWC Podiatry</h1>
        </div>
        <div className="flex items-center gap-4">
          {saveStatus === 'saving' && (
            <span className="text-xs text-slate-400">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 font-medium">Saved ✓</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-500">Save failed</span>
          )}
          <button
            onClick={() => router.push(`/visits/${visitId}/note`)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Generate Note →
          </button>
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

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Visit header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {visit.patient.lastName}, {visit.patient.firstName}
              </h2>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                <span>DOB: {formatDate(visit.patient.dob)}</span>
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
              <div className="text-sm font-medium text-slate-700">
                {formatDate(visit.visitDate)}
              </div>
              <div className="flex items-center gap-2 justify-end mt-1.5">
                <span className="text-xs text-slate-500">
                  {visit.provider.firstName} {visit.provider.lastName}
                  {visit.provider.credentials && `, ${visit.provider.credentials}`}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  visit.status === 'signed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {visit.status === 'signed' ? 'Signed' : 'Draft'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Careflow form sections */}
        {sections.map(section => (
          <SectionCard
            key={section.id}
            section={section}
            selections={selections}
            onFieldChange={handleFieldChange}
          />
        ))}

        {/* Bottom CTA */}
        <div className="flex items-center justify-between pt-2 pb-16">
          <button
            onClick={() => setShowCancelDialog(true)}
            className="text-sm font-medium text-red-600 hover:text-red-800 border border-red-300 hover:border-red-400 px-4 py-2.5 rounded-lg transition-colors"
          >
            Cancel Visit
          </button>
          <button
            onClick={() => router.push(`/visits/${visitId}/note`)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Generate Note →
          </button>
        </div>
      </main>

      {/* Cancel Visit Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800 mb-2">Cancel Visit?</h3>
            <p className="text-sm text-slate-600 mb-5">
              Are you sure you want to discard changes to the visit information?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelDialog(false)}
                disabled={cancelling}
                className="flex-1 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 py-2.5 rounded-lg transition-colors"
              >
                Keep Editing
              </button>
              <button
                onClick={handleCancelVisit}
                disabled={cancelling}
                className="flex-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed py-2.5 rounded-lg transition-colors"
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
