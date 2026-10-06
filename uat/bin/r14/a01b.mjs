// R14.01 (ต่อ) ส่งตรวจสอบเคสร่าง UAT-CO2-R14 — รอบแรกปิด browser ก่อน dialog ปิดเอง (อัปโหลดไฟล์ที่ 3 ยังไม่จบตอนจับ toast) แต่ร่าง + เอกสาร 3 ไฟล์บันทึกครบ
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts } from './_h.mjs'
const REF = 'UAT-CO2-R14'
const { browser, page, serverErrors } = await openAs('uat.admin')
await page.goto(`${BASE}/cases/submit`); await settle(page); await sleep(800)
log('row draft', (await page.locator('tr', { hasText: REF }).first().innerText()).replace(/\s+/g, ' '))
const resP = page.waitForResponse(x => x.url().includes('/status') && x.request().method() === 'PATCH')
await page.locator('tr', { hasText: REF }).first().getByRole('button', { name: 'ส่งตรวจสอบเคส' }).click()
const res = await resP; log('PATCH submit', res.status(), (await res.text()).slice(0, 300))
log('toasts', await toasts(page, 2500))
await settle(page)
log('row', (await page.locator('tr', { hasText: REF }).first().innerText()).replace(/\s+/g, ' '))
await shot(page, R, '01-case-submitted')
log(q(`select c.status,c.imei,c.debt_amount_satang debt,c.projected_revenue_satang proj,st.name sugg,c.addr_province from cases c left join teams st on st.id=c.suggested_team_id where case_ref='${REF}'`))
log(q(`select d.document_type,d.file_url from case_documents d join cases c on c.id=d.case_id where c.case_ref='${REF}' and d.deleted_at is null`))
log(q(`select action,created_at from audit_logs where target_id=(select id from cases where case_ref='${REF}') order by created_at`))
log('5xx', serverErrors)
await browser.close()
