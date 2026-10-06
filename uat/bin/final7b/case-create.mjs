// U166–U168 — รับเคสใหม่: กรอก IMEI → เติมยี่ห้อ/รุ่นจาก TAC (หรือไม่พบ → เลือกเอง) · ความจุ/สีบังคับ · บันทึกร่าง → ส่งตรวจ
// env: REF CO IMEI PICK(ข้อความค้นถ้า TAC ไม่พบ) CAP COLOR [COLOR_CUSTOM] DEBT PROV(=กรุงเทพมหานคร) MOBILE=1 DRYRUN=1(ไม่บันทึก)
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const E = process.env, REF = E.REF
const s = await openAs('uat.admin', { mobile: E.MOBILE === '1' }); const { page } = s; const api = trackApi(page)
if (E.MOBILE === '1') await page.setViewportSize({ width: 375, height: 812 })
await page.goto(U + '/cases/submit'); await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: '+ รับเคส (กรอกมือ)' }).click()
const dlg = page.getByRole('dialog'); await dlg.waitFor(); await page.waitForTimeout(800)
const errs = async () => [...new Set((await dlg.locator('.text-red-600, .text-rose-600, [role=alert], p[id$="-error"]').allInnerTexts()).map(x => x.trim()).filter(Boolean))]
await dlg.locator('#case-company').selectOption({ label: E.CO })
await dlg.locator('#case-ref').fill(REF)
await dlg.locator('#debtor-name').fill(E.NAME ?? 'นายทดสอบ รอบทวน')
await dlg.locator('#debtor-nationality').selectOption({ label: 'ไทย' })
await dlg.locator('#debtor-national-id').fill(E.NID ?? '1100000000981')
await dlg.locator('#debtor-mobile').fill('0899990071')
const detail = dlg.locator('[id$="-detail"]'), prov = dlg.locator('select[id$="-province"]'), postal = dlg.locator('input[id$="-postal"]')
await prov.nth(0).selectOption({ label: E.PROV ?? 'กรุงเทพมหานคร' }); await detail.nth(0).fill('77 ถ.พหลโยธิน แขวงจตุจักร')
await postal.nth(2).fill('10900'); await page.waitForTimeout(1500)
if (!(await prov.nth(2).inputValue())) await prov.nth(2).selectOption({ label: 'กรุงเทพมหานคร' })
await detail.nth(2).fill('77 ถ.พหลโยธิน แขวงจตุจักร')
await dlg.locator('#asset-type').selectOption({ label: 'สมาร์ทโฟน' })
log('case', REF, 'model before IMEI:', await dlg.locator('#asset-model').getAttribute('placeholder'), 'disabled=', await dlg.locator('#asset-model').isDisabled())
await dlg.locator('#asset-imei').fill(E.IMEI); await page.waitForTimeout(2500)
const sec = async () => clean(await dlg.locator('#asset-model').locator('xpath=ancestor::div[contains(@class,"space-y") or contains(@class,"relative")][1]/..').innerText().catch(() => ''))
log('case', REF, 'after IMEI model=', await dlg.locator('#asset-model').inputValue(), '| note:', await sec())
await shot(page, `case-${REF}-imei`, { fullPage: true })
if (E.PICK) {
  await dlg.locator('#asset-model').click(); await dlg.locator('#asset-model').fill(E.PICK); await page.waitForTimeout(1500)
  const opts = (await page.locator('[role=listbox] [role=option]').allInnerTexts()).map(x => clean(x)); log('case', REF, 'options for', E.PICK, opts.slice(0, 6))
  if (opts.length > 1) await page.locator('[role=listbox] [role=option]').first().click()
  await page.waitForTimeout(500); log('case', REF, 'picked model=', await dlg.locator('#asset-model').inputValue(), '| note:', await sec())
}
// ความจุ/สี บังคับ — บันทึกโดยยังไม่เลือก
await dlg.locator('#asset-debt').fill(E.DEBT ?? '12,000.00')
const fi = dlg.locator('input[type=file]'); const nf = await fi.count()
await fi.nth(0).setInputFiles('uat/fixtures/files/C1-contract.pdf'); await fi.nth(1).setInputFiles('uat/fixtures/files/C1-idcard.png'); await fi.nth(nf - 1).setInputFiles('uat/fixtures/files/C1-product.png')
if (E.DRYRUN !== '1' && E.SKIPMISS !== '1') {
  await dlg.getByRole('button', { name: 'บันทึกเคสร่าง' }).click(); await page.waitForTimeout(1500)
  log('case', REF, 'save w/o capacity/color errors:', (await errs()).join(' | '), 'api', api.splice(0).length)
}
log('case', REF, 'capacity options:', (await dlg.locator('#asset-capacity option').allInnerTexts()).join('/'))
log('case', REF, 'color options:', (await dlg.locator('#asset-color option').allInnerTexts()).join('/'))
await dlg.locator('#asset-capacity').selectOption({ label: E.CAP ?? '256GB' })
await dlg.locator('#asset-color').selectOption({ label: E.COLOR ?? 'ดำ' })
if (E.COLOR_CUSTOM) { await dlg.locator('#asset-color-custom').fill(E.COLOR_CUSTOM) }
await shot(page, `case-${REF}-filled`, { fullPage: true })
if (E.DRYRUN === '1') { log('case', REF, 'DRYRUN close'); await s.browser.close(); process.exit(0) }
await dlg.getByRole('button', { name: 'บันทึกเคสร่าง' }).click()
log('case', REF, 'save', await collect(page, 6000), api.splice(0).map(x => x.slice(0, 200)))
await page.waitForLoadState('networkidle')
log('case', REF, q(`select case_ref,status,imei,asset_description,asset_capacity,asset_color,device_model_id is not null catalog from cases where case_ref='${REF}'`))
const row = page.locator('tr', { hasText: REF }).first()
await row.getByRole('button', { name: 'ส่งตรวจสอบเคส' }).click().catch(() => log('case', 'no submit btn')); await page.waitForTimeout(800)
const cd = page.getByRole('dialog'); if (await cd.isVisible().catch(() => false)) await cd.getByRole('button', { name: /ยืนยัน|ส่ง/ }).last().click()
log('case', REF, 'submit', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 160)))
log('case', REF, q(`select case_ref,status from cases where case_ref='${REF}'`))
log('case', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
