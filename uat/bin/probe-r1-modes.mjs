// probe อ่านอย่างเดียว — สลับโหมดในฟอร์ม (ไม่กดบันทึก) เพื่ออ่าน label ของช่องที่ซ่อนอยู่
import { openAs, shot, BASE } from './lib.mjs'
const s = await openAs('admin')
const { page } = s
const ids = async (dlg) => (await dlg.locator('input,select,textarea').evaluateAll(els => els.map(e => {
  const l = e.id ? document.querySelector(`label[for="${e.id}"]`)?.innerText.trim() : (e.closest('label')?.innerText.trim() ?? e.getAttribute('aria-label'))
  return `#${e.id} ${e.type} «${(l ?? '').replace(/\s+/g, ' ').slice(0, 70)}»`
}))).join('\n  ')

await page.goto(`${BASE}/settings/service-fee`); await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: '+ สร้างเทมเพลต' }).click()
let dlg = page.getByRole('dialog')
for (const m of ['FLAT', 'HYBRID']) {
  await dlg.locator('#sf-model').selectOption(m)
  console.log(`== service-fee ${m}\n  ` + await ids(dlg))
}
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()

await page.goto(`${BASE}/settings/compensation`); await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: '+ สร้างเทมเพลต' }).click()
dlg = page.getByRole('dialog')
console.log('== compensation dialog\n' + (await dlg.innerText()).replace(/\n{2,}/g, '\n').slice(0, 1800))
console.log('== PER_KM fields\n  ' + await ids(dlg))
await dlg.getByRole('button', { name: 'เหมาจ่ายรายวัน' }).click()
console.log('== DAILY_FLAT fields\n  ' + await ids(dlg))
await shot(page, 'R1-probe', 'compensation-modal-daily', { fullPage: true })
console.log('buttons:', (await dlg.getByRole('button').allInnerTexts()).join(' | '))
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
console.log('consoleErrors:', s.consoleErrors, 'serverErrors:', s.serverErrors)
await s.browser.close()
