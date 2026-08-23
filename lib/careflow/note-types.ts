// Shared shape for the structured, A/P-labeled parallel to the plain
// noteText string. Built in assembleNote() (app/api/visits/[id]/generate/route.ts),
// consumed by the web note view (app/visits/[id]/note/page.tsx) and the PDF
// route (app/api/visits/[id]/pdf/route.ts) — one source of truth so all three
// don't drift out of sync with hand-kept mirrors.
export type NoteNode =
  | { type: 'header'; text: string }
  | { type: 'item'; label: string | null; text: string }
