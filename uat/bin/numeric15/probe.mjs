// ตรวจช่องตัวเลขที่ไม่ใช่เงินรับเฉพาะตัวเลข (มติผู้ใช้ 15/10/2569) — localhost เท่านั้น · บล็อก non-GET /api/ (ไม่บันทึกจริง)
// ใช้: SHOT_DIR=<dir> node uat/bin/numeric15/probe.mjs desktop|mobile
import { openAs, IS_LOCAL } from '../lib.mjs'
if (!IS_LOCAL) throw new Error('local only')
const OUT = process.env.SHOT_DIR
const results = []
const blocked = []

async function guard(context) {
  await context.route('**/api/**', (route) => {
    const req = route.request()
    if (req.method() !== 'GET' && !/auth|login|logout|session/.test(req.url())) {
      blocked.push(`${req.method()} ${new URL(req.url()).pathname} ${req.postData() ?? ''}`)
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'BLOCKED_BY_PROBE', message: 'probe' } }) })
    }
    return route.continue()
  })
}

async function typed(loc, text) {
  await loc.fill('')
  await loc.pressSequentially(text, { delay: 15 })
  return loc.inputValue()
}

async function paste(loc, text) {
  await loc.fill('')
  await loc.evaluate((el, t) => {
    el.focus(); el.select()
    const dt = new DataTransfer(); dt.setData('text/plain', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)
  await loc.page().waitForTimeout(100)
  return loc.inputValue()
}

/** ค่าเข้าเป็นก้อน (autofill/เสนอคำ) */
async function bulk(loc, text) {
  await loc.fill('')
  await loc.evaluate((el, t) => {
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, t)
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: t }))
  }, text)
  await loc.page().waitForTimeout(100)
  return loc.inputValue()
}

const ACT = { type: typed, paste, bulk }

/** cases: [action, input, expected][] */
async function probe(page, loc, name, inputmode, cases, { shotName, finalValue } = {}) {
  await loc.scrollIntoViewIfNeeded()
  const r = { name, inputmode: await loc.getAttribute('inputmode'), type: await loc.getAttribute('type'), checks: [], pass: true }
  if (r.type !== 'text' || r.inputmode !== inputmode) r.pass = false
  for (const [action, input, expected] of cases) {
    const got = await ACT[action](loc, input)
    const ok = got === expected
    if (!ok) r.pass = false
    r.checks.push(`${action}(${JSON.stringify(input)})=${JSON.stringify(got)}${ok ? '' : ` ✗ expected ${JSON.stringify(expected)}`}`)
  }
  if (finalValue !== undefined) { await loc.fill(''); await loc.pressSequentially(finalValue) }
  if (shotName && OUT) await page.screenshot({ path: `${OUT}/${shotName}.png` })
  results.push(r)
  console.log(JSON.stringify(r))
  return r
}

let curPage
async function step(label, fn) {
  try { await fn() } catch (e) {
    if (curPage && OUT) await curPage.screenshot({ path: `${OUT}/fail-${label.replace(/\s+/g, '-')}.png` }).catch(() => {})
    console.log(`STEP FAIL ${label}: ${e.message.split('\n')[0]}`)
    results.push({ name: label, error: e.message.split('\n')[0] })
  }
}

// กลุ่ม 1 — ทศนิยม/เปอร์เซ็นต์ 2 ตำแหน่ง
const PCT = [
  ['type', 'abc', ''], ['type', '7a.5e0-', '7.50'], ['type', '2.505', '2.50'], ['type', '-3', '3'],
  ['paste', ' 2.50 ', '2.50'], ['paste', '3%', ''], ['paste', '3,5', ''], ['bulk', '-3', ''], ['bulk', '1e2', ''],
]
// กลุ่ม 2 — จำนวนเต็มไม่ติดลบ
const INT = [
  ['type', 'abc', ''], ['type', '-1e2', '12'], ['type', '1.5', '15'], ['type', '007', '007'],
  ['paste', '1,000', '1000'], ['paste', '12x', ''], ['paste', '-5', ''], ['bulk', '2e3', ''],
]

const mode = process.argv[2] ?? 'desktop'
const B = 'http://localhost:3000'
if (mode === 'desktop') {
  const { browser, context, page, consoleErrors } = await openAs('admin')
  await guard(context)
  page.setDefaultTimeout(15000)
  curPage = page

  await step('vat', async () => {
    await page.goto(`${B}/settings/finance?tab=vat`)
    await page.getByRole('button', { name: /เพิ่มอัตรา VAT/ }).click()
    await probe(page, page.locator('#vat-rate'), 'G1 vat-rate: อัตรา VAT (%)', 'decimal', PCT, { shotName: '01-vat-rate', finalValue: '7.25' })
  })
  await step('tax profile', async () => {
    await page.goto(`${B}/settings/finance?tab=tax`)
    await page.getByRole('button', { name: /เพิ่ม|สร้าง/ }).first().click()
    await probe(page, page.locator('#tax-wht-pct'), 'G1 tax-wht-pct: อัตราหัก ณ ที่จ่าย (%)', 'decimal', PCT, { shotName: '02-tax-wht' })
  })
  await step('service fee', async () => {
    await page.goto(`${B}/settings/service-fee`)
    await page.getByRole('button', { name: /สร้างเทมเพลต/ }).click()
    await probe(page, page.locator('#sf-rate'), 'G1 sf-rate: อัตราความสำเร็จ (%)', 'decimal', PCT, { shotName: '03-sf-rate' })
  })
  await step('sla', async () => {
    await page.goto(`${B}/settings/finance?tab=sla`)
    await probe(page, page.locator('#sla-hours'), 'G2 sla-hours: เกณฑ์ SLA (ชั่วโมง)', 'numeric', INT, { shotName: '04-sla', finalValue: '48' })
    // ค่าถูกส่งได้ — payload (คำขอถูกบล็อก ไม่บันทึกจริง)
    await page.locator('textarea').first().fill('ทดสอบช่องตัวเลข probe')
    await page.getByRole('button', { name: /บันทึกเกณฑ์ SLA/ }).click()
    await page.waitForTimeout(1500)
    if (OUT) await page.screenshot({ path: `${OUT}/04b-sla-submit.png` })
  })
  await step('assignment', async () => {
    await page.goto(`${B}/settings/finance?tab=assignment`)
    await probe(page, page.locator('#assignment-reassign-timeout'), 'G2 reassign-timeout (ชั่วโมง)', 'numeric', INT, { shotName: '05-assignment' })
  })
  await step('retention', async () => {
    await page.goto(`${B}/settings/finance?tab=retention`)
    await probe(page, page.locator('#retention-years'), 'G2 retention-years (ปี)', 'numeric', INT, { shotName: '06-retention' })
  })
  await step('aging', async () => {
    await page.goto(`${B}/settings/finance?tab=approval`)
    await probe(page, page.getByLabel('ช่วงอายุหนี้ที่ 1').first(), 'G2 AR aging bucket (วัน)', 'numeric', INT, { shotName: '07-aging', finalValue: '30' })
  })
  await step('bank account', async () => {
    await page.goto(`${B}/settings/finance?tab=bank`)
    await page.getByRole('button', { name: /เพิ่มบัญชี/ }).click()
    await probe(page, page.locator('#bank-account-number'), 'G3 bank-account-number (ขีด/ช่องว่างคั่นได้ ≤30)', 'numeric', [
      ['type', '123-4-56789-0', '123-4-56789-0'], ['type', '12a3b', '123'], ['type', '0012', '0012'],
      ['paste', '123 4 56789 0', '123 4 56789 0'], ['paste', 'abc-12', ''], ['paste', '1'.repeat(31), ''], ['bulk', 'KBANK 1234', ''],
    ], { shotName: '08-bank-account' })
    await probe(page, page.locator('#bank-account-tolerance'), 'G2 bank-account-tolerance (วัน)', 'numeric', INT)
  })
  await step('organization', async () => {
    await page.goto(`${B}/settings/organization`)
    await page.getByRole('button', { name: /แก้ไขข้อมูล/ }).click()
    await probe(page, page.locator('#org-tax-id'), 'G3 org-tax-id (13 หลัก ขีด/ช่องว่างคั่นได้)', 'numeric', [
      ['type', '0105512345678', '0105512345678'], ['type', '01055123456789', '0105512345678'], ['type', '0a1-2', '01-2'],
      ['paste', '0-1055-12345-67-8', '0-1055-12345-67-8'], ['paste', 'TH0105512345678', ''], ['paste', '01055123456789', ''], ['paste', '๐๑๐๕๕๑๒๓๔๕๖๗๘', '0105512345678'],
    ], { shotName: '09-org-tax-id' })
    const kind = page.locator('#org-branch-kind')
    await kind.selectOption('branch')
    await probe(page, page.locator('#org-branch-no'), 'G3 org-branch-no (5 หลัก)', 'numeric', [
      ['type', '00001', '00001'], ['type', '000012', '00001'], ['type', '0-0a1', '001'], ['paste', ' 00001 ', '00001'], ['paste', '0000-1', ''],
    ])
  })
  await step('company', async () => {
    await page.goto(`${B}/settings/companies`)
    await page.getByRole('button', { name: /เพิ่มบริษัท|สร้าง/ }).first().click()
    await probe(page, page.locator('#co-taxid'), 'G3 co-taxid (13 หลัก)', 'numeric', [
      ['type', '0105512345678', '0105512345678'], ['type', 'x0-1', '0-1'], ['paste', '0105 5123 45678', '0105 5123 45678'], ['paste', '0105512345678a', ''],
    ], { shotName: '10-company' })
    await probe(page, page.locator('#co-customer-wht'), 'G1 co-customer-wht (%)', 'decimal', PCT)
  })
  await step('user', async () => {
    await page.goto(`${B}/settings/users`)
    await page.getByRole('button', { name: /สร้างบัญชี/ }).click()
    await probe(page, page.locator('#user-phone'), 'G3 user-phone (ตัวคั่น -().ช่องว่าง ≤10 หลัก)', 'numeric', [
      ['type', '0812345678', '0812345678'], ['type', '08123456789', '0812345678'], ['type', '081-234-5678', '081-234-5678'], ['type', '08a1', '081'],
      ['paste', '(02) 123.4567', '(02) 123.4567'], ['paste', '+66812345678', ''], ['paste', '081 ต่อ 1', ''],
    ], { shotName: '11-user-phone' })
  })
  await step('case form', async () => {
    await page.goto(`${B}/cases/submit`)
    if (await page.locator('#debtor-mobile').count() === 0) await page.getByRole('button', { name: /ส่งเคสใหม่|เพิ่มเคส|สร้างเคส|\+ / }).first().click()
    await probe(page, page.locator('#debtor-mobile'), 'G3 debtor-mobile (วาง +66/ขีด ⇒ แปลงเป็นตัวเลขเดิม)', 'numeric', [
      ['type', '0812345678', '0812345678'], ['type', '08a1-2', '0812'], ['paste', '+66 81-234-5678', '0812345678'], ['paste', '(081) 234.5678', '0812345678'],
      ['paste', '081-234-5678 ต่อ 1', ''], ['bulk', '081abc', ''],
    ], { shotName: '12-case-mobile' })
    await probe(page, page.locator('#debtor-national-id'), 'G3 debtor-national-id (13 หลัก)', 'numeric', [
      ['type', '1234567890123', '1234567890123'], ['type', '1a2-3', '123'], ['paste', '1-2345-67890-12-3', '1234567890123'], ['paste', '12345678901234', ''], ['paste', 'ID1234567890123', ''],
    ])
    const postal = page.getByLabel(/^รหัสไปรษณีย์/).first()
    if (await postal.count()) {
      await probe(page, postal, 'G3 postal (5 หลัก)', 'numeric', [['type', '01000', '01000'], ['type', '1a0-500x1', '10500'], ['paste', '10 500', '10500'], ['paste', '10500-1', '']])
    }
    // IMEI (ไม่แตะ) — ยังพิมพ์ขีด/ช่องว่างได้เหมือนเดิม
    const imei = page.locator('#asset-imei')
    await imei.scrollIntoViewIfNeeded()
    const imeiTyped = await typed(imei, '35-123456 789012 3')
    const r = { name: 'IMEI asset-imei (ไม่แตะ)', inputmode: await imei.getAttribute('inputmode'), checks: [`type=${JSON.stringify(imeiTyped)}`], pass: imeiTyped === '35-123456 789012 3' }
    results.push(r); console.log(JSON.stringify(r))
    if (OUT) await page.screenshot({ path: `${OUT}/13-case-imei.png` })
  })
  console.log('BLOCKED', JSON.stringify(blocked))
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.filter((m) => !/503/.test(m)).slice(0, 10)))
  await browser.close()
} else {
  const { browser, context, page, consoleErrors } = await openAs(process.env.AGENT ?? 'uat.agent.in1', { mobile: true })
  await guard(context)
  page.setDefaultTimeout(15000)
  curPage = page
  await step('field hotel nights', async () => {
    await page.goto(`${B}/field/expenses`)
    await page.getByText('เบิกแยก', { exact: true }).click()
    await page.getByRole('button', { name: /เบิกที่พัก/ }).first().click()
    const nights = page.getByRole('dialog').getByLabel(/^จำนวนคืน/)
    await probe(page, nights, 'G2 field hotel-claim: จำนวนคืน (iPhone 14)', 'numeric', [
      ...INT.filter(([, input]) => input !== '1,000' && input !== '007'), ['type', '123', '12'], ['paste', '100', ''],
    ], { shotName: '14-field-nights-mobile', finalValue: '2' })
  })
  console.log('BLOCKED', JSON.stringify(blocked))
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.filter((m) => !/503/.test(m)).slice(0, 10)))
  await browser.close()
}
console.log('SUMMARY', results.filter((r) => r.pass).length, '/', results.length)
