// Fee schedule validation + CSV/paste parsing (pure; no DB). Used by every fee-schedule route.

export interface FeeInput { cptCode: string; amount: number; description: string | null }

/** Validate one entry. Returns the cleaned item or an error message. */
export function normalizeFee(cpt: unknown, amount: unknown, description?: unknown): FeeInput | string {
  const cptCode = String(cpt ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{5}$/.test(cptCode)) return `"${cptCode || '(blank)'}" is not a valid 5-character CPT/HCPCS code`
  const n = typeof amount === 'number' ? amount : Number(String(amount ?? '').replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return `${cptCode}: amount must be greater than 0 and at most 100,000`
  const d = typeof description === 'string' ? description.trim().slice(0, 200) : ''
  return { cptCode, amount: Math.round(n * 100) / 100, description: d || null }
}

/** One CSV/TSV line -> cells. Handles "quoted, cells" and tab-separated paste from a spreadsheet. */
function cells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  const out: string[] = []
  let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

/**
 * Parse pasted/uploaded text. Columns: `cpt_code,description,amount` (CSV with a header) or
 * just `cpt,amount` pairs. A header row (first cell contains "cpt") is skipped. Duplicate
 * codes in one file: the last one wins. All-or-nothing: any bad line is reported with its line number.
 */
export function parseFeeCsv(text: string): { items: FeeInput[]; errors: string[] } {
  const byCode = new Map<string, FeeInput>()
  const errors: string[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const c = cells(line)
    if (i === 0 && /cpt/i.test(c[0]) && !/^[A-Za-z0-9]{5}$/.test(c[0])) return // header
    const r = c.length >= 3 ? normalizeFee(c[0], c[c.length - 1], c.slice(1, -1).join(', ')) : normalizeFee(c[0], c[1])
    if (typeof r === 'string') errors.push(`Line ${i + 1}: ${r}`)
    else byCode.set(r.cptCode, r)
  })
  if (byCode.size === 0 && errors.length === 0) errors.push('No rows found')
  return { items: [...byCode.values()], errors }
}
