import { openAs, BASE, settle, log, txt, shot, step, sleep } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
await s.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const paste = async (loc, text) => { await loc.fill(''); await loc.focus(); await p.evaluate(t => navigator.clipboard.writeText(t), text); await p.keyboard.press('Meta+V'); await sleep(400); return loc.inputValue() }
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1500)
  await p.locator('main').getByRole('button', { name: 'สายการอนุมัติ', exact: true }).first().click(); await settle(p, 900)
  const pol = p.locator('#policy-advance-max')
  const r = {}
  r.mixed = await paste(pol, 'ราคา 5,000 บาท')
  r.num = await paste(pol, '5,000.50')
  r.neg = await paste(pol, '-300')
  await p.locator('main').getByRole('button', { name: 'บัญชีธนาคารบริษัท', exact: true }).first().click(); await settle(p, 900)
  await p.locator('main').getByRole('button', { name: '+ เพิ่มบัญชี' }).click(); await settle(p, 600)
  const acct = p.getByRole('dialog').last().locator('#bank-account-number')
  r.acctMixed = await paste(acct, 'บัญชี 123-4-56789-0')
  r.acctPlain = await paste(acct, '123-4-56789-0')
  await shot(p, 'A2-paste')
  await p.keyboard.press('Escape'); await sleep(500); if (await p.locator('[role=alertdialog]').isVisible().catch(() => false)) await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click()
  step({ step: 'A2.numeric-paste', action: "วางข้อความ (คลิปบอร์ดจริง Cmd+V) ในช่องเงินเพดานทดรอง: 'ราคา 5,000 บาท' / '5,000.50' / '-300' · ช่องเลขบัญชี: 'บัญชี 123-4-56789-0' / '123-4-56789-0' (ไม่บันทึก)", expected: 'ช่องรับเฉพาะตัวเลข — วางข้อความผสมถูกกรองหรือไม่รับ ไม่ตัดเงียบผิดค่า', actual: `เพดานทดรอง: ผสม→'${r.mixed}' · '5,000.50'→'${r.num}' · '-300'→'${r.neg}' · เลขบัญชี: ผสม→'${r.acctMixed}' · ล้วน→'${r.acctPlain}'`, status: !/[ก-๙a-z]/i.test(r.mixed + r.acctMixed) ? 'pass' : 'fail', evidence: ['A2-paste.png'] })
} finally { await s.browser.close() }
