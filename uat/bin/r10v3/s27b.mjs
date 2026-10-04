import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const o = await openAs('uat.exec'); await o.page.goto(BASE + '/accounting'); await o.page.waitForLoadState('networkidle')
const out = []
for (const t of ['รายได้และขาย', 'เงินรับ', 'ค่าใช้จ่าย', 'กระทบยอด', 'เอกสาร & WHT', 'เอกสารไม่ครบ', 'ข้อซักถาม', 'ส่งมอบ']) {
  await o.page.locator('main').getByText(t, { exact: true }).first().click(); await o.page.waitForTimeout(1500)
  const txt = await o.page.locator('main').innerText()
  const np = /ไม่มีสิทธิ์/.test(txt); out.push(t + '=' + (np ? 'ไม่มีสิทธิ์' : 'เปิดได้'))
  if (t === 'กระทบยอด') await shot(o.page, 'R10v3', '04b-exec-accounting-bankrecon')
}
log('R10.27 exec accounting tabs', out.join(' · '), 'srvErr=' + o.serverErrors.join(';'))
await o.browser.close()
