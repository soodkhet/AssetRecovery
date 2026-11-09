import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
for (const f of process.argv.slice(2)) {
  const wb = XLSX.read(readFileSync(f))
  console.log('== ' + f.split('/').pop())
  for (const n of wb.SheetNames) { console.log('-- sheet', n); console.log(XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }).split('\n').slice(0, 40).join('\n')) }
}
