// สร้างไฟล์นำเข้า MTJ จากแม่แบบ .xlsx ที่ดาวน์โหลดจากหน้านำเข้า (แทน 2 แถวตัวอย่างด้วยข้อมูลรอบ 6)
import * as X from 'xlsx'
import * as fs from 'node:fs'
X.set_fs(fs)
import { readFileSync } from 'node:fs'
const F = '/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6/B/files/'
const wb = X.readFile(F + 'template-case-import-template.xlsx')
const ws = wb.Sheets['ข้อมูล']
const head = X.utils.sheet_to_json(ws, { header: 1 })[0]
const csv = readFileSync(F + 'import-MTJ.csv', 'utf8').replace(/^﻿/, '').trim().split('\n').map(l => l.split(','))
if (csv[0].join() !== head.join()) throw new Error('header mismatch')
const rows = [head, ...csv.slice(1)]
wb.Sheets['ข้อมูล'] = X.utils.aoa_to_sheet(rows.map(r => r.map(v => String(v))))
X.writeFile(wb, F + 'import-MTJ.xlsx')
console.log('rows', rows.length - 1)
