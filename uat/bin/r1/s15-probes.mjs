import { execSync } from 'node:child_process'
import { openAs, shot, BASE, log, sleep, settle } from './_h.mjs'
const q = sql => execSync(`uat/bin/q.sh "${sql}" | sed -n 4p`).toString().trim()
// R1.42
{
  const s = await openAs('admin'); const page = s.page
  await page.goto(`${BASE}/settings/users`); await settle(page)
  await page.getByRole('tab', { name: /เจ้าหน้าที่ติดตามทรัพย์/ }).click(); await settle(page)
  await page.getByText('กำลังโหลดข้อมูล...').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  await page.getByRole('row').filter({ hasText: 'uat.agent.in2' }).getByRole('button', { name: 'ระงับ' }).click()
  const dlg = page.getByRole('dialog')
  log('R1.42 title', await dlg.locator('h2,h3').first().innerText())
  const ta = dlg.locator('textarea').first()
  log('R1.42 placeholder', await ta.getAttribute('placeholder'))
  const btn = dlg.getByRole('button', { name: /ยืนยันระงับ/ })
  log('R1.42 btn empty disabled', await btn.isDisabled())
  await ta.fill('abc'); await sleep(200)
  log('R1.42 btn abc disabled', await btn.isDisabled())
  await shot(page, 'R1', 'R1.42-suspend-confirm-disabled', { fullPage: true })
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
  const id = q("select id from users where username='uat.agent.in2'")
  const r = await page.request.patch(`${BASE}/api/users/${id}/suspend`, { data: { reason: '' } })
  log('R1.42 API', r.status(), (await r.text()).slice(0, 300))
  log('R1.42 status', q("select status from users where username='uat.agent.in2'"), 'audit', q(`select count(*) from audit_logs where target_id='${id}' and action in ('status_change','update')`))
  log('errors', s.consoleErrors, s.serverErrors)
  await s.browser.close()
}
// R1.43
{
  const s = await openAs('uat.co1.mgr'); const page = s.page
  log('R1.43 landing', new URL(page.url()).pathname, (await page.locator('main').first().innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 300))
  await shot(page, 'R1', 'R1.43-portal-landing', { fullPage: true })
  for (const p of ['/dashboard', '/cases', '/cases/submit', '/finance', '/accounting', '/warehouse', '/reports', '/settings/users', '/field']) {
    await page.goto(BASE + p); await settle(page)
    const final = new URL(page.url()).pathname
    const h1 = await page.locator('h1').allInnerTexts()
    const links = [...new Set((await page.getByRole('link').allInnerTexts()).map(x => x.trim()).filter(Boolean))].slice(0, 10)
    log('R1.43', p, '→', final, '| h1', JSON.stringify(h1), '| links', JSON.stringify(links))
    if (final !== '/portal') await shot(page, 'R1', `R1.43-${p.replace(/\//g, '_').slice(1)}-as-company`, { fullPage: true })
  }
  for (const p of ['/api/users', '/api/cases', '/api/finance-companies', '/api/teams', '/api/accounting/periods']) {
    const r = await page.request.get(BASE + p); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch {}
    log('R1.43 API', p, r.status(), j?.error?.code ?? (j ? `data=${JSON.stringify(j.data).slice(0, 160)}` : t.slice(0, 80)))
  }
  log('errors', s.consoleErrors, s.serverErrors)
  await s.browser.close()
}
