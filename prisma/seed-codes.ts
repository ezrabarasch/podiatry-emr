// Seeds the `codes` table from the original hardcoded maps that used to live
// in app/api/visits/[id]/generate/route.ts. Run once after migrating.
//
//   npx tsx prisma/seed-codes.ts
//
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ICD10: Record<string, string> = {
  'B35.1': 'Tinea unguium (onychomycosis)',
  'B35.3': 'Tinea pedis',
  'E11.40': 'Type 2 diabetes mellitus with diabetic neuropathy, unspecified',
  'F17.210': 'Nicotine dependence, cigarettes, uncomplicated',
  'I10': 'Essential (primary) hypertension',
  'I70.21': 'Atherosclerosis with intermittent claudication',
  'I73.9': 'Peripheral vascular disease, unspecified',
  'L60.0': 'Ingrowing nail',
  'L84': 'Corns and callosities',
  'L85': 'Other epidermal thickening',
  'L85.3': 'Xerosis cutis',
  'L89.8': 'Pressure ulcer of other site',
  'L97.411': 'Non-pressure chronic ulcer of right heel, unspecified severity',
  'L97.412': 'Non-pressure chronic ulcer of left heel, unspecified severity',
  'L98.8': 'Other specified disorders of skin and subcutaneous tissue',
  'M20.11': 'Hallux valgus (acquired), right foot',
  'M20.12': 'Hallux valgus (acquired), left foot',
  'M20.41': 'Other hammer toe(s) (acquired), right foot',
  'M20.42': 'Other hammer toe(s) (acquired), left foot',
  'M62.81': 'Muscle weakness, right lower leg',
  'M62.82': 'Muscle weakness, left lower leg',
  'M79.671': 'Pain in right foot',
  'M79.672': 'Pain in left foot',
  'R60.0': 'Localized edema',
  'Z89.411': 'Acquired absence of right great toe',
  'Z89.412': 'Acquired absence of left great toe',
  'Z89.419': 'Acquired absence of unspecified toe(s)',
}

const CPT: Record<string, string> = {
  '11055': 'Paring/cutting of benign hyperkeratotic lesion, single',
  '11056': 'Paring/cutting, 2–4 lesions',
  '11057': 'Paring/cutting, 4+ lesions',
  '11720': 'Debridement of nail(s), 1–5',
  '11721': 'Debridement of nail(s), 6–10',
  '11750': 'Excision of nail and nail matrix (ingrown nail)',
  'G0108': 'Diabetes outpatient self-management training',
  'G8427': 'Documentation of current medications',
  'G8783': 'Blood pressure controlled/normal',
  'G8950': 'Blood pressure elevated',
}

async function main() {
  for (const [code, description] of Object.entries(ICD10)) {
    await prisma.code.upsert({
      where: { system_code: { system: 'icd10', code } },
      update: { description },
      create: { system: 'icd10', code, description },
    })
  }
  for (const [code, description] of Object.entries(CPT)) {
    await prisma.code.upsert({
      where: { system_code: { system: 'cpt', code } },
      update: { description },
      create: { system: 'cpt', code, description },
    })
  }
  console.log(`Seeded ${Object.keys(ICD10).length} ICD-10 codes and ${Object.keys(CPT).length} CPT codes.`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
