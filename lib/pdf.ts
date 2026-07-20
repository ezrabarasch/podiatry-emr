// Minimal zero-dependency PDF writer for clinical notes.
// Uses the PDF standard-14 monospace font (Courier), so character-count line
// wrapping is exact and no font-metric files are needed at runtime — safe in
// any bundler / Docker deploy. ponytail: text-only, single font family; add a
// real PDF lib only if we need images, tables, or proportional fonts.

export type Line = { text: string; bold?: boolean }

const PAGE_W = 612          // US Letter, points
const PAGE_H = 792
const MARGIN = 54
const SIZE = 10
const LINE_H = 14
const CHARS_PER_LINE = 84   // Courier advance = 0.6*size = 6pt; 504pt usable / 6
const LINES_PER_PAGE = 48

/** Wrap a paragraph to CHARS_PER_LINE, preserving words where possible. */
export function wrap(text: string, width = CHARS_PER_LINE): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    if (raw.length <= width) { out.push(raw); continue }
    let line = ''
    for (const word of raw.split(' ')) {
      if (word.length > width) {
        // hard-break a very long token
        if (line) { out.push(line); line = '' }
        for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width))
        continue
      }
      if ((line + (line ? ' ' : '') + word).length > width) {
        out.push(line)
        line = word
      } else {
        line = line ? `${line} ${word}` : word
      }
    }
    out.push(line)
  }
  return out
}

const esc = (s: string) =>
  s.replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1')

/** Build a PDF Buffer from a flat list of styled lines. */
export function buildPdf(lines: Line[]): Buffer {
  // Paginate.
  const pages: Line[][] = []
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE))
  }
  if (pages.length === 0) pages.push([])

  const N = pages.length
  const f1Obj = 3 + 2 * N       // Courier
  const f2Obj = 4 + 2 * N       // Courier-Bold

  // Build object bodies keyed by object number.
  const objs: Record<number, string> = {}

  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  const kids = pages.map((_, p) => `${3 + p} 0 R`).join(' ')
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${N} >>`

  pages.forEach((pageLines, p) => {
    const pageObj = 3 + p
    const contentObj = 3 + N + p

    let stream = 'BT\n'
    let curFont = ''
    let y = PAGE_H - MARGIN
    pageLines.forEach((ln, idx) => {
      const font = ln.bold ? '/F2' : '/F1'
      if (font !== curFont) { stream += `${font} ${SIZE} Tf\n`; curFont = font }
      if (idx === 0) stream += `${MARGIN} ${y} Td\n`
      else { stream += `0 ${-LINE_H} Td\n`; y -= LINE_H }
      stream += `(${esc(ln.text)}) Tj\n`
    })
    stream += 'ET'

    const len = Buffer.byteLength(stream, 'latin1')
    objs[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${f1Obj} 0 R /F2 ${f2Obj} 0 R >> >> ` +
      `/Contents ${contentObj} 0 R >>`
    objs[contentObj] = `<< /Length ${len} >>\nstream\n${stream}\nendstream`
  })

  objs[f1Obj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'
  objs[f2Obj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>'

  // Serialize with a correct xref table.
  const maxObj = f2Obj
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let n = 1; n <= maxObj; n++) {
    offsets[n] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${n} 0 obj\n${objs[n]}\nendobj\n`
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${maxObj + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let n = 1; n <= maxObj; n++) {
    pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return Buffer.from(pdf, 'latin1')
}
