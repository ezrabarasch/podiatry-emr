// Structured facility address / contact / EIN fields shared by the facility POST and PUT routes.
// Only keys present in the body are returned, so PUT stays a partial update.

const FIELDS = ['addressLine1', 'addressLine2', 'city', 'state', 'zipCode', 'phone', 'fax', 'tin'] as const
type Field = (typeof FIELDS)[number]

export function parseFacilityBilling(b: Record<string, unknown>): { data: Partial<Record<Field, string | null>> } | { error: string } {
  const data: Partial<Record<Field, string | null>> = {}
  for (const f of FIELDS) {
    if (b[f] === undefined) continue
    const v = typeof b[f] === 'string' ? (b[f] as string).trim() : ''
    data[f] = v || null
  }
  if (data.state) {
    if (!/^[A-Za-z]{2}$/.test(data.state)) return { error: 'State must be a 2-letter code (e.g. FL)' }
    data.state = data.state.toUpperCase()
  }
  if (data.zipCode && !/^\d{5}(-?\d{4})?$/.test(data.zipCode)) return { error: 'Zip code must be 5 or 9 digits' }
  if (data.tin && data.tin.replace(/\D/g, '').length !== 9) return { error: 'Tax ID (EIN) must be 9 digits' }
  return { data }
}
