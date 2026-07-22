// Integration Hub shared constants — reused by seed, API routes, and admin UI.

export const FREQUENCIES = {
  EVERY_4H: { label: 'Every 4h', cron: '0 */4 * * *' },
  EVERY_6H: { label: 'Every 6h', cron: '0 */6 * * *' },
  DAILY_1AM: { label: 'Daily 1am', cron: '0 1 * * *' },
  WEEKLY_MON_1AM: { label: 'Weekly Mon 1am', cron: '0 1 * * 1' },
} as const

export type Frequency = keyof typeof FREQUENCIES

// resource = slug passed to `sync_to_emr.py --resource <resource>` (matches sync_<resource>).
export const PCC_RESOURCES: { resource: string; label: string; frequency: Frequency }[] = [
  { resource: 'patients', label: 'Patients', frequency: 'EVERY_6H' },
  { resource: 'adt', label: 'ADT Records', frequency: 'EVERY_6H' },
  { resource: 'observations', label: 'Observations', frequency: 'EVERY_4H' },
  { resource: 'medications', label: 'Medications', frequency: 'DAILY_1AM' },
  { resource: 'allergies', label: 'Allergies', frequency: 'DAILY_1AM' },
  { resource: 'diagnoses', label: 'Diagnoses', frequency: 'DAILY_1AM' },
  { resource: 'coverages', label: 'Coverages', frequency: 'DAILY_1AM' },
  { resource: 'diagnostic_reports', label: 'Diagnostic Reports', frequency: 'DAILY_1AM' },
  { resource: 'contacts', label: 'Contacts', frequency: 'DAILY_1AM' },
  { resource: 'immunizations', label: 'Immunizations', frequency: 'WEEKLY_MON_1AM' },
  { resource: 'care_plans', label: 'Care Plans', frequency: 'WEEKLY_MON_1AM' },
  { resource: 'therapy', label: 'Therapy', frequency: 'WEEKLY_MON_1AM' },
  { resource: 'assessments', label: 'Assessments', frequency: 'WEEKLY_MON_1AM' },
  { resource: 'practitioners', label: 'Practitioners', frequency: 'WEEKLY_MON_1AM' },
  { resource: 'episodes_of_care', label: 'Episodes of Care', frequency: 'WEEKLY_MON_1AM' },
]

export const RESOURCE_LABELS: Record<string, string> = Object.fromEntries(
  PCC_RESOURCES.map(r => [r.resource, r.label])
)
