// R15a.10 U104 สิทธิ์ view_document_samples: เมนู + หน้า + API (ไม่เรียก route PDF — BUG-172)
import { openAs, shot, log, settle, sleep, R, BASE, get } from './_h.mjs'
for (const u of ['uat.admin', 'uat.finance', 'uat.exec']) {
  const { browser, page } = await openAs(u)
  page.setDefaultTimeout(20000)
  await page.goto(`${BASE}/dashboard`, { timeout: 60000 }); await settle(page); await sleep(800)
  const menu = await page.getByRole('link', { name: /ตัวอย่างเอกสารทั้งหมด/ }).count()
  const nav = (await page.locator('nav, aside').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
  await page.goto(`${BASE}/accounting/document-samples`, { timeout: 60000 }); await settle(page); await sleep(800)
  log(u, 'menuLink', menu, 'page→', page.url().replace(BASE, ''), '| api', (await get(page, '/api/accounting/document-samples')).slice(0, 90))
  if (u === 'uat.admin') await shot(page, R, '10-samples-noperm-admin')
  await browser.close()
}
