// R5.20 ผู้ใช้บริษัท scope · R5.21 ภายในอ่านอย่างเดียว / ผู้จัดการ / พนักงาน
import { openAs, shot, BASE, settle, sleep, mainText, log, api, R, A, LOT1, LOT2 } from './_h.mjs'
log('=== s20-21', new Date().toISOString())
const B = { imeiActual: '356789100000011', condition: 'normal', photos: [] }
const ACTIONS = ['รับเข้าคลัง', 'ตีกลับ', 'นัดวันส่งมอบ', 'แนบเอกสาร', 'แนบเอกสาร & ยืนยัน', 'รับใหม่']
const short = s => s.replace(/"(imeiActual|teamName|agentName|rejectReason)":("[^"]*"|null)/g, (m) => m).slice(0, 260)
async function visit(user, opts = {}) {
  const s = await openAs(user, { mobile: !!opts.mobile })
  const p = s.page
  await p.goto(`${BASE}/`); await settle(p)
  const nav = (await p.locator('nav').first().innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | ')
  await p.goto(`${BASE}/warehouse`); await settle(p); await sleep(1200)
  log(`\n## ${user} nav: ${nav.slice(0, 200)} | url: ${new URL(p.url()).pathname}`)
  log(`${user} tabs:`, JSON.stringify(await p.getByRole('tab').allInnerTexts()))
  log(`${user} main:`, await mainText(p, 700))
  const tabsTxt = {}
  for (const t of ['รับเข้าคลัง', 'ในคลัง', 'รอส่งมอบ', 'ส่งมอบแล้ว']) {
    const tab = p.getByRole('tab', { name: new RegExp('^' + t) })
    if (!(await tab.count())) continue
    await tab.click(); await sleep(900)
    const m = await p.locator('main').innerText().catch(() => '')
    const btns = await p.locator('main button, main a').allInnerTexts()
    tabsTxt[t] = { lots: m.match(/LOT-2569-\d{3}/g), refs: [...new Set(m.match(/UAT-CO\d-\d{3}/g) ?? [])], acts: btns.map(b => b.trim()).filter(b => ACTIONS.includes(b) || /Excel|PDF/.test(b)) }
    if (t === 'ในคลัง' || t === 'ส่งมอบแล้ว') {
      const empty = m.match(/ไม่มี[^\n]*/)?.[0]; if (empty) tabsTxt[t].empty = empty
    }
  }
  log(`${user} per-tab:`, JSON.stringify(tabsTxt))
  // เปิดรายละเอียดล็อตของตัวเอง (ถ้ามี)
  if (opts.lotDetail) {
    await p.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await sleep(800)
    const b = p.getByRole('button', { name: 'ดูรายการ' }).first()
    if (await b.count()) {
      await b.click(); await sleep(1200)
      log(`${user} lot detail:`, await mainText(p, 900))
      log(`${user} detail actions:`, JSON.stringify((await p.locator('main button, main a').allInnerTexts()).map(x => x.trim()).filter(x => ACTIONS.includes(x) || /Excel|PDF|เอกสาร/.test(x))))
    }
  }
  await shot(p, R, opts.shot, { fullPage: true })
  const out = {}
  for (const [k, m, path, body] of opts.apis ?? []) out[k] = await api(p, m, path, body)
  for (const [k, v] of Object.entries(out)) log(`${user} API ${k}:`, short(v))
  log(`${user} console`, s.consoleErrors.slice(0, 4), 'server', s.serverErrors)
  await s.browser.close()
}
const V1 = 'handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/778bc708-6e6b-4b6d-b37c-5a3dad55696f.pdf'
await visit('uat.co1.mgr', { shot: 'R5.20-co1-warehouse', lotDetail: true, apis: [
  ['GET lots', 'GET', '/api/handover-lots'], ['GET LOT2', 'GET', `/api/handover-lots/${LOT2}`], ['GET C5', 'GET', `/api/assets/${A.C5}`], ['GET C1', 'GET', `/api/assets/${A.C1}`],
  ['GET LOT1 pdf', 'GET', `/api/handover-lots/${LOT1}/pdf`], ['GET LOT1 xlsx', 'GET', `/api/handover-lots/${LOT1}/export-excel`],
  ['POST docs', 'POST', `/api/handover-lots/${LOT1}/documents`, { document: 'signed_doc', fileUrl: V1 }], ['PATCH confirm', 'PATCH', `/api/handover-lots/${LOT1}/confirm`, {}], ['POST intake C1', 'POST', `/api/assets/${A.C1}/intake`, B],
] })
await visit('uat.co2.admin', { shot: 'R5.20-co2-warehouse', lotDetail: true, apis: [
  ['GET lots', 'GET', '/api/handover-lots'], ['GET LOT1', 'GET', `/api/handover-lots/${LOT1}`], ['GET C1', 'GET', `/api/assets/${A.C1}`], ['GET C5', 'GET', `/api/assets/${A.C5}`], ['GET rnd', 'GET', `/api/assets/00000000-0000-4000-8000-000000000000`],
] })
for (const u of ['uat.finance', 'uat.account', 'uat.exec', 'uat.mgr.in', 'uat.sup.in', 'uat.mgr.out', 'uat.agent.in1']) {
  await visit(u, { mobile: u === 'uat.agent.in1', shot: `R5.21-${u.replace('uat.', '')}-warehouse`, apis: [
    ['GET assets', 'GET', '/api/assets?limit=50'], ['GET lots', 'GET', '/api/handover-lots'], ['POST intake C1', 'POST', `/api/assets/${A.C1}/intake`, B],
  ] })
}
