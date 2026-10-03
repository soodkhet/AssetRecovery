import { openAs, shot, BASE, toasts, inlineErrors, fields, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
const CO = {
  CO1: { name: 'บริษัท ยูเอที ลิสซิ่ง จำกัด', short: 'UATL', taxid: '0105561000011', phone: '021000001',
    address: '99 ถนนสาทร แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120', contact: 'มาลี ลิสซิ่ง', contactPhone: '0810000012',
    signer: 'นายใหญ่ ลิสซิ่ง', email: 'billing@uatl.uat.test', tpl: 'UAT Success 5%', vatMode: 'exclude_vat', wht: '3.00', billing: '25', due: '30',
    reason: 'เพิ่มบริษัทไฟแนนซ์ลูกค้ารายแรกสำหรับ UAT รอบที่ 1' },
  CO2: { name: 'บริษัท ยูเอที แคปปิตอล จำกัด', short: 'UATC', taxid: '0105561000020', phone: '021000002',
    address: '88 ถนนงามวงศ์วาน ตำบลบางกระสอ อำเภอเมืองนนทบุรี นนทบุรี 11000', contact: 'ศิริ แคปปิตอล', contactPhone: '0810000014',
    signer: 'นางโต แคปปิตอล', email: 'billing@uatc.uat.test', tpl: 'UAT Flat 7,490', vatMode: 'include_vat', wht: '', billing: '5', due: '15',
    reason: 'เพิ่มบริษัทไฟแนนซ์ลูกค้ารายที่สองสำหรับ UAT รอบที่ 1' },
}
async function fill(dlg, c) {
  await dlg.locator('#co-name').fill(c.name)
  await dlg.locator('#co-short').fill(c.short)
  await dlg.locator('#co-taxid').fill(c.taxid)
  await dlg.locator('#co-phone').fill(c.phone)
  await dlg.locator('#co-address').fill(c.address)
  await dlg.locator('#co-contact').fill(c.contact)
  await dlg.locator('#co-contact-phone').fill(c.contactPhone)
  await dlg.locator('#co-signer').fill(c.signer)
  await dlg.locator('#co-email').fill(c.email)
  const opts = await dlg.locator('#co-template option').allInnerTexts()
  const lbl = opts.find(o => o.startsWith(c.tpl))
  log('template options', JSON.stringify(opts), '→', lbl)
  await dlg.locator('#co-template').selectOption({ label: lbl })
  await dlg.locator('#co-delivery').selectOption({ index: 0 })
  await dlg.locator('#co-vat').selectOption({ label: 'จด VAT แล้ว' })
  await dlg.locator('#co-vat-mode').selectOption(c.vatMode)
  await dlg.locator('#co-customer-wht').fill(c.wht)
  await dlg.locator('#co-billing-day').fill(c.billing)
  await dlg.locator('#co-due-days').fill(c.due)
  await dlg.locator('#co-reason').fill(c.reason)
}
await page.goto(`${BASE}/settings/companies`); await settle(page)

// R1.05
await page.getByRole('button', { name: '+ สร้างบริษัท' }).click()
let dlg = page.getByRole('dialog')
log('R1.05 title', await dlg.locator('h2,h3').first().innerText())
log('R1.05 fields\n  ' + await fields(dlg))
log('R1.05 defaults vat-mode', await dlg.locator('#co-vat-mode').inputValue(), 'wht', await dlg.locator('#co-customer-wht').inputValue(),
  'delivery opts', JSON.stringify(await dlg.locator('#co-delivery option').allInnerTexts()), 'vatmode opts', JSON.stringify(await dlg.locator('#co-vat-mode option').allInnerTexts()))
await fill(dlg, CO.CO1)
await shot(page, 'R1', 'R1.05-co1-form', { fullPage: true })
await dlg.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click()
log('R1.05 toast', await toasts(page))
await settle(page)
await shot(page, 'R1', 'R1.05-co1-done', { fullPage: true })
log('R1.05 main', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 900))

// R1.06
await sleep(3000)
let n0 = m.reqs.length
await page.getByRole('button', { name: '+ สร้างบริษัท' }).click()
dlg = page.getByRole('dialog')
await dlg.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click()
await sleep(800)
log('R1.06 errors', JSON.stringify(await inlineErrors(dlg)), 'new mut', m.reqs.slice(n0))
await shot(page, 'R1', 'R1.06-co-required', { fullPage: true })
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()

// R1.07 CO2 dblclick
await page.getByRole('button', { name: '+ สร้างบริษัท' }).click()
dlg = page.getByRole('dialog')
await fill(dlg, CO.CO2)
await shot(page, 'R1', 'R1.07-co2-form', { fullPage: true })
n0 = m.res.length
await dlg.getByRole('button', { name: 'สร้างบริษัท', exact: true }).dblclick()
log('R1.07 toast', await toasts(page, 2500))
await settle(page)
log('R1.07 responses', m.res.slice(n0), 'reqs', m.reqs.filter(r => r.includes('finance-companies')))
await shot(page, 'R1', 'R1.07-co2-done', { fullPage: true })

// R1.08 dup tax id
await sleep(3000)
n0 = m.res.length
await page.getByRole('button', { name: '+ สร้างบริษัท' }).click()
dlg = page.getByRole('dialog')
await fill(dlg, { ...CO.CO1, name: 'บริษัท ทดสอบซ้ำ จำกัด', short: 'DUPT', email: '', reason: 'ทดสอบเลขผู้เสียภาษีซ้ำ (probe)' })
await dlg.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click()
log('R1.08 toast', await toasts(page))
log('R1.08 responses', m.res.slice(n0), 'dialog open', await dlg.isVisible())
await shot(page, 'R1', 'R1.08-co-dup-taxid', { fullPage: true })
if (await dlg.isVisible()) await dlg.getByRole('button', { name: 'ยกเลิก' }).click()

// R1.09 open edit CO1 + read card CO2
await sleep(1000)
await page.reload(); await settle(page)
log('R1.09 main', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 2000))
const editBtns = page.getByRole('button', { name: /แก้ไขบริษัท/ })
log('R1.09 edit buttons', await editBtns.count())
await editBtns.first().click()
dlg = page.getByRole('dialog')
log('R1.09 edit title', await dlg.locator('h2,h3').first().innerText(), 'vat-mode', await dlg.locator('#co-vat-mode').inputValue(), 'wht', await dlg.locator('#co-customer-wht').inputValue())
await shot(page, 'R1', 'R1.09-co1-edit-wht', { fullPage: true })
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
await editBtns.nth(1).click()
log('R1.09 edit2 title', await dlg.locator('h2,h3').first().innerText(), 'vat-mode', await dlg.locator('#co-vat-mode').inputValue(), 'wht', JSON.stringify(await dlg.locator('#co-customer-wht').inputValue()))
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
await shot(page, 'R1', 'R1.09-companies-cards', { fullPage: true })

log('mutations', m.res)
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
