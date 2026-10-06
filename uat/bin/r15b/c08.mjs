// R15b.08 บริหารตั้งค่าภาษีหัก ณ ที่จ่ายชุดใหม่ (ผ่านหน้าจอ): GROSS=1|0 · MANUAL=1|0 (รวม Manual Claim ในฐาน)
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q } from './_h.mjs'
const GROSS = process.env.GROSS === '1', MANUAL = process.env.MANUAL === '1', TAG = process.env.TAG ?? 'x'
const { browser, page, serverErrors } = await openAs(process.env.U ?? 'uat.exec')
const mut = trackMutations(page)
await page.goto(`${BASE}/settings/finance?tab=whtpolicy`); await settle(page); await sleep(1500)
log('tab text:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900))
await page.getByRole('button', { name: '+ ตั้งค่าชุดใหม่' }).click(); await sleep(1000)
const dlg = page.getByRole('dialog').last()
log('date default:', await dlg.locator('input[type=date]').inputValue())
const labels = dlg.locator('label').filter({ has: page.locator('input[type=checkbox]') })
const n = await labels.count(); const names = []
for (let i = 0; i < n; i++) names.push(`${(await labels.nth(i).innerText()).trim()}=${await labels.nth(i).locator('input').isChecked()}`)
log('checkboxes before:', names)
const manualBox = labels.filter({ hasText: process.env.MLABEL ?? 'เบิกด้วยตนเอง' }).first().locator('input')
if ((await manualBox.count()) && (await manualBox.isChecked()) !== MANUAL) await manualBox.click()
const g = dlg.locator('#wht-policy-gross-up'); if ((await g.isChecked()) !== GROSS) await g.click()
await sleep(400)
await dlg.locator('#wht-policy-reason').fill(process.env.REASON ?? `UAT R15b ทดสอบเงื่อนไขออกภาษีให้ (${TAG})`)
await dlg.locator('#wht-policy-gross-up').scrollIntoViewIfNeeded(); await shot(page, R, `b-08-whtpolicy-${TAG}`)
log('help:', (await dlg.innerText()).replace(/\s+/g, ' ').match(/อนุญาต.{0,600}/)?.[0])
if (process.env.DRY) { await browser.close(); process.exit(0) }
mut.res.length = 0
await dlg.getByRole('button', { name: /บันทึก/ }).last().click(); await sleep(2500)
log('toasts', await toasts(page, 1200), 'res', mut.res)
await shot(page, R, `b-08-whtpolicy-${TAG}-after`, { fullPage: true })
log(q(`select effective_from,base_expense_types,allow_gross_up_conditions,reason,created_at from wht_policy_history order by created_at desc limit 2`))
log('5xx', serverErrors)
await browser.close()
