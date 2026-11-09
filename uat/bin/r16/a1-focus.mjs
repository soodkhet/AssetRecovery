import { openAs, BASE, settle, log, shot, sleep, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
try {
  await p.goto(`${BASE}/settings/organization`); await settle(p, 1000)
  await p.getByRole('button', { name: 'แก้ไขข้อมูล' }).click(); await settle(p, 600)
  const d = p.getByRole('dialog').last()
  await d.locator('#org-phone').fill('02abc'); await d.locator('#org-reason').fill('ทดสอบเบอร์ตัวอักษร')
  await d.getByRole('button', { name: 'บันทึก' }).click(); await sleep(1000)
  const ae = await p.evaluate(() => { const e = document.activeElement; return `${e?.tagName}#${e?.id} «${(e?.innerText||e?.value||'').slice(0,40)}» invalid=${e?.getAttribute('aria-invalid')}` })
  const inv = await d.locator('[aria-invalid=true]').evaluateAll(es => es.map(e => e.id))
  const footer = await d.locator('[role=alert]').allInnerTexts()
  log('focus', ae, 'invalid', inv, 'alerts', footer, 'api', res)
  await shot(p, 'A1-org-phone-letters')
  // close with Esc -> discard prompt
  await p.keyboard.press('Escape'); await sleep(600)
  const ad = await p.locator('[role=alertdialog]').allInnerTexts()
  log('esc', ad)
  await shot(p, 'A1-org-esc-discard')
} finally { await s.browser.close() }
