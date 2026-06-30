'use client'

import '@/lib/careflow/field-renderers' // registers radio/checkbox into FIELD_TYPES
import { FIELD_TYPES, isKnownFieldType } from '@/lib/careflow/field-types'

// ─────────────────────────────────────────────────────────────────────────────
// Shapes returned by GET /api/careflows/[type]/form — mirrors the Prisma
// models (CareflowSection -> CareflowFieldGroup -> CareflowField).
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldData {
  id: string
  type: string
  fieldKey: string
  label: string
  config: Record<string, unknown> | null
}
export interface GroupData {
  id: string
  groupLabel: string | null
  accentColor: string | null
  fields: FieldData[]
}
export interface SectionData {
  id: string
  sectionId: string
  label: string
  groups: GroupData[]
}

type Selections = Record<string, Record<string, string>>

export function SectionCard({
  section,
  selections,
  onFieldChange,
}: {
  section: SectionData
  selections: Selections
  onFieldChange: (sectionId: string, fieldKey: string, value: string | null) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
      <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">{section.label}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {section.groups.map(group => {
          const allCheckboxes = group.fields.every(f => f.type === 'checkbox')
          return (
            <div key={group.id} className="px-6 py-4">
              {group.groupLabel && (
                <div className="flex items-center gap-2 mb-3">
                  {group.accentColor && (
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${group.accentColor}`} />
                  )}
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    {group.groupLabel}
                  </span>
                </div>
              )}
              {allCheckboxes ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  {group.fields.map(f => (
                    <RenderedField
                      key={f.id}
                      field={f}
                      sectionId={section.sectionId}
                      selections={selections}
                      onFieldChange={onFieldChange}
                      compact
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {group.fields.map(f => (
                    <RenderedField
                      key={f.id}
                      field={f}
                      sectionId={section.sectionId}
                      selections={selections}
                      onFieldChange={onFieldChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RenderedField({
  field,
  sectionId,
  selections,
  onFieldChange,
  compact,
}: {
  field: FieldData
  sectionId: string
  selections: Selections
  onFieldChange: (sectionId: string, fieldKey: string, value: string | null) => void
  compact?: boolean
}) {
  if (!isKnownFieldType(field.type)) {
    // Fails visibly rather than silently dropping the field — an unrecognized
    // type is a real bug (typo'd type name, or a field registered without a
    // renderer) and should be obvious in the UI, not swallowed.
    return (
      <div className="text-xs text-red-500 py-1">
        Unknown field type &quot;{field.type}&quot; for {field.fieldKey}
      </div>
    )
  }

  const { render } = FIELD_TYPES[field.type]
  const value = selections[sectionId]?.[field.fieldKey]
  const onChange = (v: string | null) => onFieldChange(sectionId, field.fieldKey, v)

  // The checkbox-in-a-grid compact layout (label first, no fixed-width
  // column) differs visually from the standalone FieldRow layout, matching
  // the original hardcoded SectionCard behavior for "allCheckboxes" groups.
  if (compact && field.type === 'checkbox') {
    const checked = value === ((field.config?.checkValue as string) ?? 'true')
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked ? ((field.config?.checkValue as string) ?? 'true') : null)}
          className="h-4 w-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
        />
        <span className="text-sm text-slate-700">{field.label}</span>
      </label>
    )
  }

  return (
    <>
      {render({
        fieldKey: field.fieldKey,
        label: field.label,
        config: field.config,
        value,
        onChange,
      })}
    </>
  )
}
