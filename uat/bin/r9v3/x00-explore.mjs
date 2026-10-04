import { openAs, shot, R, getJ, log, sleep, dump } from './_h.mjs'
const s = await openAs('uat.finance')
const p = s.page
const list = await getJ(p, '/api/reports')
dump('x00-list-finance', list)
await p.goto('http://localhost:3000/reports/gross-profit'); await sleep(3500)
const ui = await p.evaluate(() => ({
  selects: [...document.querySelectorAll('select')].map(s => ({ id: s.id, label: s.labels?.[0]?.innerText, opts: [...s.options].map(o => o.value + '=' + o.text) })),
  buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean),
}))
log('UI', ui)
const r = await getJ(p, '/api/reports/gross-profit?dimension=company')
dump('x00-f1', r)
await s.browser.close()
