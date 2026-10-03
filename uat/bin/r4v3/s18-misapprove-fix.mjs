// R4.38b แก้การอนุมัติผิดคน: admin ตีกลับค่าที่พัก in1 ฿600 → in1 ส่งใหม่ด้วยใบเสร็จเดิม (PHASE=admin|in1)
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, mainText, q, log } from './_h.mjs'
const R = 'R4v3'
const E = '5e527e99-5d0b-4e21-8dbd-db50e919ab6c'
const REASON = 'อนุมัติผิดคน — ส่งกลับให้ผู้จัดการทีมอนุมัติขั้น 1'
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const ST = `select status,approval_step_current step,manager_approved_by mgr,manager_approved_at mgr_at,finance_approved_by fin,gross_satang,receipt_file_hash,rejection_reason,revision_note,approval_history from expenses where id='${E}'`
const PH = process.env.PHASE
log('=== s18', PH, new Date().toISOString())
if (PH === 'admin') {
  const { browser, page, consoleErrors, serverErrors } = await openAs('admin')
  const mut = trackMutations(page)
  await page.goto(`${BASE}/finance?tab=comp`); await settle(page); await sleep(1500)
  log('main:', await mainText(page, 1500))
  const row = page.locator('tr', { hasText: '600' }).filter({ hasText: /ที่พัก/ })
  log('rows matched:', await row.count(), (await row.allInnerTexts()).map(flat))
  await shot(page, R, '88-admin-comp-queue', { fullPage: true })
  if ((await row.count()) !== 1) { log('STOP: row count'); await browser.close(); process.exit(1) }
  await row.getByRole('button', { name: 'ตีกลับ', exact: true }).click()
  const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(600)
  await dlg.locator('textarea').fill(REASON)
  await shot(page, R, '89-admin-reject-dialog')
  mut.reqs.length = 0; mut.res.length = 0
  await dlg.getByRole('button', { name: 'ตีกลับรายการ' }).click()
  log('toasts:', await collect(page, 3000), 'res:', mut.res)
  await settle(page); await sleep(1000)
  await shot(page, R, '90-admin-after-reject', { fullPage: true })
  log(q(ST))
  log('console', consoleErrors, 'server', serverErrors)
  await browser.close()
}
if (PH === 'in1') {
  const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
  const mut = trackMutations(page)
  await page.goto(`${BASE}/field`); await settle(page); await sleep(1000)
  await page.getByRole('button', { name: /แจ้งเตือน/ }).first().click(); await sleep(1200)
  const panel = flat(await page.locator('body').innerText()); const pi = panel.indexOf('แจ้งเตือนล่าสุด')
  log('bell:', panel.slice(pi, pi + 300))
  await shot(page, R, '91-in1-bell')
  await page.getByText('รายการเบิกถูกตีกลับ').first().click(); await sleep(2000); await settle(page)
  log('after bell url:', page.url(), await mainText(page, 500))
  await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
  const tab = page.getByRole('tab', { name: 'เบิกแยก' }).or(page.getByRole('button', { name: 'เบิกแยก', exact: true })).first()
  await tab.click(); await sleep(1200)
  log('separate tab:', await mainText(page, 900))
  await shot(page, R, '92-in1-separate-needs-revision', { fullPage: true })
  const fix = page.getByRole('button', { name: 'แก้ไขและส่งใหม่' })
  log('fix buttons:', await fix.count())
  if ((await fix.count()) !== 1) { log('STOP fix btn'); await browser.close(); process.exit(1) }
  await fix.click()
  const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(800)
  log('dialog:', flat(await dlg.innerText()))
  log('amount value:', await dlg.locator('input:not([type=file])').first().inputValue())
  await dlg.locator('textarea').fill('ส่งใหม่ตามมติ — ไม่แก้ยอด ใช้ใบเสร็จเดิม ขอให้ผู้จัดการทีมอนุมัติขั้น 1')
  await shot(page, R, '93-in1-resubmit-dialog', { fullPage: true })
  mut.reqs.length = 0; mut.res.length = 0
  await dlg.getByRole('button', { name: 'ส่งกลับเข้าคิวอนุมัติ' }).click()
  log('toasts:', await collect(page, 3000), 'reqs:', mut.reqs, 'res:', mut.res)
  await settle(page); await sleep(1000)
  log('after:', await mainText(page, 700))
  await shot(page, R, '94-in1-after-resubmit', { fullPage: true })
  log(q(ST))
  log('console', consoleErrors, 'server', serverErrors)
  await browser.close()
}
