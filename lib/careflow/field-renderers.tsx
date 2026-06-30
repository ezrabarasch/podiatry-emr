import { FIELD_TYPES, FieldRenderProps } from './field-types'

// ─────────────────────────────────────────────────────────────────────────────
// RADIO — config: { options: [{ value, label }] }
// Ported 1:1 from the existing FieldRow radio branch in
// app/visits/[id]/page.tsx so existing podiatry visuals/behavior don't change.
// ─────────────────────────────────────────────────────────────────────────────

function RadioField({ fieldKey, label, config, value, onChange }: FieldRenderProps) {
  const options = (config?.options as { value: string; label: string }[]) ?? []
  return (
    <div className="flex items-start gap-4 py-1">
      <span className="text-xs font-medium text-slate-500 w-44 flex-shrink-0 pt-1.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
              value === opt.value
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKBOX — config: { checkValue: string }
// Ported 1:1 from the existing FieldRow checkbox branch.
// ─────────────────────────────────────────────────────────────────────────────

function CheckboxField({ fieldKey, label, config, value, onChange }: FieldRenderProps) {
  const checkValue = (config?.checkValue as string) ?? 'true'
  const checked = value === checkValue
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="text-xs font-medium text-slate-500 w-44 flex-shrink-0">
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked ? checkValue : null)}
        className="h-4 w-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
      />
    </div>
  )
}

FIELD_TYPES.radio = { render: RadioField }
FIELD_TYPES.checkbox = { render: CheckboxField }
