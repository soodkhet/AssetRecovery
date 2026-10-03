// ตัวช่วยของ R2 role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { toasts, inlineErrors, trackMutations, settle, sleep } from '../r1/_h.mjs'

export const CO1 = 'บริษัท ยูเอที ลิสซิ่ง จำกัด', CO2 = 'บริษัท ยูเอที แคปปิตอล จำกัด'
export const CO1_ID = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2_ID = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
export const TEAM_A = '8dc4fa90-cb6e-425f-9778-3a872b687ff2', TEAM_B = '5074e06b-0925-4571-a1d0-20defad46e70', TEAM_C = 'c89d6982-25f8-4457-aeb6-4c1ab0189c95'
export const CASES = {
  C1: { ref:'UAT-CO1-001', co:CO1, name:'นายสมชาย ใจดีมาก',  nid:'1103700000046', mobile:'0891000001', cur:['กรุงเทพมหานคร','12 ซ.ลาดพร้าว 15 แขวงจอมพล เขตจตุจักร'], idc:['กรุงเทพมหานคร','12 ซ.ลาดพร้าว 15','10900'], type:'smartphone', model:'Samsung Galaxy A55', imei:'356789100000011', debt:'18500.00', debtS:1850000, proj:92500 },
  C2: { ref:'UAT-CO1-002', co:CO1, name:'นางสาวสุดา รักษ์ดี', nid:'1103700000054', mobile:'0891000002', cur:['กรุงเทพมหานคร','45 ถ.พระราม 9 แขวงห้วยขวาง'], idc:['กรุงเทพมหานคร','45 ถ.พระราม 9','10310'], type:'smartphone', model:'iPhone 15 128GB', imei:'356789100000029', debt:'24900.00', debtS:2490000, proj:124500 },
  C3: { ref:'UAT-CO2-003', co:CO2, name:'นายวีระ หายไป', nid:'1103700000062', mobile:'0891000003', cur:['กรุงเทพมหานคร','7 ถ.บางนา-ตราด แขวงบางนา'], idc:['สมุทรปราการ','7 ม.3 ต.บางพลีใหญ่','10540'], type:'smartphone', model:'OPPO Reno 11', imei:'356789100000037', debt:'12000.00', debtS:1200000, proj:749000 },
  C4: { ref:'UAT-CO1-004', co:CO1, name:'นางมณี ส่งช้า', nid:'1103700000071', mobile:'0891000004', cur:['กรุงเทพมหานคร','88 ถ.รัชดาภิเษก แขวงดินแดง'], idc:['กรุงเทพมหานคร','88 ถ.รัชดาภิเษก','10400'], type:'tablet', model:'iPad Air M2', imei:'356789100000045', debt:'31200.00', debtS:3120000, proj:156000 },
  C5: { ref:'UAT-CO2-005', co:CO2, name:'นายประยุทธ์ ไกลบ้าน', nid:'1103700000089', mobile:'0891000005', cur:['ปทุมธานี','9 ม.2 ต.คลองหนึ่ง อ.คลองหลวง'], idc:['ปทุมธานี','9 ม.2 ต.คลองหนึ่ง','12120'], type:'smartphone', model:'vivo V30', imei:'356789100000052', debt:'15900.00', debtS:1590000, proj:749000 },
  C6: { ref:'UAT-CO1-006', co:CO1, name:'นายทดสอบ ซ้ำซ้อน', nid:'3103700000115', mobile:'0891000006', cur:['กรุงเทพมหานคร','1 ถ.สุขุมวิท แขวงคลองเตย'], idc:['กรุงเทพมหานคร','1 ถ.สุขุมวิท','10110'], type:'smartphone', model:'Redmi Note 13', imei:'356789100000060', debt:'20000.00', debtS:2000000, proj:100000 },
  C7: { ref:'UAT-CO2-007', co:CO2, name:'นางสาวปิยะ เงียบ', nid:'3103700000123', mobile:'0891000007', cur:['กรุงเทพมหานคร','3 ถ.เพชรเกษม แขวงบางแค'], idc:['กรุงเทพมหานคร','3 ถ.เพชรเกษม','10160'], type:'smartphone', model:'Samsung Galaxy A35', imei:'356789100000078', debt:'9800.00', debtS:980000, proj:749000 },
  C8: { ref:'UAT-CO1-008', co:CO1, name:'นายไม่ผ่าน เกณฑ์', nid:'3103700000131', mobile:'0891000008', cur:['กรุงเทพมหานคร','5 ถ.จรัญสนิทวงศ์ แขวงบางพลัด'], idc:['กรุงเทพมหานคร','5 ถ.จรัญฯ','10700'], type:'smartphone', model:'iPhone 13', imei:'356789100000086', debt:'16000.00', debtS:1600000, proj:80000 },
}
export function apiBody(c, over = {}) {
  return { caseRef: c.ref, financeCompanyId: c.co === CO1 ? CO1_ID : CO2_ID, debtorName: c.name, debtorNationality: 'TH',
    debtorNationalId: c.nid, debtorPhoneMobile: c.mobile,
    addressCurrent: { province: c.cur[0], detail: c.cur[1] },
    addressIdCard: { province: c.idc[0], detail: c.idc[1], postalCode: c.idc[2] },
    assetType: c.type, assetBrandModel: c.model, assetImeiSerial: c.imei, outstandingDebtSatang: c.debtS, ...over }
}

/** query อ่านอย่างเดียว คืน text */
export function q(sql) {
  return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim()
}
const LOG = 'uat/bin/r2/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); mkdirSync('uat/bin/r2', { recursive: true }); appendFileSync(LOG, s + '\n') }

/** กรอกฟอร์มรับเคส (dlg = dialog) · opts.skipImei, opts.files = {contract, idcard, product} (true=ใช้ fixture ของเคส) */
export async function fillCaseForm(page, dlg, key, opts = {}) {
  const c = CASES[key]
  await dlg.locator('#case-company').selectOption({ label: c.co })
  await dlg.locator('#case-ref').fill(opts.ref ?? c.ref)
  await dlg.locator('#debtor-name').fill(c.name)
  await dlg.locator('#debtor-nationality').selectOption({ label: 'ไทย' }).catch(() => {})
  await dlg.locator('#debtor-national-id').fill(c.nid)
  await dlg.locator('#debtor-mobile').fill(c.mobile)
  const detail = dlg.locator('[id$="-detail"]:is(input,textarea)')
  const postal = dlg.locator('input[id$="-postal"]')
  const prov = dlg.locator('select[id$="-province"]')
  // ที่อยู่ปัจจุบัน (nth 0): จังหวัด + detail ไม่ใส่ postal
  await prov.nth(0).selectOption({ label: c.cur[0] })
  await detail.nth(0).fill(c.cur[1])
  // ที่อยู่ตามบัตร (nth 2): postal ก่อน → lookup
  await postal.nth(2).fill(c.idc[2])
  await page.waitForTimeout(1500)
  const gotProv = await prov.nth(2).inputValue()
  if (gotProv !== c.idc[0]) { log(`  ! lookup จังหวัดบัตร ได้ «${gotProv}» คาด «${c.idc[0]}» → เลือกใหม่`); await prov.nth(2).selectOption({ label: c.idc[0] }) }
  await detail.nth(2).fill(c.idc[1])
  await dlg.locator('#asset-type').selectOption({ label: c.type === 'tablet' ? 'Tablet / iPad' : 'สมาร์ทโฟน' })
  await dlg.locator('#asset-model').fill(c.model)
  if (!opts.skipImei) await dlg.locator('#asset-imei').fill(c.imei)
  await dlg.locator('#asset-debt').fill(c.debt)
  const f = opts.files ?? { contract: true, idcard: true, product: true }
  const fi = dlg.locator('input[type=file]')
  const n = key.slice(1)
  if (f.contract) await fi.nth(0).setInputFiles(`uat/fixtures/files/C${n}-contract.pdf`)
  if (f.idcard) await fi.nth(1).setInputFiles(`uat/fixtures/files/C${n}-idcard.png`)
  if (f.product) await fi.nth(3).setInputFiles(`uat/fixtures/files/C${n}-product.png`)
  return { gotProv }
}

/** ติดตาม request Storage + /documents */
export function trackUploads(page) {
  const out = []
  page.on('response', r => {
    const u = r.url()
    if (u.includes('/storage/v1/object') || (u.includes('/documents') && r.request().method() === 'POST')) out.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110)}`)
  })
  return out
}

export const SQL = {
  caseRow: ref => `select c.case_ref,c.status,c.source,c.imei,c.serial_no,c.debt_amount_satang debt,c.projected_revenue_satang proj,c.projected_revenue_source psrc,st.name sugg,at.name assigned,c.review_note,c.reviewed_at,c.tracking_round tr,c.case_ref_normalized norm from cases c left join teams st on st.id=c.suggested_team_id left join teams at on at.id=c.assigned_team_id where c.case_ref='${ref}'`,
  snap: ref => `select c.case_ref,t.name,t.version,c.service_fee_model_snapshot model,c.service_fee_base_satang base,c.service_fee_rate_pct rate,c.service_fee_basis_snapshot basis,c.service_fee_charge_on_fail cof from cases c left join service_fee_templates t on t.id=c.service_fee_template_id where c.case_ref='${ref}'`,
  docs: ref => `select d.document_type,d.original_name,d.mime_type,d.size_bytes,left(d.file_hash,12) hash12,left(d.file_url,60) url from case_documents d join cases c on c.id=d.case_id where c.case_ref='${ref}' and d.deleted_at is null order by 1`,
  audit: ref => `select a.action,a.actor_role,a.target_type,left(a.reason,90) reason,a.created_at from audit_logs a where a.target_id in (select id from cases where case_ref='${ref}') or a.target_id in (select d.id from case_documents d join cases c on c.id=d.case_id where c.case_ref='${ref}') order by a.created_at`,
  noti: `select n.event_code,n.title,left(n.body,120) body,u.username,n.created_at from notifications n join users u on u.id=n.user_id order by n.created_at desc limit 10`,
}

/** เก็บ toast/alert ทุกข้อความที่โผล่ระหว่าง ms (poll ทุก 250ms) */
export async function collect(page, ms = 4000) {
  const seen = new Set(); const end = Date.now() + ms
  while (Date.now() < end) {
    for (const t of await page.getByRole('status').allInnerTexts().catch(() => [])) { const s = t.replace(/\s+/g, ' ').trim(); if (s) seen.add(s) }
    for (const t of await page.getByRole('alert').allInnerTexts().catch(() => [])) { const s = t.replace(/\s+/g, ' ').trim(); if (s) seen.add('ALERT ' + s) }
    await new Promise(r => setTimeout(r, 250))
  }
  return [...seen]
}
/** ติดตาม response ของ /api ที่ไม่ใช่ GET (status + body สั้น) */
export function trackApi(page) {
  const out = []
  page.on('response', async r => {
    const m = r.request().method(); const u = r.url()
    if (m !== 'GET' && (u.includes('/api/') || u.includes('/storage/v1/'))) {
      let b = ''; try { b = (await r.text()).slice(0, 220) } catch {}
      out.push(`${r.status()} ${m} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)} :: ${b}`)
    }
  })
  return out
}
export const rowText = async (page, ref) => (await page.locator('tr', { hasText: ref }).first().innerText().catch(() => 'NO ROW')).replace(/\s+/g, ' ')
import { readFileSync as _rf } from 'node:fs'
const SUMS = Object.fromEntries(_rf('uat/fixtures/files/SHA256SUMS.tsv', 'utf8').trim().split('\n').slice(1).map(l => { const [f, b, h] = l.split('\t'); return [f, { b: +b, h }] }))
/** ตรวจ case_documents ของเคสเทียบ SHA256SUMS → คืนสรุป */
export function checkDocs(ref) {
  const rows = q(`select d.document_type||'|'||d.original_name||'|'||d.mime_type||'|'||d.size_bytes||'|'||d.file_hash||'|'||d.file_url||'|'||(d.file_url like 'cases/'||c.id||'/%') from case_documents d join cases c on c.id=d.case_id where c.case_ref='${ref}' and d.deleted_at is null order by 1`)
    .split('\n').filter(l => l.includes('|') && !l.includes('?column?')).map(l => l.trim())
  return rows.map(l => { const [t, n, m, s, h, u, pre] = l.split('|'); const e = SUMS[n]; return `${t} ${n} ${m} ${s}B hash${e && e.h === h && e.b === +s ? '=OK' : '≠SUMS'} prefix=${pre} ${u.split('/').slice(0, 3).join('/')}` })
}
