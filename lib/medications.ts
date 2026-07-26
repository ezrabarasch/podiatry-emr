type MedicationLike = {
  description: string
  strength?: string | null
  strengthUOM?: string | null
  directions?: string | null
}

/**
 * "MedName Strength Direction, MedName Strength Direction, ..." — the value the
 * careflow HPI rule substitutes for its {medications_list} token.
 */
export function formatMedicationList(medications: MedicationLike[]): string {
  return medications
    .map(m => [
      m.description,
      [m.strength, m.strengthUOM].filter(Boolean).join(' '),
      m.directions,
    ].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(', ')
}
