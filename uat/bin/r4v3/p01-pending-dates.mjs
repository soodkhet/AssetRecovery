// อ่านอย่างเดียว: pendingFieldDates ของพนักงาน (argv[2])
import { openAs, BASE } from '../lib.mjs'
const u = process.argv[2]
const { browser, page } = await openAs(u, { mobile: true })
const j = await (await page.request.get(`${BASE}/api/field/expenses?type=caseBound`)).json()
console.log(u, 'pendingFieldDates=', JSON.stringify(j.data.pendingFieldDates), 'pendingSatang=', j.data.pendingSatang, 'items=', j.data.items.map(i => `${i.caseRef}:${i.expenseType}:${i.grossSatang}:${i.status}`).join(','))
await browser.close()
