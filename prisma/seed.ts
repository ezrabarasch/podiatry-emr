import { PrismaClient, CareflowType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PROC_NAIL = `Aseptic debridement of all involved mycotic toenails using sterile nail nippers. The nail plate was thinned using rotary burr. Subungual mycotic elements were removed using dermal curette. The patient tolerated the procedure well without complications.`

const SMOKING_TEXT = `The patient was counseled as to the multiple risks to his/her health from continued use of tobacco products. It was explained that continuing to smoke may lead to multiple short- and long-term negative health consequences, including but not limited to mouth/esophageal/lung cancer, COPD, and heart disease. Patient states he/she understands these risks and understands the options and resources available to him/her to help him/her stop smoking. Nicotine replacement therapy, local hotlines, and local resources were discussed as viable options for helping the patient stop his/her tobacco use. The total time spent counseling the patient regarding tobacco cessation was 15 minutes.`

async function main() {
  console.log('🌱 Seeding database...')

  // ─────────────────────────────────────────────────────────────────────────
  // PROVIDER
  // ─────────────────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('changeme123', 12)

  await prisma.provider.upsert({
    where: { email: 'provider@qwcwoundcare.com' },
    update: {},
    create: {
      firstName: 'Provider',
      lastName: 'Admin',
      credentials: 'DPM',
      email: 'provider@qwcwoundcare.com',
      accounts: {
        create: {
          type: 'credentials',
          providerAccountId: 'provider@qwcwoundcare.com',
          access_token: hashedPassword, // storing hashed password here for credentials auth
        },
      },
    },
  })
  console.log('✓ Provider seeded')

  // ─────────────────────────────────────────────────────────────────────────
  // CAREFLOW RULES
  // ─────────────────────────────────────────────────────────────────────────
  const rules = [
    // ── Header ──────────────────────────────────────────────────────────────
    { section: 'header', fieldKey: 'visit_type', fieldValue: 'new_patient', noteFragment: 'New patient evaluation performed.', priority: 1 },
    { section: 'header', fieldKey: 'visit_type', fieldValue: 'established', noteFragment: 'Established patient follow-up visit.', priority: 1 },
    { section: 'header', fieldKey: 'facility_type', fieldValue: 'SNF', priority: 1 },
    { section: 'header', fieldKey: 'facility_type', fieldValue: 'ALF', priority: 1 },

    // ── HPI ─────────────────────────────────────────────────────────────────
    { section: 'hpi', fieldKey: 'current_medications', fieldValue: 'imported', noteFragment: 'Current Medications: {medications_list}', cptCodes: ['G8427'], priority: 5 },
    { section: 'hpi', fieldKey: 'ambulatory_status', fieldValue: 'ambulatory', noteFragment: 'Patient is ambulatory.', priority: 10 },
    { section: 'hpi', fieldKey: 'ambulatory_status', fieldValue: 'bedridden', noteFragment: 'Patient is bedridden.', priority: 10 },
    { section: 'hpi', fieldKey: 'responsive_capacity', fieldValue: 'good', noteFragment: 'Responsive capacity is good.', priority: 11 },
    { section: 'hpi', fieldKey: 'responsive_capacity', fieldValue: 'fair', noteFragment: 'Responsive capacity is fair.', priority: 11 },
    { section: 'hpi', fieldKey: 'responsive_capacity', fieldValue: 'poor', noteFragment: 'Responsive capacity is poor.', priority: 11 },
    { section: 'hpi', fieldKey: 'responsive_capacity', fieldValue: 'combative', noteFragment: 'Patient is combative.', priority: 11 },
    { section: 'hpi', fieldKey: 'place_of_service', fieldValue: 'bedside', noteFragment: 'Patient evaluated at bedside.', priority: 12 },
    { section: 'hpi', fieldKey: 'place_of_service', fieldValue: 'wheelchair', noteFragment: 'Patient evaluated in wheelchair.', priority: 12 },
    { section: 'hpi', fieldKey: 'chronically_ill', fieldValue: 'true', noteFragment: 'Patient presents with chronically ill-looking appearance.', priority: 13 },
    { section: 'hpi', fieldKey: 'on_vent', fieldValue: 'true', noteFragment: 'Patient is on a ventilator.', priority: 14 },
    { section: 'hpi', fieldKey: 'unable_to_communicate', fieldValue: 'true', noteFragment: 'Patient is unable to communicate.', priority: 15 },

    // ── Social History ───────────────────────────────────────────────────────
    { section: 'social_history', fieldKey: 'smoking_status', fieldValue: 'current_smoker', noteFragment: 'Patient is a current smoker.', icd10Codes: ['F17.210'], sectionLabel: 'Smoking Cessation Counseling', procedureNarrative: SMOKING_TEXT, priority: 20 },
    { section: 'social_history', fieldKey: 'smoking_status', fieldValue: 'non_smoker', noteFragment: 'Patient is a non-smoker.', priority: 20 },

    // ── Vitals ───────────────────────────────────────────────────────────────
    { section: 'vitals', fieldKey: 'blood_pressure', fieldValue: 'normal_no_htn', noteFragment: 'Blood pressure is normal. No HTN diagnosis on file.', cptCodes: ['G8783'], priority: 30 },
    { section: 'vitals', fieldKey: 'blood_pressure', fieldValue: 'elevated_no_htn', noteFragment: 'Blood pressure is elevated. No HTN diagnosis on file.', cptCodes: ['G8950'], priority: 30 },
    { section: 'vitals', fieldKey: 'blood_pressure', fieldValue: 'elevated_with_htn', noteFragment: 'Blood pressure is elevated, consistent with documented HTN diagnosis.', icd10Codes: ['I10'], cptCodes: ['G8950'], priority: 30 },
    { section: 'vitals', fieldKey: 'blood_pressure', fieldValue: 'normal_with_htn', noteFragment: 'Blood pressure is normal, patient has documented HTN diagnosis.', icd10Codes: ['I10'], cptCodes: ['G8783'], priority: 30 },

    // ── Vascular — Class A ───────────────────────────────────────────────────
    { section: 'vascular_exam', fieldKey: 'class_a_amputation', fieldValue: 'right', noteFragment: 'Non-traumatic amputation noted on the right foot.', icd10Codes: ['Z89.411'], cptQualifier: 'class_a', priority: 40 },
    { section: 'vascular_exam', fieldKey: 'class_a_amputation', fieldValue: 'left', noteFragment: 'Non-traumatic amputation noted on the left foot.', icd10Codes: ['Z89.412'], cptQualifier: 'class_a', priority: 40 },
    { section: 'vascular_exam', fieldKey: 'class_a_amputation', fieldValue: 'bilateral', noteFragment: 'Non-traumatic amputation noted bilaterally.', icd10Codes: ['Z89.419'], cptQualifier: 'class_a', priority: 40 },

    // ── Vascular — Class B ───────────────────────────────────────────────────
    { section: 'vascular_exam', fieldKey: 'dp_pulse_right', fieldValue: 'absent', noteFragment: 'Dorsalis pedis pulse is absent on the right.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 41 },
    { section: 'vascular_exam', fieldKey: 'dp_pulse_right', fieldValue: 'trace', noteFragment: 'Dorsalis pedis pulse is trace on the right.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 41 },
    { section: 'vascular_exam', fieldKey: 'dp_pulse_right', fieldValue: 'palpable', noteFragment: 'Dorsalis pedis pulse is palpable on the right.', priority: 41 },
    { section: 'vascular_exam', fieldKey: 'dp_pulse_left', fieldValue: 'absent', noteFragment: 'Dorsalis pedis pulse is absent on the left.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 41 },
    { section: 'vascular_exam', fieldKey: 'dp_pulse_left', fieldValue: 'trace', noteFragment: 'Dorsalis pedis pulse is trace on the left.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 41 },
    { section: 'vascular_exam', fieldKey: 'dp_pulse_left', fieldValue: 'palpable', noteFragment: 'Dorsalis pedis pulse is palpable on the left.', priority: 41 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_right', fieldValue: 'absent', noteFragment: 'Posterior tibial pulse is absent on the right.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_right', fieldValue: '1/4', noteFragment: 'Posterior tibial pulse is 1/4 on the right.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_right', fieldValue: '2/4', noteFragment: 'Posterior tibial pulse is 2/4 on the right.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_right', fieldValue: '3/4', noteFragment: 'Posterior tibial pulse is 3/4 on the right.', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_left', fieldValue: 'absent', noteFragment: 'Posterior tibial pulse is absent on the left.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_left', fieldValue: '1/4', noteFragment: 'Posterior tibial pulse is 1/4 on the left.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_left', fieldValue: '2/4', noteFragment: 'Posterior tibial pulse is 2/4 on the left.', icd10Codes: ['I73.9'], cptQualifier: 'class_b', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'pt_pulse_left', fieldValue: '3/4', noteFragment: 'Posterior tibial pulse is 3/4 on the left.', priority: 42 },
    { section: 'vascular_exam', fieldKey: 'hair_growth_decrease', fieldValue: 'right', noteFragment: 'Decrease or absence of hair growth noted on the right.', cptQualifier: 'class_b', priority: 43 },
    { section: 'vascular_exam', fieldKey: 'hair_growth_decrease', fieldValue: 'left', noteFragment: 'Decrease or absence of hair growth noted on the left.', cptQualifier: 'class_b', priority: 43 },
    { section: 'vascular_exam', fieldKey: 'hair_growth_decrease', fieldValue: 'bilateral', noteFragment: 'Decrease or absence of hair growth noted bilaterally.', cptQualifier: 'class_b', priority: 43 },
    { section: 'vascular_exam', fieldKey: 'hair_growth_decrease', fieldValue: 'absent', noteFragment: 'Hair growth is absent.', cptQualifier: 'class_b', priority: 43 },
    { section: 'vascular_exam', fieldKey: 'pigmentary_changes', fieldValue: 'right', noteFragment: 'Pigmentary changes (discoloration) noted on the right.', cptQualifier: 'class_b', priority: 44 },
    { section: 'vascular_exam', fieldKey: 'pigmentary_changes', fieldValue: 'left', noteFragment: 'Pigmentary changes (discoloration) noted on the left.', cptQualifier: 'class_b', priority: 44 },
    { section: 'vascular_exam', fieldKey: 'pigmentary_changes', fieldValue: 'bilateral', noteFragment: 'Pigmentary changes (discoloration) noted bilaterally.', cptQualifier: 'class_b', priority: 44 },
    { section: 'vascular_exam', fieldKey: 'skin_color_change', fieldValue: 'right', noteFragment: 'Skin color changes noted on the right.', cptQualifier: 'class_b', priority: 45 },
    { section: 'vascular_exam', fieldKey: 'skin_color_change', fieldValue: 'left', noteFragment: 'Skin color changes noted on the left.', cptQualifier: 'class_b', priority: 45 },
    { section: 'vascular_exam', fieldKey: 'skin_color_change', fieldValue: 'bilateral', noteFragment: 'Skin color changes noted bilaterally.', cptQualifier: 'class_b', priority: 45 },
    { section: 'vascular_exam', fieldKey: 'skin_texture_scaly', fieldValue: 'true', noteFragment: 'Skin texture is scaly.', icd10Codes: ['L85'], cptQualifier: 'class_b', priority: 46 },
    { section: 'vascular_exam', fieldKey: 'skin_texture_thin', fieldValue: 'true', noteFragment: 'Skin texture is thin.', cptQualifier: 'class_b', priority: 46 },
    { section: 'vascular_exam', fieldKey: 'skin_texture_shiny', fieldValue: 'true', noteFragment: 'Skin texture is shiny.', cptQualifier: 'class_b', priority: 46 },
    { section: 'vascular_exam', fieldKey: 'nail_thickening', fieldValue: 'right', noteFragment: 'Nail thickening (changes) noted on the right.', cptQualifier: 'class_b', priority: 47 },
    { section: 'vascular_exam', fieldKey: 'nail_thickening', fieldValue: 'left', noteFragment: 'Nail thickening (changes) noted on the left.', cptQualifier: 'class_b', priority: 47 },
    { section: 'vascular_exam', fieldKey: 'nail_thickening', fieldValue: 'bilateral', noteFragment: 'Nail thickening (changes) noted bilaterally.', cptQualifier: 'class_b', priority: 47 },

    // ── Vascular — Class C ───────────────────────────────────────────────────
    { section: 'vascular_exam', fieldKey: 'claudication', fieldValue: 'right', noteFragment: 'Claudication present on the right.', icd10Codes: ['I70.21'], cptQualifier: 'class_c', priority: 50 },
    { section: 'vascular_exam', fieldKey: 'claudication', fieldValue: 'left', noteFragment: 'Claudication present on the left.', icd10Codes: ['I70.21'], cptQualifier: 'class_c', priority: 50 },
    { section: 'vascular_exam', fieldKey: 'burning', fieldValue: 'yes', noteFragment: 'Patient reports burning sensation in feet.', cptQualifier: 'class_c', priority: 51 },
    { section: 'vascular_exam', fieldKey: 'tingling', fieldValue: 'yes', noteFragment: 'Patient reports tingling in feet.', cptQualifier: 'class_c', priority: 51 },
    { section: 'vascular_exam', fieldKey: 'temp_change_coolness', fieldValue: 'right', noteFragment: 'Temperature changes (coolness) noted on the right.', cptQualifier: 'class_c', priority: 52 },
    { section: 'vascular_exam', fieldKey: 'temp_change_coolness', fieldValue: 'left', noteFragment: 'Temperature changes (coolness) noted on the left.', cptQualifier: 'class_c', priority: 52 },
    { section: 'vascular_exam', fieldKey: 'edema_right', fieldValue: '1+', noteFragment: 'Edema 1+ noted on the right.', icd10Codes: ['R60.0'], cptQualifier: 'class_c', priority: 53 },
    { section: 'vascular_exam', fieldKey: 'edema_right', fieldValue: '2+', noteFragment: 'Edema 2+ noted on the right.', icd10Codes: ['R60.0'], cptQualifier: 'class_c', priority: 53 },
    { section: 'vascular_exam', fieldKey: 'edema_left', fieldValue: '1+', noteFragment: 'Edema 1+ noted on the left.', icd10Codes: ['R60.0'], cptQualifier: 'class_c', priority: 53 },
    { section: 'vascular_exam', fieldKey: 'edema_left', fieldValue: '2+', noteFragment: 'Edema 2+ noted on the left.', icd10Codes: ['R60.0'], cptQualifier: 'class_c', priority: 53 },

    // ── Orthopedic ───────────────────────────────────────────────────────────
    { section: 'orthopedic_exam', fieldKey: 'foot_pain', fieldValue: 'right', noteFragment: 'Foot pain noted on the right.', icd10Codes: ['M79.671'], priority: 60 },
    { section: 'orthopedic_exam', fieldKey: 'foot_pain', fieldValue: 'left', noteFragment: 'Foot pain noted on the left.', icd10Codes: ['M79.672'], priority: 60 },
    { section: 'orthopedic_exam', fieldKey: 'foot_pain', fieldValue: 'bilateral', noteFragment: 'Foot pain noted bilaterally.', icd10Codes: ['M79.671', 'M79.672'], priority: 60 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_right', fieldValue: '2nd', noteFragment: 'Hammer toe deformity noted on the right 2nd digit.', icd10Codes: ['M20.41'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_right', fieldValue: '3rd', noteFragment: 'Hammer toe deformity noted on the right 3rd digit.', icd10Codes: ['M20.41'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_right', fieldValue: '4th', noteFragment: 'Hammer toe deformity noted on the right 4th digit.', icd10Codes: ['M20.41'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_right', fieldValue: '5th', noteFragment: 'Hammer toe deformity noted on the right 5th digit.', icd10Codes: ['M20.41'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_right', fieldValue: '2nd-5th', noteFragment: 'Hammer toe deformities noted on the right 2nd through 5th digits.', icd10Codes: ['M20.41'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_left', fieldValue: '2nd', noteFragment: 'Hammer toe deformity noted on the left 2nd digit.', icd10Codes: ['M20.42'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_left', fieldValue: '3rd', noteFragment: 'Hammer toe deformity noted on the left 3rd digit.', icd10Codes: ['M20.42'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_left', fieldValue: '4th', noteFragment: 'Hammer toe deformity noted on the left 4th digit.', icd10Codes: ['M20.42'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_left', fieldValue: '5th', noteFragment: 'Hammer toe deformity noted on the left 5th digit.', icd10Codes: ['M20.42'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'hammer_toe_left', fieldValue: '2nd-5th', noteFragment: 'Hammer toe deformities noted on the left 2nd through 5th digits.', icd10Codes: ['M20.42'], priority: 61 },
    { section: 'orthopedic_exam', fieldKey: 'bunion', fieldValue: 'right', noteFragment: 'Hallux valgus (bunion) deformity noted on the right.', icd10Codes: ['M20.11'], priority: 62 },
    { section: 'orthopedic_exam', fieldKey: 'bunion', fieldValue: 'left', noteFragment: 'Hallux valgus (bunion) deformity noted on the left.', icd10Codes: ['M20.12'], priority: 62 },
    { section: 'orthopedic_exam', fieldKey: 'bunion', fieldValue: 'bilateral', noteFragment: 'Hallux valgus (bunion) deformity noted bilaterally.', icd10Codes: ['M20.11', 'M20.12'], priority: 62 },
    { section: 'orthopedic_exam', fieldKey: 'rom_right', fieldValue: 'WNL', noteFragment: 'Range of motion of the right foot is within normal limits.', priority: 63 },
    { section: 'orthopedic_exam', fieldKey: 'rom_right', fieldValue: 'decreased', noteFragment: 'Range of motion of the right foot is decreased.', priority: 63 },
    { section: 'orthopedic_exam', fieldKey: 'rom_left', fieldValue: 'WNL', noteFragment: 'Range of motion of the left foot is within normal limits.', priority: 63 },
    { section: 'orthopedic_exam', fieldKey: 'rom_left', fieldValue: 'decreased', noteFragment: 'Range of motion of the left foot is decreased.', priority: 63 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_right', fieldValue: '0/5', noteFragment: 'Right lower extremity muscle strength is 0/5.', icd10Codes: ['M62.81'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_right', fieldValue: '1/5', noteFragment: 'Right lower extremity muscle strength is 1/5.', icd10Codes: ['M62.81'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_right', fieldValue: '2/5', noteFragment: 'Right lower extremity muscle strength is 2/5.', icd10Codes: ['M62.81'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_right', fieldValue: '3/5', noteFragment: 'Right lower extremity muscle strength is 3/5.', icd10Codes: ['M62.81'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_right', fieldValue: '4/5', noteFragment: 'Right lower extremity muscle strength is 4/5.', priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_right', fieldValue: '5/5', noteFragment: 'Right lower extremity muscle strength is 5/5 (normal).', priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_left', fieldValue: '0/5', noteFragment: 'Left lower extremity muscle strength is 0/5.', icd10Codes: ['M62.82'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_left', fieldValue: '1/5', noteFragment: 'Left lower extremity muscle strength is 1/5.', icd10Codes: ['M62.82'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_left', fieldValue: '2/5', noteFragment: 'Left lower extremity muscle strength is 2/5.', icd10Codes: ['M62.82'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_left', fieldValue: '3/5', noteFragment: 'Left lower extremity muscle strength is 3/5.', icd10Codes: ['M62.82'], priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_left', fieldValue: '4/5', noteFragment: 'Left lower extremity muscle strength is 4/5.', priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'mmt_left', fieldValue: '5/5', noteFragment: 'Left lower extremity muscle strength is 5/5 (normal).', priority: 64 },
    { section: 'orthopedic_exam', fieldKey: 'lesion_area', fieldValue: 'inner', noteFragment: 'Lesion noted on the inner aspect of the foot.', icd10Codes: ['L89.8'], priority: 65 },
    { section: 'orthopedic_exam', fieldKey: 'lesion_area', fieldValue: 'outer', noteFragment: 'Lesion noted on the outer aspect of the foot.', icd10Codes: ['L89.8'], priority: 65 },
    { section: 'orthopedic_exam', fieldKey: 'lesion_area', fieldValue: 'dorsal', noteFragment: 'Lesion noted on the dorsal aspect of the foot.', icd10Codes: ['L89.8'], priority: 65 },
    { section: 'orthopedic_exam', fieldKey: 'lesion_area', fieldValue: 'plantar', noteFragment: 'Lesion noted on the plantar aspect of the foot.', icd10Codes: ['L89.8'], priority: 65 },

    // ── Dermatological ───────────────────────────────────────────────────────
    ...['1st','2nd','3rd','4th','5th','1st-5th'].map(d => ({
      section: 'derm_exam', fieldKey: 'hyperkeratosis_right', fieldValue: d,
      noteFragment: `Hyperkeratosis noted on the right ${d} digit.`, icd10Codes: ['L84'], priority: 70
    })),
    ...['1st','2nd','3rd','4th','5th','1st-5th'].map(d => ({
      section: 'derm_exam', fieldKey: 'hyperkeratosis_left', fieldValue: d,
      noteFragment: `Hyperkeratosis noted on the left ${d} digit.`, icd10Codes: ['L84'], priority: 70
    })),
    { section: 'derm_exam', fieldKey: 'ulceration_right', fieldValue: '1st', noteFragment: 'Ulceration noted on the right 1st digit. Refer to wound care provider for ulceration.', icd10Codes: ['L97.411'], priority: 71 },
    { section: 'derm_exam', fieldKey: 'ulceration_right', fieldValue: 'heel', noteFragment: 'Ulceration noted on the right heel. Refer to wound care provider for ulceration.', icd10Codes: ['L97.411'], priority: 71 },
    { section: 'derm_exam', fieldKey: 'ulceration_right', fieldValue: 'forefoot', noteFragment: 'Ulceration noted on the right forefoot. Refer to wound care provider for ulceration.', icd10Codes: ['L97.411'], priority: 71 },
    { section: 'derm_exam', fieldKey: 'ulceration_right', fieldValue: 'bandage_present', noteFragment: 'Bandage present over right ulceration site. Refer to wound care provider for ulceration.', priority: 71 },
    { section: 'derm_exam', fieldKey: 'ulceration_left', fieldValue: '1st', noteFragment: 'Ulceration noted on the left 1st digit. Refer to wound care provider for ulceration.', icd10Codes: ['L97.412'], priority: 71 },
    { section: 'derm_exam', fieldKey: 'ulceration_left', fieldValue: 'heel', noteFragment: 'Ulceration noted on the left heel. Refer to wound care provider for ulceration.', icd10Codes: ['L97.412'], priority: 71 },
    { section: 'derm_exam', fieldKey: 'ulceration_left', fieldValue: 'forefoot', noteFragment: 'Ulceration noted on the left forefoot. Refer to wound care provider for ulceration.', icd10Codes: ['L97.412'], priority: 71 },
    ...['1st','2nd','3rd','4th','5th','1st-5th'].map(d => ({
      section: 'derm_exam', fieldKey: 'dry_xerotic_right', fieldValue: d,
      noteFragment: d === '1st-5th' ? 'Dry/xerotic skin noted on the right foot.' : `Dry/xerotic skin noted on the right ${d} digit.`,
      icd10Codes: ['L85.3'], priority: 72
    })),
    ...['1st','2nd','3rd','4th','5th','1st-5th'].map(d => ({
      section: 'derm_exam', fieldKey: 'dry_xerotic_left', fieldValue: d,
      noteFragment: d === '1st-5th' ? 'Dry/xerotic skin noted on the left foot.' : `Dry/xerotic skin noted on the left ${d} digit.`,
      icd10Codes: ['L85.3'], priority: 72
    })),
    { section: 'derm_exam', fieldKey: 'interspaces', fieldValue: 'clear', noteFragment: 'Interspaces are clear.', priority: 73 },
    { section: 'derm_exam', fieldKey: 'interspaces', fieldValue: 'macerated', noteFragment: 'Interspaces are macerated. Apply betadine interdigitally PRN.', icd10Codes: ['B35.3'], priority: 73 },
    { section: 'derm_exam', fieldKey: 'cuts_fissures', fieldValue: 'right', noteFragment: 'Cuts/fissures noted on the right foot. Apply skin emollient under occlusion daily PRN.', icd10Codes: ['L98.8'], priority: 74 },
    { section: 'derm_exam', fieldKey: 'cuts_fissures', fieldValue: 'left', noteFragment: 'Cuts/fissures noted on the left foot. Apply skin emollient under occlusion daily PRN.', icd10Codes: ['L98.8'], priority: 74 },
    { section: 'derm_exam', fieldKey: 'cuts_fissures', fieldValue: 'bilateral', noteFragment: 'Cuts/fissures noted bilaterally. Apply skin emollient under occlusion daily PRN.', icd10Codes: ['L98.8'], priority: 74 },

    // ── Nails ────────────────────────────────────────────────────────────────
    ...['R1','R2','R3','R4','R5'].map(d => ({
      section: 'nails', fieldKey: 'nail_mycotic_right', fieldValue: d,
      noteFragment: `Painful, thick, yellow/mycotic nail noted on right digit (${d}).`, icd10Codes: ['B35.1'], priority: 80
    })),
    { section: 'nails', fieldKey: 'nail_mycotic_right', fieldValue: 'R1-5', noteFragment: 'Painful, thick, yellow/mycotic nails noted on right digits R1-R5.', icd10Codes: ['B35.1'], priority: 80 },
    ...['L1','L2','L3','L4','L5'].map(d => ({
      section: 'nails', fieldKey: 'nail_mycotic_left', fieldValue: d,
      noteFragment: `Painful, thick, yellow/mycotic nail noted on left digit (${d}).`, icd10Codes: ['B35.1'], priority: 80
    })),
    { section: 'nails', fieldKey: 'nail_mycotic_left', fieldValue: 'L1-5', noteFragment: 'Painful, thick, yellow/mycotic nails noted on left digits L1-L5.', icd10Codes: ['B35.1'], priority: 80 },
    ...['R1','R2','R3','R4','R5','R1-5'].map(d => ({
      section: 'nails', fieldKey: 'ingrown_nail_right', fieldValue: d,
      noteFragment: `Ingrown nail noted on right digit (${d}).`, icd10Codes: ['L60.0'], cptCodes: ['11750'], priority: 81
    })),
    ...['L1','L2','L3','L4','L5','L1-5'].map(d => ({
      section: 'nails', fieldKey: 'ingrown_nail_left', fieldValue: d,
      noteFragment: `Ingrown nail noted on left digit (${d}).`, icd10Codes: ['L60.0'], cptCodes: ['11750'], priority: 81
    })),
    ...['R1','R2','R3','R4','R5','R1-5'].map(d => ({
      section: 'nails', fieldKey: 'hematoma_right', fieldValue: d,
      noteFragment: `Subungual hematoma noted on right digit (${d}).`, priority: 82
    })),
    ...['L1','L2','L3','L4','L5','L1-5'].map(d => ({
      section: 'nails', fieldKey: 'hematoma_left', fieldValue: d,
      noteFragment: `Subungual hematoma noted on left digit (${d}).`, priority: 82
    })),

    // ── Neurological ─────────────────────────────────────────────────────────
    { section: 'neuro_exam', fieldKey: 'monofilament', fieldValue: 'pass', noteFragment: 'Patient passed 10g monofilament test.', priority: 90 },
    { section: 'neuro_exam', fieldKey: 'monofilament', fieldValue: 'fail', noteFragment: 'Patient failed 10g monofilament test — protective sensation diminished.', icd10Codes: ['E11.40'], dxCondition: 'patient_is_diabetic', priority: 90 },
    { section: 'neuro_exam', fieldKey: 'pinprick_right', fieldValue: 'normal', noteFragment: 'Pinprick sensation is normal on the right.', priority: 91 },
    { section: 'neuro_exam', fieldKey: 'pinprick_right', fieldValue: 'abnormal', noteFragment: 'Pinprick sensation is abnormal on the right.', icd10Codes: ['E11.40'], dxCondition: 'patient_is_diabetic', priority: 91 },
    { section: 'neuro_exam', fieldKey: 'pinprick_left', fieldValue: 'normal', noteFragment: 'Pinprick sensation is normal on the left.', priority: 91 },
    { section: 'neuro_exam', fieldKey: 'pinprick_left', fieldValue: 'abnormal', noteFragment: 'Pinprick sensation is abnormal on the left.', icd10Codes: ['E11.40'], dxCondition: 'patient_is_diabetic', priority: 91 },
    { section: 'neuro_exam', fieldKey: 'ankle_reflex_right', fieldValue: 'present', noteFragment: 'Ankle reflex is present on the right.', priority: 92 },
    { section: 'neuro_exam', fieldKey: 'ankle_reflex_right', fieldValue: 'absent', noteFragment: 'Ankle reflex is absent on the right.', icd10Codes: ['E11.40'], dxCondition: 'patient_is_diabetic', priority: 92 },
    { section: 'neuro_exam', fieldKey: 'ankle_reflex_left', fieldValue: 'present', noteFragment: 'Ankle reflex is present on the left.', priority: 92 },
    { section: 'neuro_exam', fieldKey: 'ankle_reflex_left', fieldValue: 'absent', noteFragment: 'Ankle reflex is absent on the left.', icd10Codes: ['E11.40'], dxCondition: 'patient_is_diabetic', priority: 92 },
    { section: 'neuro_exam', fieldKey: 'unable_to_test_sensation', fieldValue: 'true', noteFragment: "Unable to test sensation due to patient's mental state.", priority: 93 },
    { section: 'neuro_exam', fieldKey: 'neuro_result', fieldValue: 'passed', noteFragment: 'Neurological foot exam passed.', priority: 94 },
    { section: 'neuro_exam', fieldKey: 'neuro_result', fieldValue: 'failed', noteFragment: 'Neurological foot exam failed.', icd10Codes: ['E11.40'], dxCondition: 'patient_is_diabetic', priority: 94 },

    // ── Treatment ────────────────────────────────────────────────────────────
    { section: 'treatment', fieldKey: 'nail_debridement', fieldValue: '1-5', noteFragment: 'Debridement of 1-5 nails performed.', cptCodes: ['11720'], sectionLabel: 'Procedure Note', procedureNarrative: PROC_NAIL, priority: 100 },
    { section: 'treatment', fieldKey: 'nail_debridement', fieldValue: '6-10', noteFragment: 'Debridement of 6-10 nails performed.', cptCodes: ['11721'], sectionLabel: 'Procedure Note', procedureNarrative: PROC_NAIL, priority: 100 },
    { section: 'treatment', fieldKey: 'ingrown_nail_procedure', fieldValue: 'right', noteFragment: 'Ingrown nail procedure performed on the right.', cptCodes: ['11750'], sectionLabel: 'Procedure Note', priority: 101 },
    { section: 'treatment', fieldKey: 'ingrown_nail_procedure', fieldValue: 'left', noteFragment: 'Ingrown nail procedure performed on the left.', cptCodes: ['11750'], sectionLabel: 'Procedure Note', priority: 101 },
    { section: 'treatment', fieldKey: 'skin_paring', fieldValue: '1', noteFragment: 'Under paring/cutting of skin performed (1 lesion).', cptCodes: ['11055'], sectionLabel: 'Procedure Note', priority: 102 },
    { section: 'treatment', fieldKey: 'skin_paring', fieldValue: '2-4', noteFragment: 'Under paring/cutting of skin performed (2-4 lesions).', cptCodes: ['11056'], sectionLabel: 'Procedure Note', priority: 102 },
    { section: 'treatment', fieldKey: 'skin_paring', fieldValue: '4+', noteFragment: 'Under paring/cutting of skin performed (4+ lesions).', cptCodes: ['11057'], sectionLabel: 'Procedure Note', priority: 102 },
    { section: 'treatment', fieldKey: 'patient_evaluated', fieldValue: 'true', noteFragment: 'Patient seen and evaluated with all questions answered.', priority: 103 },
    { section: 'treatment', fieldKey: 'diabetic_education', fieldValue: 'true', noteFragment: 'Diabetic education rendered.', cptCodes: ['G0108'], priority: 104 },
    { section: 'treatment', fieldKey: 'foot_hygiene', fieldValue: 'true', noteFragment: 'Reviewed proper foot hygiene with patient.', priority: 105 },
    { section: 'treatment', fieldKey: 'wide_shoe_gear', fieldValue: 'true', noteFragment: 'Recommended wide shoe gear.', priority: 106 },
    { section: 'treatment', fieldKey: 'no_barefoot', fieldValue: 'true', noteFragment: 'Educated patient on no barefoot walking.', priority: 107 },
    { section: 'treatment', fieldKey: 'smoking_cessation', fieldValue: 'true', noteFragment: 'Smoking cessation reviewed with patient.', priority: 108 },
    { section: 'treatment', fieldKey: 'continue_pt', fieldValue: 'true', noteFragment: 'Continue physical therapy as directed.', priority: 109 },
    { section: 'treatment', fieldKey: 'bed_chair_exercises', fieldValue: 'true', noteFragment: 'Demonstrated exercises patient can perform while in bed/chair.', priority: 110 },
    { section: 'treatment', fieldKey: 'protective_footwear', fieldValue: 'true', noteFragment: 'Educated patient on wearing shoes/protective footwear when not in bed.', priority: 111 },
    { section: 'treatment', fieldKey: 'will_monitor', fieldValue: 'true', noteFragment: 'Will continue to monitor.', priority: 112 },
  ]

  for (const rule of rules) {
    await prisma.careflowRule.upsert({
      where: {
        careflowType_section_fieldKey_fieldValue: {
          careflowType: CareflowType.at_risk_podiatry,
          section: rule.section,
          fieldKey: rule.fieldKey,
          fieldValue: rule.fieldValue,
        },
      },
      update: rule,
      create: { careflowType: CareflowType.at_risk_podiatry, ...rule },
    })
  }
  console.log(`✓ ${rules.length} careflow rules seeded`)

  // ─────────────────────────────────────────────────────────────────────────
  // STATIC FRAGMENTS
  // ─────────────────────────────────────────────────────────────────────────
  const staticFragments = [
    { section: 'hpi', position: 1, fragmentText: 'Patient seen today for podiatric evaluation and treatment. The patient reports no complaints, no distress noted. Denies SOB, nausea, and/or vomiting.' },
    { section: 'physical_exam', position: 39, fragmentText: 'Physical examination was performed as follows:' },
    { section: 'vascular_exam', position: 40, fragmentText: 'Vascular Examination:' },
    { section: 'orthopedic_exam', position: 59, fragmentText: 'Orthopedic Examination:' },
    { section: 'derm_exam', position: 69, fragmentText: 'Dermatological Examination:' },
    { section: 'nails', position: 79, fragmentText: 'Nail Examination:' },
    { section: 'neuro_exam', position: 89, fragmentText: 'Neurological Foot Examination:' },
    { section: 'assessment_plan', position: 99, fragmentText: 'Assessment & Plan:' },
  ]

  for (const frag of staticFragments) {
    await prisma.careflowStaticFragment.upsert({
      where: { id: `static-${frag.section}-${frag.position}` },
      update: frag,
      create: { id: `static-${frag.section}-${frag.position}`, careflowType: CareflowType.at_risk_podiatry, ...frag },
    })
  }
  console.log(`✓ ${staticFragments.length} static fragments seeded`)

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED RULES
  // ─────────────────────────────────────────────────────────────────────────
  const derivedRules = [
    { conditionName: 'pvd_dx_present', triggerCodes: ['I73.9', 'I70.21'], noteFragment: 'Due to PVD, please be conscious of offloading techniques to prevent pressure ulcers.', outputSection: 'Assessment & Plan', priority: 115 },
    { conditionName: 'edema_present', triggerCodes: ['R60.0'], noteFragment: 'Compression stockings ordered.', outputSection: 'Assessment & Plan', priority: 116 },
    { conditionName: 'xerosis_present', triggerCodes: ['L85.3'], noteFragment: 'Apply skin emollient to affected area daily.', outputSection: 'Assessment & Plan', priority: 117 },
  ]

  for (const rule of derivedRules) {
    await prisma.careflowDerivedRule.upsert({
      where: { id: `derived-${rule.conditionName}` },
      update: rule,
      create: { id: `derived-${rule.conditionName}`, careflowType: CareflowType.at_risk_podiatry, ...rule },
    })
  }
  console.log(`✓ ${derivedRules.length} derived rules seeded`)

  // ─────────────────────────────────────────────────────────────────────────
  // CPT QUALIFIER RULES
  // ─────────────────────────────────────────────────────────────────────────
  const cptRules = [
    { cptCode: '11720', description: 'Debridement of nail(s), 1-5', requiresQualifier: true, minimumClass: 'class_b or class_c', notes: 'Must document qualifying systemic condition + class finding' },
    { cptCode: '11721', description: 'Debridement of nail(s), 6+', requiresQualifier: true, minimumClass: 'class_b or class_c', notes: 'Must document qualifying systemic condition + class finding' },
    { cptCode: '11055', description: 'Paring/cutting of benign hyperkeratotic lesion, single', requiresQualifier: false },
    { cptCode: '11056', description: 'Paring/cutting, 2-4 lesions', requiresQualifier: false },
    { cptCode: '11057', description: 'Paring/cutting, 4+ lesions', requiresQualifier: false },
    { cptCode: '11750', description: 'Excision of nail and nail matrix (ingrown)', requiresQualifier: false, notes: 'Performed in facility' },
    { cptCode: 'G0108', description: 'Diabetes outpatient self-management training', requiresQualifier: false, notes: 'Requires diabetes diagnosis on file' },
    { cptCode: 'G8427', description: 'Documentation of current medications', requiresQualifier: false, notes: 'Fires when medications imported from PCC' },
    { cptCode: 'G8783', description: 'BP controlled/normal', requiresQualifier: false, notes: 'Quality measure — tied to BP status' },
    { cptCode: 'G8950', description: 'BP elevated', requiresQualifier: false, notes: 'Quality measure — tied to BP status' },
    { cptCode: '99307', description: 'SNF subsequent visit — straightforward', requiresQualifier: false, notes: 'E&M — level depends on MDM' },
    { cptCode: '99308', description: 'SNF subsequent visit — low complexity', requiresQualifier: false, notes: 'E&M — level depends on MDM' },
    { cptCode: '99309', description: 'SNF subsequent visit — moderate complexity', requiresQualifier: false, notes: 'E&M — level depends on MDM' },
    { cptCode: '99310', description: 'SNF subsequent visit — high complexity', requiresQualifier: false, notes: 'E&M — level depends on MDM' },
  ]

  for (const rule of cptRules) {
    await prisma.cptQualifierRule.upsert({
      where: { cptCode: rule.cptCode },
      update: rule,
      create: rule,
    })
  }
  console.log(`✓ ${cptRules.length} CPT qualifier rules seeded`)

  console.log('✅ Database seeding complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
