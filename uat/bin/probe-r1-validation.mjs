// probe อ่านอย่างเดียว — กดบันทึกฟอร์มว่าง/ค่าผิดเพื่ออ่าน inline error · กันเขียนด้วย page.route บล็อกทุก non-GET ไป /api
import { openAs, shot, BASE } from './lib.mjs'
const s = await openAs('admin')
const { page } = s
const blocked = []
await page.route('**/api/**', (route) => {
  if (route.request().method() === 'GET') return route.continue()
  blocked.push(`${route.request().method()} ${route.request().url()}`)
  return route.abort()
})
const errs = async (dlg) => (await dlg.locator('.text-red-600, [role=alert], [id$="-error"]').allInnerTexts()).map(t => t.trim()).filter(Boolean)

async function run(path, openBtn, submitBtn, slug, fill) {
  await page.goto(`${BASE}${path}`); await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: openBtn }).first().click()
  const dlg = page.getByRole('dialog'); await dlg.waitFor()
  if (fill) await fill(dlg)
  await dlg.getByRole('button', { name: submitBtn, exact: true }).click()
  await page.waitForTimeout(700)
  console.log(`== ${slug}:`, JSON.stringify(await errs(dlg)))
  await shot(page, 'R1-probe', `${slug}-inline-errors`, { fullPage: true })
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
}
await run('/settings/companies', '+ สร้างบริษัท', 'สร้างบริษัท', 'company-empty')
await run('/settings/users', '+ สร้างบัญชี', 'สร้างบัญชี', 'user-empty')
await run('/settings/users', '+ สร้างบัญชี', 'สร้างบัญชี', 'user-badpass', async (d) => {
  await d.locator('#user-role').selectOption({ index: 1 })
  await d.locator('#user-name').fill('ทดสอบ ฟอร์ม'); await d.locator('#user-username').fill('Probe User!')
  await d.locator('#user-password').fill('abcdefgh'); await d.locator('#user-confirm-password').fill('abcdefgx')
})
await run('/settings/compensation', '+ สร้างเทมเพลต', 'สร้างแผน', 'plan-money', async (d) => {
  await d.locator('#plan-name').fill('probe'); await d.locator('#fuel-rate').fill('-1')
  await d.locator('#plan-allowance').fill('100.505'); await d.locator('#plan-commission').fill('0'); await d.locator('#plan-no-success').fill('abc')
  await d.locator('#plan-wht').fill('3'); await d.locator('#plan-reason').fill('ab')
})
await run('/settings/service-fee', '+ สร้างเทมเพลต', 'สร้างเทมเพลต', 'sf-empty')
await run('/settings/teams', '+ สร้างทีม', 'สร้างทีม', 'team-empty')
await page.goto(`${BASE}/settings/finance?tab=approval`); await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: '+ เพิ่มกติกา' }).click()
let dlg = page.getByRole('dialog'); await dlg.waitFor()
await dlg.getByRole('button', { name: 'เพิ่มกติกา', exact: true }).click(); await page.waitForTimeout(500)
console.log('== approval-empty:', JSON.stringify(await errs(dlg)))
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
await page.goto(`${BASE}/settings/finance?tab=approval`); await page.waitForLoadState('networkidle')
console.log('policy values:', await page.locator('#policy-advance-max, #policy-writeoff').evaluateAll(e => e.map(x => `${x.id}=${x.value}`)), await page.getByLabel(/ช่วงอายุหนี้ที่/).evaluateAll(e => e.map(x => x.value)))
await page.getByRole('button', { name: 'บันทึกนโยบายการเงิน' }).click(); await page.waitForTimeout(600)
console.log('== policy-noreason:', JSON.stringify((await page.locator('.text-red-600').allInnerTexts()).filter(Boolean)))
console.log('BLOCKED non-GET (ต้องว่างถ้าตรวจฝั่ง client ก่อน):', blocked)
console.log('consoleErrors:', s.consoleErrors.filter(e => !e.includes('ERR_FAILED')), 'serverErrors:', s.serverErrors)
await s.browser.close()
