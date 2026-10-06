// R15b.09 การเงินแก้เงื่อนไขการหักของผู้รับผ่านหน้าจอ แล้วยืนยันผู้รับ: NAME=ชื่อ COND=ค่าใน select
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q } from './_h.mjs'
const NAME = process.env.NAME, COND = process.env.COND, TAG = process.env.TAG
const { browser, page, serverErrors } = await openAs('uat.finance')
const mut = trackMutations(page)
await page.goto(`${BASE}/finance?tab=payee`); await settle(page); await sleep(1500)
const row = () => page.getByText(NAME).first().locator('xpath=ancestor::*[.//button[normalize-space()="แก้ไข"]][1]')
await row().getByRole('button', { name: 'แก้ไข' }).first().click(); await sleep(1200)
const dlg = page.getByRole('dialog').last(); const sel = dlg.locator('select#payee-wht-condition')
log('options:', await sel.locator('option').allInnerTexts())
await sel.selectOption(COND); await sleep(500)
if (process.env.ADDR === '1') {
  await dlg.locator('select#payee-name-title').selectOption('นาย').catch(e => log('title err', e.message))
  await dlg.getByLabel('บ้านเลขที่ / หมู่บ้าน / ถนน').fill('99/9 หมู่ 1 ถนนตัวอย่าง (ข้อมูลทดสอบ UAT)')
  await dlg.getByLabel('รหัสไปรษณีย์').fill('10310'); await sleep(800)
  const ch = dlg.locator('select[id$="-postal-choice"]'); if (await ch.count()) { const o = await ch.locator('option').allInnerTexts(); log('postal choices', o.slice(0, 5)); await ch.selectOption({ index: 1 }); await sleep(500) }
  log('addr now:', await dlg.locator('[id$="-province"]').inputValue().catch(() => '?'), await dlg.locator('[id$="-district"]').inputValue().catch(() => '?'), await dlg.locator('[id$="-subdistrict"]').inputValue().catch(() => '?'))
}
log('hint:', (await dlg.innerText()).replace(/\s+/g, ' ').match(/เงื่อนไขการหักภาษี ณ ที่จ่าย.{0,700}/)?.[0])
await dlg.locator('#payee-reason').fill(`UAT R15b ทดสอบเงื่อนไขออกภาษีให้ (${TAG}) — คืนค่าเดิมท้ายรอบ`)
await sel.scrollIntoViewIfNeeded(); await shot(page, R, `b-09-payee-${TAG}`)
mut.res.length = 0
await dlg.getByRole('button', { name: 'บันทึกการแก้ไข' }).click(); await sleep(2500)
log('save toasts', await toasts(page, 1200), mut.res)
if (process.env.VERIFY !== '0') {
  await settle(page); await sleep(800)
  const v = row().getByRole('button', { name: 'ยืนยัน', exact: true })
  if (await v.count()) { await v.click(); await sleep(900)
    const d2 = page.getByRole('dialog').last(); const ta = d2.locator('textarea'); if (await ta.count()) await ta.fill(`UAT R15b ยืนยันหลังเปลี่ยนเงื่อนไข (${TAG})`)
    mut.res.length = 0; await d2.getByRole('button', { name: /ยืนยัน/ }).last().click(); await sleep(2000)
    log('verify toasts', await toasts(page, 1200), mut.res) } else log('no verify button')
}
log(q(`select p.wht_condition,p.is_verified from payee_profiles p where p.id in ('7ec92197-6d90-488f-8eba-e249b59a1372','bf36b3bb-4508-4c3a-984e-9b78eaa9f8ca','9df4509f-c201-4dcf-8939-e02e08df748f') order by 1`))
log('5xx', serverErrors)
await browser.close()
