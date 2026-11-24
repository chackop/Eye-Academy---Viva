// Preprocess the reference note PDF into data/note-pages.json.
// Usage: npm run prep-note -- "/path/to/Glaucoma_and_Angle_Closure_Reference_Note.pdf"
// Requires poppler (pdftotext). One entry per PDF page; passages are paragraph/bullet-level
// chunks with the printed page number preserved so every citation is traceable.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const pdf = process.argv[2]
if (!pdf) { console.error('Pass the PDF path'); process.exit(1) }
const pages = Number(execFileSync('pdfinfo', [pdf]).toString().match(/Pages:\s+(\d+)/)[1])

const out = []
let prevLast = null // last chunk of the previous page, used when a sentence runs across a page break
for (let p = 1; p <= pages; p++) {
  const raw = execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdf, '-']).toString()
  const lines = raw.split('\n').map(l => l.replace(/\s+$/, ''))
  // drop running header/footer
  const body = lines.filter(l => !/^\s*eyeacademy\b/.test(l) && !/Glaucoma and angle closure · Eye Academy reference note/.test(l))
  // current section heading = a short line with no trailing period followed by body text
  const chunks = []
  let heading = ''
  let buf = []
  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim()
    if (text.length > 40) chunks.push({ heading, text })
    buf = []
  }
  for (const l of body) {
    const t = l.trim()
    if (!t) { flush(); continue }
    const isHeading = /^[A-Z][A-Za-z ,'()\-–]{2,60}$/.test(t) && !/\.$/.test(t) && !l.startsWith('    ') && t.split(' ').length <= 8
    if (isHeading) { flush(); heading = t; continue }
    // new bullet/term line starts its own chunk (indented lines beginning a sentence-case term)
    if (/^\s{2,}\S/.test(l) && /^[A-Z][^.]{2,60}\.\s/.test(t) && buf.length) flush()
    buf.push(t)
  }
  flush()
  // A chunk that starts lowercase or with a digit continues the previous page's last chunk.
  // Keep its own text as the citable excerpt, but record the lead-in as `context` for retrieval.
  if (chunks.length && prevLast && /^[a-z0-9]/.test(chunks[0].text)) {
    chunks[0].context = prevLast.text.split(/(?<=\.)\s/).slice(0, 2).join(' ') + ' (continued from page ' + (p - 1) + ')'
    chunks[0].heading = chunks[0].heading || prevLast.heading
  }
  prevLast = chunks[chunks.length - 1] || null
  out.push({ page: p, chunks: chunks.map((c, i) => ({ id: `p${p}-c${i + 1}`, page: p, ...c })) })
}
writeFileSync(new URL('../data/note-pages.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(`Wrote ${out.reduce((n, p) => n + p.chunks.length, 0)} passages from ${pages} pages`)
