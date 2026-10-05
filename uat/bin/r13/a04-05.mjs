// R13.04 probe ข้ามทีม + R13.05 บริหาร export ใบส่งมอบ
import { openAs, shot, log, mainText, settle, sleep, R, q, qa, get, BASE } from './_h.mjs'
import { mkdirSync } from 'node:fs'
const AS1 = '2666a107-4e89-44f9-8212-31232a8c05af', AS5 = '5cad8233-fbe1-4ba6-ab92-f886e4434689'
const LOT3 = '15db3c66-d183-4a3a-bbb0-2d9decee40af', LOT4 = '469803a8-82b7-4d51-8dc7-e07a10e0d004'
const T = new Date().toISOString()
const fp = () => qa(`select (select md5(string_agg(id::text||asset_status::text||coalesce(updated_at::text,''),',' order by id)) from assets),(select md5(string_agg(id::text||status::text||coalesce(updated_at::text,''),',' order by id)) from handover_lots)`)
const before = fp()
const short = s => s.replace(/("imei[^"]*":"[^"]*")/gi, '[IMEI]').slice(0, 260)
async function probe(u, f) { const o = await openAs(u); await f(o.page); await o.browser.close() }
await probe('uat.mgr.in', async p => {
  const a = await get(p, `/api/assets/${AS5}`); log('mgr.in GET AS5', short(a), /3567|ลูกหนี้|debtor/i.test(a) ? 'LEAK?' : 'no-leak')
  log('mgr.in GET LOT4', short(await get(p, `/api/handover-lots/${LOT4}`)))
  const r = await p.request.post(`${BASE}/api/assets/${AS1}/intake`, { data: {}, failOnStatusCode: false })
  log('mgr.in POST AS1 intake {}', r.status(), (await r.text()).slice(0, 200))
})
await probe('uat.mgr.out', async p => { log('mgr.out GET AS1', short(await get(p, `/api/assets/${AS1}`))) })
await probe('uat.sup.in', async p => {
  const r = await p.request.get(`${BASE}/api/assets?pageSize=100`); const b = await r.json().catch(() => ({}))
  const rows = b?.data?.items ?? b?.data ?? b?.items ?? []
  log('sup.in GET /api/assets', r.status(), 'rows', Array.isArray(rows) ? rows.length : JSON.stringify(b).slice(0, 300), Array.isArray(rows) ? rows.map(x => x.caseRef ?? x.contractNo ?? x.id).join(',') : '')
})
await probe('uat.agent.in1', async p => { await p.goto(`${BASE}/warehouse`); await settle(p); log('in1 /warehouse →', p.url(), (await mainText(p, 300))); await shot(p, R, '04-in1-warehouse-denied') })
log('fingerprint same?', before === fp())
log('access_denied since', q(`select u.username, a.target_type, a.action, count(*) from audit_logs a left join users u on u.id=a.actor_id where a.created_at > '${T}' and a.action<>'login' group by 1,2,3 order by 1`))
// R13.05
const T5 = new Date().toISOString()
const { browser, page } = await openAs('uat.exec')
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /ส่งมอบแล้ว/ }).click(); await settle(page); await sleep(800)
log('exec lots buttons', (await page.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean))
await page.getByRole('button', { name: 'เอกสาร' }).first().click(); await sleep(1200)
const dlg = page.getByRole('dialog').last()
log('exec doc dialog', (await dlg.innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | ').slice(0, 800))
log('dialog buttons', (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map(x => x.trim()))
await shot(page, R, '05-exec-lot-docs')
mkdirSync('uat/fixtures/downloads-R13', { recursive: true })
for (const re of [/PDF|ใบส่งมอบ/, /Excel/]) {
  const b = dlg.getByRole('button', { name: re }).or(dlg.getByRole('link', { name: re })).first()
  if (!(await b.count())) { log('no button', re); continue }
  try {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), b.click()])
    const pth = `uat/fixtures/downloads-R13/${d.suggestedFilename()}`; await d.saveAs(pth); log('downloaded', pth)
  } catch (e) { log('download fail', re, e.message.slice(0, 150)) }
}
const c = await page.request.patch(`${BASE}/api/handover-lots/${LOT3}/confirm`, { data: {}, failOnStatusCode: false })
log('exec PATCH confirm LOT3', c.status(), (await c.text()).slice(0, 200))
await browser.close()
log('audit since T5', q(`select u.username,a.action,a.target_type,count(*) from audit_logs a left join users u on u.id=a.actor_id where a.created_at > '${T5}' and a.action<>'login' group by 1,2,3`))
log('fingerprint same after exec?', before === fp())
