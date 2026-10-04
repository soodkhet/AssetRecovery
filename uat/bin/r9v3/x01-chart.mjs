import { openAs, sleep, log, openReport } from './_h.mjs'
const s = await openAs('uat.finance'); const p = s.page
const msgs = []; p.on('console', m => { if (m.type() === 'error') msgs.push(m.text().slice(0, 300) + ' ARGS ' + m.args().length) })
for (const slug of ['gross-profit', 'revenue-summary', 'compensation']) {
  await openReport(p, slug, 6000)
  const info = await p.evaluate(() => ({
    bars: document.querySelectorAll('.recharts-bar-rectangle').length,
    rects: document.querySelectorAll('.recharts-bar-rectangle path, .recharts-rectangle').length,
    barsG: document.querySelectorAll('.recharts-bar').length,
    legend: document.querySelector('.recharts-legend-wrapper')?.innerText,
  }))
  log('X01', slug, JSON.stringify(info))
}
const vals = await Promise.all([]); log('X01 console', msgs.slice(0, 6))
await s.browser.close()
