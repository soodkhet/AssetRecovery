// บัญชี: Import statement → ดูคู่ที่ระบบเสนอ → จับคู่ Manual กับรอบบิล/รอบจ่าย · node bank.mjs import <csv> | match <ref> <batch> [note]
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const [step, a1, a2, a3] = process.argv.slice(2)
const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
const dlg = () => page.locator('[role=dialog]').last()
await page.goto(U + '/accounting?tab=bank'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
if (step === 'import') {
  await page.getByRole('button', { name: 'Import Statement' }).click(); await page.waitForTimeout(800)
  const sel = dlg().locator('select').first(); const opts = await sel.evaluate(e => [...e.options].map(o => o.value).filter(Boolean)); await sel.selectOption(opts[0])
  await dlg().locator('input[type=file]').setInputFiles(a1); await page.waitForTimeout(600)
  await dlg().getByRole('button', { name: /อัปโหลด|นำเข้า/ }).last().click()
  log('bank', 'import', a1, await collect(page, 5000), api.splice(0).map(x => x.slice(0, 250)))
  await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  const t = clean(await page.locator('main').innerText()); const i = t.indexOf('คู่ที่ระบบเสนอ')
  log('bank', 'proposal panel:', i < 0 ? 'NONE' : t.slice(i, i + 600))
  await shot(page, `bank-import-${a1.split('/').pop()}`, { fullPage: true })
}
if (step === 'propose') { // ยืนยันคู่ที่ระบบเสนอของแถว a1
  const t = clean(await page.locator('main').innerText()); const i = t.indexOf('คู่ที่ระบบเสนอ'); log('bank', 'panel', i < 0 ? 'NONE' : t.slice(i, i + 800))
  const card = page.locator('li, tr, div').filter({ hasText: a1 }).filter({ has: page.getByRole('button', { name: /ยืนยัน/ }) }).last()
  await card.getByRole('button', { name: /ยืนยัน/ }).first().click(); await page.waitForTimeout(800)
  const d = dlg(); if (await d.isVisible().catch(() => false)) { log('bank', 'dlg', clean(await d.innerText()).slice(0, 600)); for (const ta of await d.locator('textarea').all()) await ta.fill(a3 ?? 'ยืนยันคู่ที่ระบบเสนอ (ด่าน 7 รอบทวน)'); await d.getByRole('button', { name: /ยืนยัน/ }).last().click() }
  log('bank', 'confirm proposal', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 300)))
}
if (step === 'match') {
  const row = page.locator('tbody tr').filter({ hasText: a1 }).first()
  log('bank', 'row:', clean(await row.innerText()))
  await row.getByRole('button', { name: 'จับคู่ Manual' }).click(); await page.waitForTimeout(1500)
  log('bank', 'match modal:', clean(await dlg().innerText()).slice(0, 1200))
  const opts = await dlg().locator('select option').allInnerTexts(); const vals = await dlg().locator('select option').evaluateAll(os => os.map(o => o.value))
  const i = opts.findIndex(o => o.includes(a2)); log('bank', 'candidate', i, opts.filter(o => o.includes(a2)))
  if (i >= 0) await dlg().locator('select').first().selectOption(vals[i]); else await dlg().getByText(a2).first().click().catch(() => log('bank', 'NO CANDIDATE', a2))
  await page.waitForTimeout(800)
  log('bank', 'after select:', clean(await dlg().innerText()).slice(0, 1200))
  await shot(page, `bank-match-${a1}`, { fullPage: true })
  const ta = dlg().locator('textarea').first(); if (await ta.count()) await ta.fill(a3 ?? `รับชำระ ${a2} (ด่าน 7 รอบทวน)`)
  await dlg().getByRole('button', { name: 'ยืนยันการจับคู่' }).click(); log('bank', 'match', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 300)))
}
log('bank', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
