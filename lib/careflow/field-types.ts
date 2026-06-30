import { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// FIELD TYPE REGISTRY
//
// CareflowField.type is a free string (not a Prisma enum) because the planned
// service lines — wound care, cardiology, physiatry, OT/PT/SP, nutrition,
// psych, primary care — will keep needing input shapes we haven't designed
// yet. Each entry here owns:
//   - the shape of `config` it expects (documented per-type below)
//   - how to render itself given (config, currentValue, onChange)
//   - how to read/write its value as the single string VisitFieldSelection
//     stores today (selections are always a string — multi-value types like
//     multi_select encode/decode to a string, e.g. CSV, internally)
//
// Adding "body_diagram" or anything else later is: add one entry to
// FIELD_TYPES below. No schema change, no edit to SectionCard/page.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldRenderProps {
  fieldKey: string
  label: string
  config: Record<string, unknown> | null
  value: string | undefined
  onChange: (value: string | null) => void
}

export interface FieldTypeDef {
  /** Renders this field type. Each renderer is a small function component. */
  render: (props: FieldRenderProps) => ReactNode
}

// Renderers intentionally contain no styling decisions beyond what the
// existing FieldRow/SectionCard already establish — they return raw JSX,
// composed the same way FieldRow does today, so visual consistency across
// service lines comes for free.

export const FIELD_TYPES: Record<string, FieldTypeDef> = {
  // radio and checkbox: ports of the existing FieldRow behavior, config:
  //   radio:    { options: [{ value, label }] }
  //   checkbox: { checkValue: string }
  // (registered here as placeholders — see lib/careflow/field-renderers.tsx
  // for the actual JSX, kept separate to avoid a .ts/.tsx split in this file)

  // numeric: { unit?: string, min?: number, max?: number, step?: number }
  // free_text: { rows?: number, maxLength?: number }
  // multi_select: { options: [{ value, label }] } — value stored as CSV string
  // body_diagram: { regions: [{ id, label }] } — value stored as region id
}

/** Returns true if a field type name has a registered renderer. */
export function isKnownFieldType(type: string): boolean {
  return type in FIELD_TYPES
}
