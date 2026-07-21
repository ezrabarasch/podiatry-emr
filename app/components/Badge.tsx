type Variant =
  | 'snf' | 'alf'
  | 'draft' | 'signed'
  | 'active' | 'locked' | 'inactive'
  | 'medicare' | 'medicaid'
  | 'provider' | 'office' | 'admin'

const STYLES: Record<Variant, string> = {
  snf: 'bg-[#DBEAFE] text-[#1D4ED8]',
  alf: 'bg-[#EDE9FE] text-[#6D28D9]',
  draft: 'bg-[#FEF9C3] text-[#854D0E]',
  signed: 'bg-[#DCFCE7] text-[#15803D]',
  active: 'bg-[#DCFCE7] text-[#15803D]',
  locked: 'bg-red-100 text-red-700',
  inactive: 'bg-[#F1F5F9] text-[#64748B]',
  medicare: 'bg-[#DBEAFE] text-[#1D4ED8]',
  medicaid: 'bg-[#FCE7F3] text-[#9D174D]',
  provider: 'bg-blue-100 text-blue-700',
  office: 'bg-slate-100 text-slate-600',
  admin: 'bg-indigo-100 text-indigo-700',
}

export default function Badge({ variant, label }: { variant: Variant; label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STYLES[variant]}`}>
      {label}
    </span>
  )
}
