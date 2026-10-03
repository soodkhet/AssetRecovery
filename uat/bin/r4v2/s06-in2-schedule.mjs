// R4.13 in2 มือถือ: รับ C3, C4 · จัดวัน C3 แบบเน็ตหลุด 1 ครั้ง · จัด C4
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, card, mainText, q, log, SQL, REF, T0 } from './_h.mjs'
const R = 'R4v2'
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.agent.in2', { mobile: true })
const mut = trackMutations(page)
log('=== s06 v2', new Date().toISOString())
await page.goto(`${BASE}/field`); await settle(page); await sleep(800)
log('R4.13 dashboard:', await mainText(page, 500))
await shot(page, R, '13-in2-dashboard')
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
log('R4.13 pending:', await mainText(page, 900))
await shot(page, R, '13-in2-pending', { fullPage: true })
for (const r of [REF.C3, REF.C4]) {
  await card(page, r, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
  log('R4.13 accept', r, await collect(page, 2500))
  await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(600)
}
log('R4.13 accept mut:', mut.res)
const schedule = async (ref, offline) => {
  await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(700)
  await card(page, ref, 'จัดวันที่').getByRole('button', { name: 'จัดวันที่' }).click()
  const cal = page.getByRole('dialog').last(); await cal.waitFor(); await sleep(500)
  await cal.locator('button:has(> span:text-is("3"))').first().click(); await sleep(400)
  log('confirm:', (await page.getByRole('dialog').last().innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 200))
  if (offline) await context.setOffline(true)
  mut.res.length = 0
  await page.getByRole('button', { name: 'ยืนยันเลือกวันนี้' }).click()
  const t = await collect(page, 3500)
  if (offline) {
    log('R4.13 offline toasts:', t, 'mut:', mut.res)
    await shot(page, R, '13-offline-toast')
    log('R4.13 offline body:', (await page.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 400))
    log(q(SQL.asg).split('\n').filter(l => l.includes('003')).join('\n'))
    await context.setOffline(false)
  } else log('R4.13 schedule', ref, t, mut.res)
}
await schedule(REF.C3, true)
await schedule(REF.C3, false)
await schedule(REF.C4, false)
await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(800)
log('R4.13 tracking:', await mainText(page, 700))
await shot(page, R, '13-in2-tracking')
log(q(SQL.asg))
log(q(`select count(*) from audit_logs where target_type='case_assignments' and created_at>'${T0}'`))
log(q(SQL.noti).split('\n').filter(l => l.includes('003') || l.includes('004')).join('\n'))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
