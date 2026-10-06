// Flow 13 — บัญชี: U127 บันทึกยื่น ภ.ง.ด. เพิ่มเติม (ก.ย.) · U140 ป้าย "รอนักบัญชียืนยัน" บนหน้าตั้งค่า → กดยืนยัน
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const step = process.argv[2]
const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
const dt = async () => (await page.getByRole('dialog').last().innerText().catch(() => '')).replace(/\s+/g, ' ')
if (step === 'u127') {
  await page.goto('http://localhost:3000/accounting?tab=wht'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  const row = page.locator('tr', { hasText: 'กันยายน 2569' }).filter({ hasText: 'ต้องยื่นเพิ่มเติม' }).first()
  log('f13', 'row', (await row.innerText()).replace(/\s+/g, ' '))
  await row.getByRole('button', { name: /ยื่นเพิ่มเติม/ }).first().click(); await page.waitForTimeout(900)
  log('f13', 'dlg', (await dt()).slice(0, 1200)); await shot(page, 'final/flow', 'f13-u127-dlg', { fullPage: true })
  const d = page.getByRole('dialog').last(); const btn = d.getByRole('button', { name: /ยืนยัน|บันทึก/ }).last()
  log('f13', 'confirm disabled (empty):', await btn.isDisabled())
  for (const ta of await d.locator('textarea').all()) await ta.fill('ยื่น ภ.ง.ด.3 เพิ่มเติม ก.ย. แบบกระดาษ (ด่าน 7)')
  for (const di of await d.locator('input[type=date]').all()) if (!(await di.inputValue())) await di.fill('2026-10-07')
  for (const ti of await d.locator('input[type=text]').all()) if (!(await ti.inputValue())) await ti.fill('PND3-SUP-2569-09')
  await btn.click(); log('f13', 'u127', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 300)))
  await page.waitForTimeout(800); log('f13', 'after:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/ต้องยื่น ภ\.ง\.ด\. เพิ่มเติม.{0,200}|กันยายน 2569\s+07\/10\/2569.{0,250}/g))
  await shot(page, 'final/flow', 'f13-u127-after', { fullPage: true })
}
if (step === 'u140') {
  await page.goto('http://localhost:3000/settings/finance'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  const tabs = page.locator('[aria-label^="แท็บ"] button'); const n = await tabs.count(); const found = []
  for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await page.waitForTimeout(900)
    const c = await page.getByText('รอนักบัญชียืนยัน').count(); if (c) found.push(`${(await tabs.nth(i).innerText()).trim()}:${c}`) }
  log('f13', 'U140 badges per tab:', found.join(', ') || 'NONE')
  if (found.length) { const tn = found[0].split(':')[0]; await page.locator('[aria-label^="แท็บ"] button', { hasText: tn }).first().click(); await page.waitForTimeout(900)
    const badge = page.getByText('รอนักบัญชียืนยัน').first(); await badge.scrollIntoViewIfNeeded(); await shot(page, 'final/flow', 'f13-u140-badge')
    await badge.click().catch(() => {}); await page.waitForTimeout(700)
    const cb = page.getByRole('button', { name: /ยืนยันแล้ว/ }).first(); log('f13', 'confirm btn count', await cb.count())
    if (await cb.count()) { await cb.click(); await page.waitForTimeout(700); log('f13', 'dlg', (await dt()).slice(0, 600))
      const d = page.getByRole('dialog').last(); for (const ta of await d.locator('textarea').all()) await ta.fill('นักบัญชียืนยันค่าตั้งนี้แล้ว (ด่าน 7)')
      await d.getByRole('button', { name: /ยืนยัน/ }).last().click(); log('f13', 'u140', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 300)))
      await page.waitForTimeout(800); log('f13', 'badges left on tab', await page.getByText('รอนักบัญชียืนยัน').count()); await shot(page, 'final/flow', 'f13-u140-after') } }
}
log('f13', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
