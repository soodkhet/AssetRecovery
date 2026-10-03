import { chromium } from '@playwright/test'
import { execSync } from 'node:child_process'
import { openAs, shot, BASE, P, log, sleep, settle } from './_h.mjs'
const q = sql => execSync(`uat/bin/q.sh "${sql}" | sed -n 4p`).toString().trim()
// R1.40
{
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.locator('#identifier').fill('uat.agent.in1')
  await page.locator('#password').fill(P['uat.agent.in1'].initial)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await sleep(3000)
  log('R1.40 url', new URL(page.url()).pathname, '| msg', JSON.stringify((await page.locator('body').innerText()).match(/[^\n]*ไม่สำเร็จ[^\n]*\n?[^\n]*/g)))
  await shot(page, 'R1', 'R1.40-old-password-rejected', { fullPage: true })
  await browser.close()
}
log('R1.40 audit', execSync(`uat/bin/q.sh "select actor_id, after_data from audit_logs where action='login' order by created_at desc limit 1" | sed -n 4p`).toString().trim())
// R1.41
const fid = q("select id from users where username='uat.finance'")
{
  const s = await openAs('uat.mgr.in')
  const r = await s.page.request.post(`${BASE}/api/users/${fid}/password`, { data: { password: 'Probe1234x', confirmPassword: 'Probe1234y' } })
  log('R1.41a mgr.in', r.status(), (await r.text()).slice(0, 200))
  await s.browser.close()
}
{
  const s = await openAs('uat.admin')
  const r = await s.page.request.post(`${BASE}/api/users/${fid}/password`, { data: { password: P['uat.finance'].password, confirmPassword: P['uat.finance'].password } })
  log('R1.41b uat.admin', r.status(), (await r.text()).slice(0, 200))
  const page = s.page
  await page.goto(`${BASE}/settings/users`); await settle(page)
  log('R1.41c url', new URL(page.url()).pathname, '| h1', JSON.stringify(await page.locator('h1').allInnerTexts()))
  await page.getByText('กำลังโหลดข้อมูล...').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  const tabs = await page.getByRole('tab').allInnerTexts()
  log('R1.41c tabs', JSON.stringify(tabs))
  if (tabs.length) {
    await page.getByRole('tab', { name: /แอดมิน/ }).click().catch(() => {}); await settle(page); await sleep(800)
    const rows = page.locator('tbody tr')
    const n = await rows.count()
    const btns = []
    for (let i = 0; i < n; i++) btns.push((await rows.nth(i).innerText()).split('\n')[0] + ' → ' + JSON.stringify(await rows.nth(i).getByRole('button').allInnerTexts()))
    log('R1.41c system rows/buttons', JSON.stringify(btns))
    const add = page.getByRole('button', { name: '+ สร้างบัญชี' })
    if (await add.count()) { await add.click(); log('R1.41c group options', JSON.stringify(await page.getByRole('dialog').locator('#user-group option').allInnerTexts())); await page.getByRole('dialog').getByRole('button', { name: 'ยกเลิก' }).click() }
    else log('R1.41c no create button')
  }
  await shot(page, 'R1', 'R1.41-admin-office-users-tab', { fullPage: true })
  log('R1.41 errors', s.consoleErrors, s.serverErrors)
  await s.browser.close()
}
log('R1.41 finance mcp', q("select must_change_password from users where username='uat.finance'"), 'audit updates on finance after probe', q(`select count(*) from audit_logs where target_type='users' and target_id='${fid}' and action='update' and created_at > now() - interval '2 minutes'`))
