import { openAs, sleep, log, openReport, clickBtn } from './_h.mjs'
const s = await openAs('uat.finance'); const p = s.page
let where = ''; const msgs = []
p.on('console', async m => { if (m.type() === 'error') { const a = await Promise.all(m.args().map(x => x.jsonValue().catch(() => '?'))); msgs.push(where + ' :: ' + a.map(x => String(x).slice(0, 120)).join(' | ')) } })
where = 'F1'; await openReport(p, 'gross-profit', 5000)
where = 'F1 drill co1'; await p.locator('#gross-profit-drilldown').selectOption({ index: 1 }); await sleep(4000)
where = 'F1 team'; await clickBtn(p, 'ทีม'); await sleep(3000)
where = 'F1 drill A'; await p.locator('#gross-profit-drilldown').selectOption({ index: 1 }); await sleep(4000)
where = 'F1 lastmonth'; await clickBtn(p, 'เดือนที่แล้ว'); await sleep(3000)
where = 'F1 custom'; await clickBtn(p, 'กำหนดเอง'); await sleep(2000)
where = 'profit tab'; await p.goto('http://localhost:3000/finance?tab=profit'); await sleep(5000)
where = 'F2 company'; await openReport(p, 'revenue-summary'); await clickBtn(p, 'รายบริษัทไฟแนนซ์'); await sleep(3000)
where = 'F4 emp'; await openReport(p, 'compensation'); await clickBtn(p, 'รายพนักงาน'); await sleep(3000)
log('X03', msgs.slice(0, 10))
await s.browser.close()
