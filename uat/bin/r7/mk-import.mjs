// ตัวสร้างไฟล์นำเข้าเคสจำนวนมาก (mytester รอบ 7 · S6) — ข้อมูลไทยสมจริง · IMEI 15 หลักไม่ซ้ำกับของในฐาน staging
//   UAT_TARGET=staging node uat/bin/r7/mk-import.mjs --template=<template.xlsx> --out=<dir> --prefix=MT7 \
//       --company=MTJ:20 --company=NDP:20 --company=SPC:16 --company=KTP:14 --company=PLS:14 [--seed=7]
// ได้ไฟล์ import-<code>.xlsx + .csv ต่อบริษัท (หัวคอลัมน์จากแม่แบบที่ดาวน์โหลดจากหน้านำเข้า) + manifest.json
// อ่านฐานแบบ READ ONLY (staging-prep.sh q) เพื่อกัน IMEI/case_ref ซ้ำ · ไม่เขียนอะไรลงฐาน
import * as X from 'xlsx'
import * as fs from 'node:fs'
import { execFileSync } from 'node:child_process'
X.set_fs(fs)

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const companies = process.argv.filter(a => a.startsWith('--company=')).map(a => { const [code, n] = a.slice(10).split(':'); return { code, n: Number(n) } })
const TEMPLATE = arg('template'); const OUT = arg('out'); const PREFIX = arg('prefix', 'MT7')
if (!TEMPLATE || !OUT || companies.length === 0) { console.error('ต้องมี --template --out --company=CODE:N'); process.exit(1) }
fs.mkdirSync(OUT, { recursive: true })

// PRNG กำหนดได้ — รันซ้ำ seed เดิมได้ไฟล์เดิม (noise ของไฟล์ไม่จำเป็นเพราะเป็นข้อมูลนำเข้า ไม่ใช่ไฟล์หลักฐาน)
let s = Number(arg('seed', String(Date.now() % 100000)))
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = a => a[Math.floor(rnd() * a.length)]
const digits = n => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('')

function q(sql) {
  const out = execFileSync('uat/bin/staging-prep.sh', ['q', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l))
}
const usedImei = new Set([
  ...q("SELECT imei v FROM cases WHERE imei IS NOT NULL").map(r => r.v),
  ...q("SELECT imei_contract v FROM assets WHERE imei_contract IS NOT NULL").map(r => r.v),
])
const usedRef = new Set(q('SELECT case_ref v FROM cases').map(r => r.v))

const FIRST_M = ['สมชาย', 'ประเสริฐ', 'วีระพงษ์', 'ณัฐวุฒิ', 'อนุชา', 'ธนากร', 'สุรเชษฐ์', 'พงศกร', 'กฤษดา', 'ชยพล', 'ศุภชัย', 'อภิสิทธิ์', 'ภานุวัฒน์', 'ธีรวัฒน์', 'วรวุฒิ']
const FIRST_F = ['สุภาพร', 'กาญจนา', 'วิไลวรรณ', 'ปิยะนุช', 'อรอุมา', 'จันทร์เพ็ญ', 'ศิริพร', 'นภัสสร', 'ชลธิชา', 'พรทิพย์', 'รัตนาภรณ์', 'ดวงใจ', 'มณีรัตน์', 'สุดารัตน์']
const LAST = ['ศรีสุข', 'บุญมา', 'แสงทอง', 'ทองคำ', 'วงศ์สวัสดิ์', 'จันทร์หอม', 'พึ่งบุญ', 'รัตนพันธ์', 'มีสุข', 'ประเสริฐศรี', 'ชัยมงคล', 'สายบุญ', 'อินทร์แก้ว', 'เพชรรัตน์', 'กิตติวงศ์', 'ธนสาร']
// [จังหวัด, อำเภอ/เขต, ตำบล/แขวง, รหัสไปรษณีย์, ถนน] — ชุดที่สอดคล้องกันจริง
const ADDR = [
  ['กรุงเทพมหานคร', 'จตุจักร', 'ลาดยาว', '10900', 'ถนนงามวงศ์วาน'],
  ['กรุงเทพมหานคร', 'บางกะปิ', 'หัวหมาก', '10240', 'ถนนรามคำแหง'],
  ['กรุงเทพมหานคร', 'ห้วยขวาง', 'ห้วยขวาง', '10310', 'ถนนประชาราษฎร์บำเพ็ญ'],
  ['นนทบุรี', 'ปากเกร็ด', 'บางตลาด', '11120', 'ถนนแจ้งวัฒนะ'],
  ['ปทุมธานี', 'ธัญบุรี', 'ประชาธิปัตย์', '12130', 'ถนนรังสิต-นครนายก'],
  ['สมุทรปราการ', 'เมืองสมุทรปราการ', 'สำโรงเหนือ', '10270', 'ถนนเทพารักษ์'],
  ['ชลบุรี', 'บางละมุง', 'หนองปรือ', '20150', 'ถนนสุขุมวิท'],
  ['เชียงใหม่', 'เมืองเชียงใหม่', 'ช้างเผือก', '50300', 'ถนนโชตนา'],
  ['ขอนแก่น', 'เมืองขอนแก่น', 'ในเมือง', '40000', 'ถนนมิตรภาพ'],
  ['นครราชสีมา', 'เมืองนครราชสีมา', 'ในเมือง', '30000', 'ถนนมิตรภาพ'],
  ['สงขลา', 'หาดใหญ่', 'หาดใหญ่', '90110', 'ถนนเพชรเกษม'],
  ['ระยอง', 'เมืองระยอง', 'เนินพระ', '21000', 'ถนนสุขุมวิท'],
]
// [ยี่ห้อ/รุ่น, TAC 8 หลัก, ความจุ[], สี[], ราคาช่วง]
const MODELS = [
  ['Apple iPhone 14', '35000235', ['128GB', '256GB'], ['ดำ', 'ขาว', 'ม่วง'], [16000, 24000]],
  ['Apple iPhone 15', '35016850', ['128GB', '256GB'], ['ฟ้า', 'ชมพู', 'ดำ'], [22000, 32000]],
  ['Samsung Galaxy A54', '35018127', ['128GB', '256GB'], ['เขียว', 'ดำ', 'ม่วง'], [9000, 15000]],
  ['Samsung Galaxy S23', '35001965', ['256GB'], ['ครีม', 'ดำ'], [18000, 26000]],
  ['OPPO Reno 10', '86155306', ['256GB'], ['ฟ้า', 'เทา'], [9000, 14000]],
  ['vivo V29', '86803806', ['256GB'], ['ม่วง', 'ดำ'], [10000, 15000]],
  ['Xiaomi Redmi Note 13', '86437007', ['128GB', '256GB'], ['ดำ', 'ฟ้า'], [5000, 9000]],
]

function thaiId() {
  const d = [pick(['1', '3']), ...digits(11).split('')].map(Number)
  const sum = d.reduce((a, v, i) => a + v * (13 - i), 0)
  return d.join('') + String((11 - (sum % 11)) % 10)
}
function imei(tac) {
  for (;;) { const v = tac + digits(7); if (!usedImei.has(v)) { usedImei.add(v); return v } }
}

const wb0 = X.readFile(TEMPLATE)
const sheetName = wb0.SheetNames.includes('ข้อมูล') ? 'ข้อมูล' : wb0.SheetNames[0]
const head = X.utils.sheet_to_json(wb0.Sheets[sheetName], { header: 1 })[0].map(String)
const col = name => { const i = head.indexOf(name); if (i < 0) throw new Error(`แม่แบบไม่มีคอลัมน์ ${name}`); return i }

const manifest = []
const stamp = new Date().toISOString().slice(5, 10).replace('-', '')
for (const { code, n } of companies) {
  const rows = []
  for (let i = 1; i <= n; i++) {
    const ref = `${code}-${PREFIX}-${stamp}-${String(i).padStart(3, '0')}`
    if (usedRef.has(ref)) throw new Error(`case_ref ซ้ำกับในฐาน: ${ref}`)
    const female = rnd() < 0.5
    const name = `${female ? pick(['นางสาว', 'นาง']) : 'นาย'}${pick(female ? FIRST_F : FIRST_M)} ${pick(LAST)}`
    const [prov, amp, tam, zip, road] = pick(ADDR)
    const addr = `${1 + Math.floor(rnd() * 299)}/${1 + Math.floor(rnd() * 99)} หมู่ ${1 + Math.floor(rnd() * 12)} ${road}`
    const [model, tac, caps, colors, [lo, hi]] = pick(MODELS)
    const debt = (Math.floor(lo + rnd() * (hi - lo)) * 100 + Math.floor(rnd() * 100)) / 100
    const r = new Array(head.length).fill('')
    const set = (k, v) => { r[col(k)] = v }
    set('เลขที่สัญญา', ref); set('ชื่อลูกหนี้', name); set('สัญชาติ', 'ไทย'); set('เบอร์มือถือ', `0${pick(['8', '9', '6'])}${digits(8)}`)
    set('ที่อยู่ปัจจุบัน', addr); set('จังหวัด (ปัจจุบัน)', prov); set('ที่อยู่ตามบัตร', addr); set('จังหวัด (ตามบัตร)', prov)
    set('ประเภทสินค้า', 'มือถือ'); set('ยี่ห้อ/รุ่น', model); set('IMEI / Serial', imei(tac)); set('ความจุ', pick(caps)); set('สี', pick(colors))
    set('มูลหนี้คงเหลือ (บาท)', debt.toFixed(2)); set('เลขบัตรประชาชน', thaiId())
    set('รหัสไปรษณีย์ (ปัจจุบัน)', zip); set('อำเภอ/เขต (ปัจจุบัน)', amp); set('ตำบล/แขวง (ปัจจุบัน)', tam)
    set('รหัสไปรษณีย์ (ตามบัตร)', zip); set('อำเภอ/เขต (ตามบัตร)', amp); set('ตำบล/แขวง (ตามบัตร)', tam)
    rows.push(r)
    manifest.push({ company: code, case_ref: ref, imei: r[col('IMEI / Serial')], debt })
  }
  const wb = X.readFile(TEMPLATE)
  wb.Sheets[sheetName] = X.utils.aoa_to_sheet([head, ...rows])
  X.writeFile(wb, `${OUT}/import-${code}.xlsx`)
  fs.writeFileSync(`${OUT}/import-${code}.csv`, '﻿' + [head, ...rows].map(r => r.map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n')
  console.log(`${code}: ${rows.length} แถว → ${OUT}/import-${code}.xlsx`)
}
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`รวม ${manifest.length} เคส · manifest.json`)
