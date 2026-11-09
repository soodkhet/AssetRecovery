import { openAs, BASE } from '../lib.mjs'
const s = await openAs('uat.finance')
const b = await (await s.page.request.get(`${BASE}/api/advances?pageSize=100`)).json()
const a = (b.data ?? []).find((x) => x.ref === 'ADV-2569-0005')
console.log(JSON.stringify({ status: a.status, used: a.usedSatang, crt: a.substituteReceipt }, null, 1))
await s.browser.close()
