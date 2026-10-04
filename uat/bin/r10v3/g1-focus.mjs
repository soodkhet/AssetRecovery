// R10g.1 กรอบโฟกัส: คลิกไม่มีกรอบ · Tab มีกรอบ
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const ring = (pg) => pg.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const s = getComputedStyle(e); return `${e.tagName}:${(e.textContent || '').trim().slice(0, 18)}|fv=${e.matches(':focus-visible')}|outline=${s.outlineStyle}/${s.outlineWidth}|shadow=${s.boxShadow === 'none' ? 'none' : 'yes'}` })
const run = async (u, path, clickText, name) => {
  const o = await openAs(u); await o.page.goto(BASE + path); await o.page.waitForLoadState('networkidle')
  await o.page.locator('main').getByText(clickText, { exact: true }).first().click(); await o.page.waitForTimeout(800)
  const c = await ring(o.page); await shot(o.page, 'R10v3', `g1-${name}-click`)
  const tabs = []
  for (let i = 0; i < 12; i++) { await o.page.keyboard.press('Tab'); await o.page.waitForTimeout(80); tabs.push(await ring(o.page)) }
  await shot(o.page, 'R10v3', `g1-${name}-tab`)
  const noRing = tabs.filter((t) => t !== 'body' && t.includes('outline=none') && t.includes('shadow=none'))
  log('FOCUS', u, path, 'click→', c, '\n  tab:', tabs.join('\n       '), '\n  ไม่มีกรอบ', noRing.length)
  await o.browser.close()
}
await run('uat.account', '/accounting', 'รายได้และขาย', 'accounting')
await run('admin', '/settings/teams', 'ทีม', 'settings')
