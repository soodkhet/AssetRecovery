import { openAs, shot, BASE, toasts, inlineErrors, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
await page.goto(`${BASE}/settings/teams`); await settle(page)
async function edit(team, { sup, mgr, side, shotName, reason }) {
  if (side === 'outsource') { await page.getByRole('button', { name: 'Outsource', exact: true }).click(); await settle(page) }
  const row = page.getByRole('row').filter({ hasText: team })
  await row.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  const dlg = page.getByRole('dialog')
  log(team, 'title', await dlg.locator('h2,h3').first().innerText())
  log(team, 'supervisor opts', JSON.stringify(await dlg.locator('#team-supervisor option').allInnerTexts()))
  log(team, 'manager checkboxes', JSON.stringify((await dlg.getByRole('checkbox').evaluateAll(els => els.map(e => e.closest('label')?.innerText.trim()))).filter(t => t && !/^[ก-๙]+$/.test(t)).slice(0, 20)))
  if (sup) {
    const opts = await dlg.locator('#team-supervisor option').allInnerTexts()
    await dlg.locator('#team-supervisor').selectOption({ label: opts.find(o => o.startsWith(sup)) })
  }
  await dlg.getByRole('checkbox', { name: new RegExp(mgr) }).check()
  await dlg.locator('#team-reason').fill(reason)
  await sleep(300)
  log(team, 'warnings', (await dlg.innerText()).match(/หัวหน้าทีมคนนี้[^\n]*/)?.[0] ?? '-')
  if (shotName) await shot(page, 'R1', shotName, { fullPage: true })
  const n0 = m.res.length
  await dlg.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
  log(team, 'toast', JSON.stringify(await toasts(page)), 'res', m.res.slice(n0), 'open', await dlg.isVisible())
  if (await dlg.isVisible()) { log('errors', await inlineErrors(dlg)); await dlg.getByRole('button', { name: 'ยกเลิก' }).click() }
  await settle(page); await sleep(3000)
}
await edit('UAT ทีม A กรุงเทพ', { sup: 'สุริยา หัวหน้าเอ', mgr: 'ชัยวัฒน์ จัดการทีม', shotName: 'R1.23-team-a-edit', reason: 'กำหนดผู้จัดการและหัวหน้าทีม A สำหรับ UAT รอบที่ 1' })
await edit('UAT ทีม B นนทบุรี', { mgr: 'ชัยวัฒน์ จัดการทีม', reason: 'กำหนดผู้จัดการทีม B (ผู้จัดการคนเดียวกับทีม A) สำหรับ UAT' })
await shot(page, 'R1', 'R1.23-teams-done', { fullPage: true })
log('inhouse rows', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(r => r.replace(/\s+/g, ' ').slice(0, 200))))
await edit('UAT ทีม C ปทุมธานี', { side: 'outsource', mgr: 'ธนา เอาท์ซอร์ส', reason: 'กำหนดผู้จัดการทีม C ฝั่ง Outsource สำหรับ UAT รอบที่ 1' })
log('outsource rows', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(r => r.replace(/\s+/g, ' ').slice(0, 200))))
await shot(page, 'R1', 'R1.23-teams-outsource-done', { fullPage: true })
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
