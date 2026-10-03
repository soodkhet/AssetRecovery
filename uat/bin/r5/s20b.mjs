// R5.20 (เสริม) ฟิลด์ที่ปิดสำหรับผู้ใช้บริษัท
import { openAs, BASE, log, A } from './_h.mjs'
for (const [u, id] of [['uat.co1.mgr', A.C1], ['uat.co2.admin', A.C5], ['uat.finance', A.C1]]) {
  const s = await openAs(u); const r = await s.page.request.get(`${BASE}/api/assets/${id}`); const d = (await r.json()).data
  log(`R5.20b ${u} ${d.caseRef}: imeiActual=${d.imeiActual} teamName=${d.teamName} agentName=${d.agentName} rejectReason=${d.rejectReason} conditionNote=${d.conditionNote} photos=${JSON.stringify(d.photos ?? d.photoUrls ?? null)?.slice(0, 80)} keys=${Object.keys(d).join(',')}`)
  await s.browser.close()
}
