// R15b.07 ค่าตั้ง (2)/(3) ปิด (ค่าเริ่มต้น): ฟอร์มผู้รับเลือกได้เฉพาะ (1) + probe API ตั้ง (2) ต้องโดนปฏิเสธ
import { openAs, shot, BASE, settle, sleep, log, R, q, qa, patch, get, P_IN2 } from './_h.mjs'
const { browser, page, serverErrors } = await openAs('uat.finance')
log('policy API:', await get(page, '/api/payees/wht-condition-policy', 300))
await page.goto(`${BASE}/finance?tab=payee`); await settle(page); await sleep(1500)
const row = page.getByText('บุญมี ภาคสนาม').first().locator('xpath=ancestor::*[.//button[normalize-space()="แก้ไข"]][1]')
await row.getByRole('button', { name: 'แก้ไข' }).first().click(); await sleep(1200)
const sel = page.locator('select#payee-wht-condition')
log('options (OFF):', await sel.locator('option').allInnerTexts())
const dlg = page.getByRole('dialog').last()
await sel.scrollIntoViewIfNeeded(); await shot(page, R, 'b-07-payee-condition-off')
log('help text:', (await dlg.innerText()).replace(/\s+/g, ' ').match(/เงื่อนไขการหักภาษี ณ ที่จ่าย.{0,500}/)?.[0])
await page.keyboard.press('Escape'); await sleep(500)
// probe API — ส่งค่าเดิมครบทุกช่อง เปลี่ยนเฉพาะเงื่อนไข
const r = qa(`select payee_type,tax_profile_id,national_id,bank_name,account_name,account_number,coalesce(id_document_url,'') from payee_profiles where id='${P_IN2}'`).split('|')
const body = { payeeType: r[0], taxProfileId: r[1] || null, nationalId: r[2] || null, bankName: r[3] || null, accountName: r[4] || null, accountNumber: r[5] || null, idDocumentUrl: r[6] || null, whtCondition: 'pay_always', reason: 'UAT R15b probe ตั้งเงื่อนไข (2) ขณะค่าตั้งปิด' }
log('PATCH pay_always while OFF:', await patch(page, `/api/payees/${P_IN2}`, body, 400))
log(q(`select wht_condition,is_verified from payee_profiles where id='${P_IN2}'`))
log('5xx', serverErrors)
await browser.close()
