// ส่งตรวจเคสร่างที่ยังไม่เลือกความจุ/สี → ต้องถูกกัน · แก้ไขเลือกความจุ/สี → ส่งตรวจ
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const E = process.env, REF = E.REF
const s = await openAs('uat.admin'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/cases/submit'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800)
const row = () => page.locator('tr', { hasText: REF }).first()
log('case', REF, 'row', clean(await row().innerText()))
const submit = async (tag) => { await row().getByRole('button', { name: 'ส่งตรวจสอบเคส' }).click(); await page.waitForTimeout(800)
  const cd = page.getByRole('dialog'); if (await cd.isVisible().catch(() => false)) await cd.getByRole('button', { name: /ยืนยัน|ส่ง/ }).last().click()
  log('case', REF, tag, await collect(page, 4000), api.splice(0).map(x => x.slice(0, 260))); await shot(page, `case-${REF}-${tag}`) }
await submit('submit-missing')
await page.keyboard.press('Escape'); await page.goto(U + '/cases/submit'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800)
await row().getByRole('button', { name: 'แก้ไข' }).click(); const d = page.getByRole('dialog'); await d.waitFor(); await page.waitForTimeout(1200)
log('case', REF, 'edit model=', await d.locator('#asset-model').inputValue())
await d.locator('#asset-capacity').selectOption({ label: E.CAP }); await d.locator('#asset-color').selectOption({ label: E.COLOR })
if (E.COLOR_CUSTOM) await d.locator('#asset-color-custom').fill(E.COLOR_CUSTOM)
await d.getByRole('button', { name: /บันทึก/ }).last().click(); log('case', REF, 'edit save', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 160)))
await page.waitForLoadState('networkidle'); await submit('submit')
log('case', REF, q(`select case_ref,status,imei,asset_description,asset_capacity,asset_color from cases where case_ref='${REF}'`))
log('case', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
