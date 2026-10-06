// probe API เลขที่เอกสาร — คาดว่าถูกปฏิเสธทุกข้อ (ไม่เปลี่ยนข้อมูล)
import { openAs, log, BASE, q } from './_h.mjs'
const before = q(`select doc_type,prefix,include_year,digits,reset_yearly,updated_at from document_number_series where doc_type<>'substitute_receipt' and doc_type<>'payment_voucher' order by doc_type`)
const reason = 'UAT R15a probe — ต้องถูกปฏิเสธ'
const patch = async (page, t, data) => { const r = await page.request.patch(`${BASE}/api/settings/document-numbering/${t}`, { data, failOnStatusCode: false }); return `${r.status()} ${(await r.text()).slice(0, 160)}` }
{ const { browser, page } = await openAs('admin')
  log('INV prefix', await patch(page, 'tax_invoice', { prefix: 'TIV', includeYear: false, digits: 4, resetYearly: false, reason }))
  log('WHT digits', await patch(page, 'wht_certificate', { prefix: 'WHT', includeYear: true, digits: 4, resetYearly: true, reason }))
  log('INV nextSequence', await patch(page, 'tax_invoice', { prefix: 'INV', includeYear: false, digits: 4, resetYearly: false, nextSequence: 20, reason }))
  log('BL currentSeq', await patch(page, 'billing_batch', { prefix: 'BL', includeYear: true, digits: 3, resetYearly: true, currentSeq: 1, reason }))
  log('BL next=6 (=issued)', await patch(page, 'billing_batch', { prefix: 'BL', includeYear: true, digits: 3, resetYearly: true, nextSequence: 6, reason }))
  await browser.close() }
{ const { browser, page } = await openAs('uat.account')
  log('account BL', await patch(page, 'billing_batch', { prefix: 'BL', includeYear: true, digits: 3, resetYearly: true, reason }))
  await browser.close() }
const after = q(`select doc_type,prefix,include_year,digits,reset_yearly,updated_at from document_number_series where doc_type<>'substitute_receipt' and doc_type<>'payment_voucher' order by doc_type`)
log('unchanged', before === after)
