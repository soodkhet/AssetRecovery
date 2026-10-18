// AG6 (S6) — ทำไฟล์นำเข้า 20 แถวที่มี 1 แถว IMEI 14 หลัก (ตัดหลักสุดท้าย) จากไฟล์ที่ mk-import สร้าง
//   node uat/bin/r7/ag6-mkbad.mjs <in.xlsx> <out.xlsx> [rowIndex=7]
import * as X from 'xlsx'
import * as fs from 'node:fs'
X.set_fs(fs)
const [inp, out, ri = '7'] = process.argv.slice(2)
const wb = X.readFile(inp)
const sn = wb.SheetNames.includes('ข้อมูล') ? 'ข้อมูล' : wb.SheetNames[0]
const aoa = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
const c = aoa[0].indexOf('IMEI / Serial')
const r = aoa[Number(ri)]
const before = r[c]; r[c] = String(before).slice(0, 14)
wb.Sheets[sn] = X.utils.aoa_to_sheet(aoa)
X.writeFile(wb, out)
console.log(`แถวข้อมูลที่ ${ri} (${r[aoa[0].indexOf('เลขที่สัญญา')]}) IMEI ${before} → ${r[c]} (${r[c].length} หลัก) → ${out}`)
