// R10.27 ภาพประกอบ 4 ภาพ
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const run = async (u, path, name, after) => {
  const o = await openAs(u)
  if (path) await o.page.goto(BASE + path)
  await o.page.waitForLoadState('networkidle').catch(() => {})
  await o.page.waitForTimeout(1200)
  const extra = after ? await after(o.page) : ''
  const p = await shot(o.page, 'R10v3', name)
  const txt = await o.page.locator('body').innerText()
  const ce = /\b20\d\d\b/.test(txt.replace(/2026-|202\d-\d\d/g, '')) ? 'CE?' : ''
  log('SHOT', u, o.page.url().replace(BASE, ''), p, 'specRef=' + /§\d|ไฟล์ \d\d/.test(txt), ce, extra, 'consoleErr=' + o.consoleErrors.length, 'srvErr=' + o.serverErrors.join(';'))
  await o.browser.close()
}
await run('uat.co1.mgr', null, '01-company-landing')
await run('uat.finance', '/reports', '02-finance-reports', async (pg) => { const t = await pg.locator('main').innerText(); return 'E1=' + /สรุป KPI|E1|Scorecard/i.test(t) })
await run('uat.mgr.in', '/finance', '03-manager-finance-tab', async (pg) => { const tabs = await pg.getByRole('tab').allInnerTexts().catch(() => []); return 'tabs=' + tabs.join('/') })
await run('uat.exec', '/accounting', '04-exec-accounting', async (pg) => { const tabs = await pg.getByRole('tab').allInnerTexts().catch(() => []); const t = await pg.locator('main').innerText(); return 'tabs=' + tabs.join('/') + ' noPerm=' + (t.match(/ไม่มีสิทธิ์/g) ?? []).length })
