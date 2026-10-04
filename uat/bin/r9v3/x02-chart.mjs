import { openAs, sleep, log, openReport, shot, R } from './_h.mjs'
const s = await openAs('uat.finance'); const p = s.page
await openReport(p, 'gross-profit', 6000)
const info = await p.evaluate(() => [...document.querySelectorAll('.recharts-bar-rectangle path, .recharts-rectangle')].map(e => ({ d: e.getAttribute('d')?.slice(0, 80), fill: e.getAttribute('fill'), cfill: getComputedStyle(e).fill, op: getComputedStyle(e).opacity, h: e.getBBox().height })))
log('X02', JSON.stringify(info))
await p.locator('.recharts-wrapper').first().screenshot({ path: 'uat/shots/R9v3/x02-f1-chart.png' })
await s.browser.close()
