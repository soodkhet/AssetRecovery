// อนุมัติเคส: คำขอรีไซเกิล FT-01 → เปิดรายละเอียด → อนุมัติ (GO=1)
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const REF = process.argv[2] ?? 'FINAL-FT-01'
const s = await openAs('uat.approver'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/cases/submit'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
for (const sel of await page.locator('select').all()) { const has = await sel.evaluate(e => [...e.options].some(o => o.text === 'รออนุมัติรีไซเกิล')); if (has) { await sel.selectOption({ label: 'รออนุมัติรีไซเกิล' }); break } }
await page.getByText('รออนุมัติรีไซเกิล').first().click().catch(() => {}); await page.waitForTimeout(1500)
const row = page.locator('tr', { hasText: REF }).first(); log('rc', 'row', clean(await row.innerText()), (await row.getByRole('button').allInnerTexts()).join('|'))
await row.getByRole('button').last().click(); await page.waitForTimeout(1500)
const d = page.getByRole('dialog').last(); const btns = (await d.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean)
log('rc', 'dlg', clean(await d.innerText()).slice(0, 500), '| buttons', btns.join('|'))
await shot(page, 'rc-detail', { fullPage: true })
const ok = d.getByRole('button', { name: /^อนุมัติ/ }).first()
const rej = d.getByRole('button', { name: /ไม่อนุมัติ/ }).first(); if (await rej.count()) log('rc', 'reject disabled w/o reason', await rej.isDisabled())
if (process.env.GO === '1' && await ok.count()) { await ok.click(); await page.waitForTimeout(800); const c = page.getByRole('dialog').last(); if (await c.getByRole('button', { name: /ยืนยัน/ }).count()) await c.getByRole('button', { name: /ยืนยัน/ }).last().click()
  log('rc', 'approve', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 220))) }
log('rc', q(`select case_ref,status,tracking_round from cases where case_ref='${REF}' order by tracking_round`))
log('rc', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
