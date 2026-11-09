import { openAs, BASE } from '../lib.mjs'
const s = await openAs('uat.finance')
const r = await s.page.request.get(`${BASE}/api/advances?pageSize=100`)
const b = await r.json()
const rows = (b.data?.items ?? b.data ?? []).filter((a) => /000[56]$/.test(a.ref))
console.log(JSON.stringify(rows.map((a) => ({ id: a.id, ref: a.ref, status: a.status, payee: a.payeeName ?? a.payee?.name, requester: a.requestedByName ?? a.createdByName, approved: a.approvedSatang, used: a.usedSatang, paidOut: a.paidOutAt ?? null, keys: Object.keys(a).join(',') })), null, 2))
await s.browser.close()
