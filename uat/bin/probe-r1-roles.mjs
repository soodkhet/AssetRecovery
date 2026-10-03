// probe อ่านอย่างเดียว — โมดัลกำหนดสิทธิ์ของ role (ปิดด้วยยกเลิก) + สถานะปุ่มลบของ seed role + หน้าเปลี่ยนรหัส
import { openAs, shot, BASE } from './lib.mjs'
const s = await openAs('admin')
const { page } = s
await page.goto(`${BASE}/settings/roles`); await page.waitForLoadState('networkidle')
const del = page.getByRole('button', { name: 'ลบ', exact: true })
console.log('delete buttons:', await del.count(), 'disabled:', await del.evaluateAll(bs => bs.map(b => b.disabled + '/' + (b.title || b.getAttribute('aria-label') || ''))))
for (const tab of ['เจ้าหน้าที่ติดตามทรัพย์', 'บริษัทไฟแนนซ์']) {
  await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(800)
  console.log(`== tab ${tab}:`, (await page.locator('table').first().innerText()).replace(/\s+/g, ' ').slice(0, 500))
}
await page.getByRole('tab', { name: 'แอดมิน' }).click(); await page.waitForTimeout(500)
const row = page.getByRole('row').filter({ hasText: 'การเงิน' }).first()
await row.getByRole('button', { name: 'กำหนดสิทธิ์' }).click()
const dlg = page.getByRole('dialog'); await dlg.waitFor()
console.log('== perm modal:', (await dlg.innerText()).replace(/\n{2,}/g, '\n').slice(0, 1500))
console.log('selects:', await dlg.locator('select').count(), 'buttons:', (await dlg.getByRole('button').allInnerTexts()).join(' | '))
await shot(page, 'R1-probe', 'roles-perm-modal', { fullPage: true })
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
await page.goto(`${BASE}/auth/change-password`); await page.waitForLoadState('networkidle')
console.log('== change-password:', (await page.locator('body').innerText()).slice(0, 700))
console.log('inputs:', await page.locator('input').evaluateAll(els => els.map(e => `#${e.id} ${e.type} label=${document.querySelector(`label[for="${e.id}"]`)?.innerText ?? ''}`)))
await shot(page, 'R1-probe', 'change-password')
console.log('consoleErrors:', s.consoleErrors, 'serverErrors:', s.serverErrors)
await s.browser.close()
