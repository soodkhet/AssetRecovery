// ตรวจช่องยอดเงินรับเฉพาะตัวเลข (มติผู้ใช้ 15/10/2569) — localhost เท่านั้น · บล็อก non-GET /api/ (ไม่บันทึกจริง)
import { openAs, IS_LOCAL } from '../lib.mjs'
if (!IS_LOCAL) throw new Error('local only')
const OUT = process.env.SHOT_DIR
const results = []
let blocked = []

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

async function paste(loc, text) {
  await loc.evaluate((el, t) => {
    el.focus(); el.select()
    const dt = new DataTransfer(); dt.setData('text/plain', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)
  await loc.page().waitForTimeout(100)
  return loc.inputValue()
}

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

async function probe(page, loc, name, { shotName } = {}) {
  await loc.scrollIntoViewIfNeeded()
  const r = { name, inputmode: await loc.getAttribute('inputmode'), type: await loc.getAttribute('type') }
  const typed = async (t) => { await loc.fill(''); await loc.pressSequentially(t, { delay: 20 }); return loc.inputValue() }
  r.abc = await typed('abc')
  r.mixed = await typed('12a.3b4')
  r.dec3 = await typed('1.234')
  r.neg = await typed('-50')
  r.thai = await typed('๑๒ก')
  await loc.fill('')
  r.paste1500 = await paste(loc, '1,500.25')
  await loc.fill('')
  r.paste12x = await paste(loc, '12x')
  r.bulkNeg = await bulk(loc, '-50')
  r.bulk1e5 = await bulk(loc, '1e5')
  r.bulkBaht = await bulk(loc, '฿1,500')
  r.bulkComma = await bulk(loc, '1,500')
  // วางกลางค่า ⇒ เคอร์เซอร์อยู่หลังข้อความที่วาง
  await loc.fill('1000')
  r.caret = await loc.evaluate(async (el) => {
    el.focus(); el.setSelectionRange(1, 1)
    const dt = new DataTransfer(); dt.setData('text/plain', '2,5')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return `${el.value}@${el.selectionStart}`
  })
  r.pass = r.abc === '' && r.mixed === '12.34' && r.dec3 === '1.23' && r.neg === '50' && r.thai === '' && r.paste1500 === '1500.25' && r.paste12x === '' && r.inputmode === 'decimal' &&
    r.bulkNeg === '' && r.bulk1e5 === '' && r.bulkBaht === '' && r.bulkComma === '1500' && r.caret === '125000@3'
  await loc.fill(''); await loc.pressSequentially('1500.25')
  if (shotName && OUT) await page.screenshot({ path: `${OUT}/${shotName}.png` })
  results.push(r)
  console.log(JSON.stringify(r))
  return r
}

let curPage
async function step(label, fn) {
  try { await fn() } catch (e) { if (curPage && OUT) await curPage.screenshot({ path: `${OUT}/fail-${label.replace(/\s+/g, '-')}.png` }).catch(() => {}); console.log(`STEP FAIL ${label}: ${e.message.split('\n')[0]}`); results.push({ name: label, error: e.message.split('\n')[0] }) }
}

const mode = process.argv[2] ?? 'desktop'
if (mode === 'desktop') {
  const { browser, context, page, consoleErrors } = await openAs('admin')
  await guard(context)
  page.setDefaultTimeout(15000)
  curPage = page
  const B = 'http://localhost:3000'

  await step('settings-approval policy', async () => {
    await page.goto(`${B}/settings/finance?tab=approval`)
    await probe(page, page.locator('#policy-advance-max'), 'finance-policy: เพดานเงินทดรองต่อครั้ง', { shotName: '01-finance-policy' })
    await probe(page, page.locator('#policy-writeoff'), 'finance-policy: เพดานตัดส่วนต่าง')
  })
  await step('settings-tax threshold', async () => {
    await page.goto(`${B}/settings/finance?tab=tax`)
    await page.getByRole('button', { name: /เพิ่ม|สร้าง/ }).first().click()
    await probe(page, page.locator('#tax-threshold'), 'tax-profile: ยอดขั้นต่ำที่ต้องหัก', { shotName: '02-tax-threshold' })
  })
  await step('compensation', async () => {
    await page.goto(`${B}/settings/compensation`)
    await page.getByRole('button', { name: /สร้างแผนค่าตอบแทน/ }).click()
    await probe(page, page.locator('#plan-allowance'), 'comp-plan: เบี้ยเลี้ยง', { shotName: '03-comp-plan' })
    await probe(page, page.locator('#plan-commission'), 'comp-plan: ค่าคอมมิชชั่น')
  })
  await step('service-fee', async () => {
    await page.goto(`${B}/settings/service-fee`)
    await page.getByRole('button', { name: /สร้างเทมเพลต/ }).click()
    await page.getByRole('dialog').getByLabel(/เรียกเก็บกรณีไม่สำเร็จ/).check()
    await probe(page, page.locator('#sf-fail-fee'), 'service-fee: ค่าบริการกรณีไม่สำเร็จ', { shotName: '04-service-fee' })
  })
  await step('finance advance', async () => {
    await page.goto(`${B}/finance?tab=advances`)
    await page.getByRole('button', { name: /ขอเงินทดรอง|ขอเบิกเงินทดรอง/ }).first().click()
    await probe(page, page.getByLabel(/ยอดเงินที่ขอเบิก/), 'advance-form: ยอดเงินที่ขอเบิก', { shotName: '05-advance-form' })
    // ค่าที่ถูก ⇒ ส่งได้ปกติ (คำขอถูกบล็อกที่ probe — ไม่บันทึกจริง) ดู amount ที่ส่ง
    const dialog = page.getByRole('dialog')
    const payee = dialog.locator('select').first()
    if (await payee.count()) { const opts = await payee.locator('option').allTextContents(); if (opts.length > 1) await payee.selectOption({ index: 1 }) }
    await dialog.getByLabel(/วัตถุประสงค์/).fill('ทดสอบช่องเงิน probe')
    await dialog.locator('input[type=date]').first().fill('2026-10-30')
    await dialog.getByRole('button', { name: /ส่ง|ขอเบิก|บันทึก/ }).last().click()
    await page.waitForTimeout(1500)
    if (OUT) await page.screenshot({ path: `${OUT}/05b-advance-submit.png` })
  })
  await step('finance manual claim', async () => {
    await page.goto(`${B}/finance?tab=approval`)
    await page.getByRole('button', { name: /สร้างรายการเบิกเอง/ }).click()
    const amt = page.getByRole('dialog').getByLabel(/^ยอดเงิน \(บาท\)/)
    await probe(page, amt, 'manual-claim: ยอดเงิน', { shotName: '06-manual-claim' })
    // ค่าที่ถูกแล้วส่งได้ปกติ — ไม่มีข้อผิดของช่องเงิน · กดส่งแล้ว (ช่องอื่นอาจยังไม่ครบ) ดูว่ามีข้อผิดของยอดหรือไม่
    await amt.fill(''); await amt.pressSequentially('1500.25')
    const errId = await amt.getAttribute('aria-describedby')
    console.log('manual-claim amount aria-invalid=', await amt.getAttribute('aria-invalid'), 'describedBy=', errId)
  })
  await step('adjustment', async () => {
    await page.goto(`${B}/finance?tab=adjustment`)
    await page.getByRole('button', { name: /สร้าง Adjustment/ }).click()
    const amt = page.getByRole('dialog').locator('input[id$="-amount"]')
    await probe(page, amt, 'adjustment: ยอดปรับ', { shotName: '07-adjustment' })
  })
  await step('case submit debt', async () => {
    await page.goto(`${B}/cases/submit`)
    const btn = page.getByRole('button', { name: /ส่งเคสใหม่|เพิ่มเคส|สร้างเคส|\+ / }).first()
    if (await page.locator('#asset-debt').count() === 0) await btn.click()
    await probe(page, page.locator('#asset-debt'), 'case-form: มูลหนี้คงเหลือ', { shotName: '08-case-debt' })
  })
  console.log('BLOCKED', JSON.stringify(blocked))
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.slice(0, 10)))
  await browser.close()
} else {
  const { browser, context, page, consoleErrors } = await openAs(process.env.AGENT ?? 'uat.agent.in1', { mobile: true })
  await guard(context)
  page.setDefaultTimeout(15000)
  curPage = page
  const B = 'http://localhost:3000'
  await step('field hotel', async () => {
    await page.goto(`${B}/field/expenses`)
    await page.getByText('เบิกแยก', { exact: true }).click()
    await page.getByRole('button', { name: /เบิกที่พัก/ }).first().click()
    const amt = page.getByRole('dialog').getByLabel(/^จำนวนเงิน \(บาท\)/)
    await probe(page, amt, 'field hotel-claim: จำนวนเงิน (iPhone 14)', { shotName: '09-field-hotel-mobile' })
  })
  await step('field advance', async () => {
    await page.goto(`${B}/field/advances`)
    await page.getByRole('button', { name: /ขอเงินทดรอง/ }).first().click()
    await probe(page, page.getByLabel(/ยอดเงินที่ขอเบิก/), 'field advance-form: ยอดเงินที่ขอเบิก (iPhone 14)', { shotName: '10-field-advance-mobile' })
  })
  console.log('BLOCKED', JSON.stringify(blocked))
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.slice(0, 10)))
  await browser.close()
}
console.log('SUMMARY', results.filter((r) => r.pass).length, '/', results.length)
