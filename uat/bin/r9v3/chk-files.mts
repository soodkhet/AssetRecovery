// ตรวจไฟล์ส่งออกใน uat/fixtures/downloads-R9v3 — ใช้: node_modules/.bin/tsx uat/bin/r9v3/chk-files.mts [filter]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { extractPdfText } from '../../../components/pdf/extract-text'
const DIR = 'uat/fixtures/downloads-R9v3'
const f = process.argv[2] ?? ''
const BAD = [/§/, /ไฟล์ \d/, /\(\d{2}\)/, /20\d\d[-/]\d\d/, /\b2026\b/, /[0-9]{2}\/[0-9]{2}\/20\d\d/, /�/]
for (const name of readdirSync(DIR).filter(n => n.includes(f)).sort()) {
  const path = `${DIR}/${name}`; const size = statSync(path).size
  let text = ''
  if (name.endsWith('.xlsx')) {
    const wb = XLSX.read(readFileSync(path))
    const out: string[] = [`sheets=${wb.SheetNames.join(',')}`]
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: false })
      for (const r of rows.slice(0, 40)) out.push('  ' + r.map(v => (typeof v === 'number' ? `#${v}` : String(v ?? ''))).join(' | '))
    }
    text = out.join('\n')
  } else if (name.endsWith('.pdf')) {
    text = extractPdfText(readFileSync(path)).replace(/\n/g, '').replace(/[ \t]+/g, ' ')
  } else continue
  const bad = BAD.filter(re => re.test(text)).map(String)
  const amCount = (text.match(/ำ/g) ?? []).length
  console.log(`===== ${name} (${size}B) bad=${JSON.stringify(bad)} ำ=${amCount}\n${text.slice(0, 2600)}`)
}
