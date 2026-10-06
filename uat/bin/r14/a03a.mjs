// R14.03a ผู้จัดการทีม A มอบหมาย UAT-CO1-006 + UAT-CO2-R14 ให้ in1
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, trackMutations } from './_h.mjs'
const { browser, page, serverErrors } = await openAs('uat.mgr.in')
const m = trackMutations(page)
for (const ref of ['UAT-CO1-006', 'UAT-CO2-R14']) {
  await page.goto(`${BASE}/cases/assign`); await settle(page); await sleep(800)
  const row = page.locator('tr', { hasText: ref }).first()
  log('row before', ref, (await row.innerText()).replace(/\s+/g, ' '))
  await row.getByRole('button', { name: 'มอบหมาย', exact: true }).click()
  const d = page.getByRole('dialog'); await d.waitFor(); await sleep(1200)
  await d.getByText('อนันต์ ตามทรัพย์').first().click(); await sleep(300)
  if (ref === 'UAT-CO2-R14') await shot(page, R, '03-assign-modal')
  await d.getByRole('button', { name: 'ยืนยันมอบหมาย' }).click()
  log('toasts', await toasts(page, 3000), m.res.splice(0))
}
await page.goto(`${BASE}/cases/assign`); await settle(page); await sleep(800)
await shot(page, R, '03-assign-after', { fullPage: true })
await browser.close()
log(q(`select c.case_ref,u.username,a.status,a.created_at from case_assignments a join users u on u.id=a.agent_id join cases c on c.id=a.case_id where c.case_ref in ('UAT-CO1-006','UAT-CO2-R14')`))
log('5xx', serverErrors)
