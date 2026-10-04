import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const ring = (pg) => pg.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const s = getComputedStyle(e); return `${e.tagName}:${(e.textContent || '').trim().slice(0, 18)}|fv=${e.matches(':focus-visible')}|outline=${s.outlineStyle}/${s.outlineWidth}|shadow=${s.boxShadow === 'none' ? 'none' : 'yes'}` })
const o = await openAs('admin'); await o.page.goto(BASE + '/settings/roles'); await o.page.waitForLoadState('networkidle')
const links = await o.page.locator('a[href^="/settings/"]').evaluateAll((as) => as.map((a) => a.textContent.trim() + '>' + a.getAttribute('href')))
log('settings links', links.join(' | '))
await o.page.locator('a[href="/settings/teams"]').first().click(); await o.page.waitForURL(/teams/); await o.page.waitForTimeout(1200)
const c = await ring(o.page); await shot(o.page, 'R10v3', 'g1-settings-click')
const tabs = []; for (let i = 0; i < 14; i++) { await o.page.keyboard.press('Tab'); await o.page.waitForTimeout(80); tabs.push(await ring(o.page)) }
await shot(o.page, 'R10v3', 'g1-settings-tab')
log('FOCUS settings click→', c, '\n  tab:', tabs.join('\n       '), '\n  ไม่มีกรอบ', tabs.filter((t) => t.includes('outline=none') && t.includes('shadow=none')).length)
await o.browser.close()
