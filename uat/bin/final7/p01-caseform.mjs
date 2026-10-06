// อ่านอย่างเดียว: ฟอร์มรับเคสปัจจุบัน (ช่อง/ตัวเลือก Model Phone)
import { openAs, shot, log } from './_h.mjs'
const s = await openAs(process.argv[2] ?? 'uat.admin'); const { page } = s
await page.goto('http://localhost:3000/cases/submit'); await page.waitForLoadState('networkidle')
log('p01', page.url(), 'buttons', (await page.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean).slice(0, 20).join(' | '))
await page.getByRole('button', { name: /รับเคส|เพิ่มเคส|สร้างเคส/ }).first().click()
const dlg = page.getByRole('dialog'); await dlg.waitFor(); await page.waitForTimeout(1200)
const f = await dlg.locator('input,select,textarea').evaluateAll(els => els.map(e => {
  let l = e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText : null
  if (!l) l = e.closest('label')?.innerText ?? e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? ''
  return `${e.tagName.toLowerCase()}#${e.id} type=${e.type} «${(l ?? '').replace(/\s+/g, ' ').slice(0, 50)}»${e.tagName === 'SELECT' ? ' opts=' + [...e.options].map(o => o.text).slice(0, 12).join('/') : ''}`
}))
log('p01', f.join('\n'))
log('p01', 'dlg buttons', (await dlg.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean).join(' | '))
await shot(page, 'final/flow', 'p01-caseform', { fullPage: true })
await s.browser.close()
