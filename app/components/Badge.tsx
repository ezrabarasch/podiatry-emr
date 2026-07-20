type Variant =
  | 'snf' | 'alf'
  | 'draft' | 'signed'
  | 'active' | 'locked' | 'inactive'
  | 'provider' | 'office' | 'admin'

const STYLES: Record<Variant, string> = {
  snf: 'bg-blue-100 text-blue-700',
  alf: 'bg-purple-100 text-purple-700',
  draft: 'bg-yellow-100 text-yellow-700',
  signed: 'bg-green-100 text-green-700',
  active: 'bg-green-100 text-green-700',
  locked: 'bg-red-100 text-red-700',
  inactive: 'bg-slate-100 text-slate-600',
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
