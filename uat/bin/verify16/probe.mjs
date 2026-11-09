// ตรวจบน staging หลัง push 5e44515e (16/10/2569) — อ่านอย่างเดียว · บล็อก non-GET /api/ (ไม่บันทึกจริง)
// ใช้: UAT_TARGET=staging SHOT_DIR=<dir> node uat/bin/verify16/probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR
mkdirSync(OUT, { recursive: true })
const results = []
const blocked = []
async function guard(context) {
  await context.route('**/api/**', (route) => {
    const req = route.request()
    if (req.method() !== 'GET' && !/auth|login|logout|session/.test(req.url())) {
      blocked.push(`${req.method()} ${new URL(req.url()).pathname}`)
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'BLOCKED_BY_PROBE', message: 'probe' } }) })
    }
    return route.continue()
  })
}

// 1) เบอร์โทรบริษัทไฟแนนซ์ (superadmin) — ข้ามด้วย SKIP_COMPANY=1
if (process.env.SKIP_COMPANY !== '1') {
  const s = await openAs('superadmin')
  await guard(s.context)
  const page = s.page
  await page.goto(`${BASE}/settings/companies`)
  await page.getByRole('button', { name: /แก้ไขบริษัท/ }).first().click()
  const phone = page.locator('#co-phone')
  const contact = page.locator('#co-contact-phone')
  await phone.waitFor()
  const orig = { phone: await phone.inputValue(), contact: await contact.inputValue() }
  results.push({ step: 'attrs', phoneType: await phone.getAttribute('type'), contactType: await contact.getAttribute('type'), maxLength: await phone.getAttribute('maxlength'), placeholder: await phone.getAttribute('placeholder') })
  const submitBtn = page.getByRole('button', { name: 'บันทึกการแก้ไข' })
  const errText = async (id) => (await page.locator(`#${id}`).locator('xpath=ancestor::*[1]/following-sibling::*|ancestor::*[2]//p[contains(@class,"text-red")]').allTextContents()).join(' ').trim()
  for (const [p, c] of [['โทรหาคุณเอ', '02-111-22'], ['02-111-2233 ต่อ 12', '+66 81 234 5678'], ['', '']]) {
    await phone.fill(p); await contact.fill(c)
    await submitBtn.click()
    await page.waitForTimeout(600)
    const errs = await page.locator('p.text-red-600, [role="alert"]').allTextContents()
    const reasonOpen = await page.getByText(/เหตุผล/).first().isVisible().catch(() => false)
    results.push({ step: 'submit', phone: p, contact: c, errors: errs.filter((t) => /เบอร์/.test(t)), reasonModal: reasonOpen })
    await page.screenshot({ path: `${OUT}/company-phone-${results.length}.png` })
    // ปิดกล่องเหตุผลถ้าเปิด (ไม่ยืนยัน)
    if (reasonOpen) {
      const cancel = page.getByRole('button', { name: /ยกเลิก/ }).last()
      if (await cancel.isVisible().catch(() => false)) await cancel.click()
      await page.waitForTimeout(300)
    }
  }
  results.push({ step: 'orig', ...orig })
  results.push({ step: 'company-errors', console: s.consoleErrors.slice(0, 5), server: s.serverErrors })
  await s.browser.close()
}

// 2) ปุ่ม "ตรวจแล้ว" การเคลียร์เงินทดรอง (uat.finance) — ข้ามด้วย SKIP_ADVANCE=1
if (process.env.SKIP_ADVANCE !== '1') {
  const s = await openAs('uat.finance')
  await guard(s.context)
  const page = s.page
  const api = await page.request.get(`${BASE}/api/advances?pageSize=100`)
  const body = await api.json()
  const rows = (body.data?.items ?? body.data ?? []).filter((a) => a.status === 'cleared')
  results.push({ step: 'cleared-advances', status: api.status(), rows: rows.map((a) => ({ ref: a.ref, reviewed: a.clearReviewedAt !== null, receipt: a.receiptFileUrl !== null, crt: a.substituteReceipt?.status ?? null, crtNo: a.substituteReceipt?.receiptNumber ?? null })) })
  await page.goto(`${BASE}/finance?tab=advances`)
  await page.waitForTimeout(2500)
  const btns = page.getByRole('button', { name: 'ตรวจแล้ว', exact: true })
  const n = await btns.count()
  const states = []
  for (let i = 0; i < n; i++) states.push({ disabled: await btns.nth(i).isDisabled(), title: await btns.nth(i).getAttribute('title') })
  results.push({ step: 'review-buttons', count: n, states })
  await page.screenshot({ path: `${OUT}/advance-tab.png`, fullPage: true })
  results.push({ step: 'advance-errors', console: s.consoleErrors.slice(0, 5), server: s.serverErrors })
  await s.browser.close()
}
results.push({ blocked })
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
