// R14.28 ตรวจ 00_Control_Totals.csv เทียบผลรวม/จำนวนแถวจริงของทุกไฟล์ใน Export Pack v5
// node uat/bin/r14/e28-verify.mjs [โฟลเดอร์ที่แตก zip]
import { readFileSync, readdirSync } from 'node:fs'
const DIR = process.argv[2] ?? 'uat/fixtures/downloads-R14/pack-v5'
function parse(txt) {
  txt = txt.replace(/^﻿/, ''); const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const [h, ...d] = rows.filter(r => r.length > 1 || r[0] !== '')
  return d.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])))
}
const csv = n => parse(readFileSync(`${DIR}/${n}`, 'utf8'))
const sat = v => Math.round(Number(String(v).replace(/,/g, '')) * 100)
const ctl = csv('00_Control_Totals.csv')
let ok = 0, bad = 0
for (const c of ctl.filter(r => r.section === 'file' && r.file.endsWith('.csv'))) {
  const rows = csv(c.file)
  const m = c.item.match(/^(\w+)(?:\[(\w+)\])?$/)
  const sel = m[2] ? rows.filter(r => r.direction === m[2]) : rows
  const sum = sel.reduce((s, r) => s + sat(r[m[1]] || 0), 0)
  const rc = Number(c.row_count), want = sat(c.amount_baht)
  const good = rc === rows.length && sum === want
  good ? ok++ : bad++
  console.log(`${good ? 'OK ' : 'BAD'} ${c.file} ${c.item}: ctl rows ${rc} / file ${rows.length}${m[2] ? ` (${m[2]} ${sel.length})` : ''} · ctl ${c.amount_baht} / sum ${(sum / 100).toFixed(2)}`)
}
// summary lines — ตรวจตามนิยามในคำอธิบาย
const sumOf = (rows, k) => rows.reduce((s, r) => s + sat(r[k] || 0), 0) / 100
const ti = csv('12_Tax_Invoices.csv'), act = ti.filter(r => !/cancel|ยกเลิก/i.test(r.status))
console.log('summary output_vat (active):', act.length, sumOf(act, 'vat_baht').toFixed(2), '· before VAT active', sumOf(act, 'amount_before_vat_baht').toFixed(2))
for (const s of ctl.filter(r => r.section === 'summary')) console.log('  ', s.file, s.item, s.row_count, s.amount_baht)
console.log('12 rows:'); for (const r of ti) console.log('  ', r.invoice_number, r.invoice_date, r.document_type, r.amount_before_vat_baht, r.vat_baht, r.total_baht, r.status, r.cancel_reason, r.replaced_by, r.received_date, r.billing_batch_number)
console.log('xlsx 08 present:', readdirSync(DIR).includes('08_Document_Checklist.xlsx'))
console.log(`RESULT ${ok} OK / ${bad} BAD`)
