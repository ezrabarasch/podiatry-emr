// Self-check for the PDF writer. Run: npx tsx lib/pdf.check.ts
import assert from 'assert'
import { buildPdf, wrap } from './pdf'

assert(wrap('aaaa bbbb '.repeat(30).trim()).every(l => l.length <= 84), 'wrap width')
assert(wrap('x'.repeat(200)).every(l => l.length <= 84), 'hard break of long token')

const pdf = buildPdf([
  { text: 'HEADER', bold: true },
  ...wrap('The quick brown fox '.repeat(60)).map(text => ({ text })),
])
const s = pdf.toString('latin1')
assert(s.startsWith('%PDF-1.4') && s.endsWith('%%EOF'), 'pdf envelope')

const startxref = parseInt(s.slice(s.lastIndexOf('startxref') + 9).trim())
assert(s.slice(startxref, startxref + 4) === 'xref', 'startxref -> xref')

const size = parseInt(s.match(/\/Size (\d+)/)![1])
const rows = s.slice(startxref).split('\n') // [0]=xref [1]="0 N" [2]=free [3..]=objs
for (let n = 1; n < size; n++) {
  const off = parseInt(rows[n + 2].slice(0, 10))
  assert(s.slice(off, off + `${n} 0 obj`.length) === `${n} 0 obj`, `xref offset obj ${n}`)
}
console.log(`OK — ${pdf.length} bytes, ${size - 1} objects`)
