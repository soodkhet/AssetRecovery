// R15b.15 ตรวจท้ายรอบ: ค่าตั้งกลับปิด · หน้าที่แตะ ไม่มีเลขอ้างอิงสเปค/ปี ค.ศ.
import { openAs, shot, BASE, settle, sleep, log, R, get } from './_h.mjs'
const chk = (name, t) => log(name, 'spec-ref:', (t.match(/§\s*\d|ไฟล์ \d\d\b|`\d\d`/g) || []).length, 'CE-year:', (t.match(/\b20[2-3]\d\b/g) || []).slice(0, 5))
const f = await openAs('uat.finance')
log('policy:', await get(f.page, '/api/payees/wht-condition-policy', 200))
for (const [tab, name] of [['approval', 'b-15-fin-approval'], ['compensation', 'b-15-fin-compensation'], ['payout', 'b-15-fin-payout'], ['payee', 'b-15-fin-payee']]) {
  await f.page.goto(`${BASE}/finance?tab=${tab}`); await settle(f.page); await sleep(1500)
  const t = await f.page.locator('main').innerText(); chk(tab, t)
  if (tab === 'approval') log('approval CRT mentions:', (t.match(/CRT-2569-\d+/g) || []).length, t.replace(/\s+/g, ' ').match(/.{0,200}CRT-2569-0001.{0,200}/)?.[0])
  await shot(f.page, R, name, { fullPage: true })
}
await f.page.goto(`${BASE}/settings/finance?tab=whtpolicy`); await settle(f.page); await sleep(1200); chk('whtpolicy(fin)', await f.page.locator('main').innerText())
await f.browser.close()
const a = await openAs('uat.agent.in1', { mobile: true })
await a.page.goto(`${BASE}/field/expenses`); await settle(a.page); await sleep(1000)
await a.page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900)
chk('field expenses', await a.page.locator('main').innerText()); await shot(a.page, R, 'b-15-field-expenses', { fullPage: true })
await a.browser.close()
