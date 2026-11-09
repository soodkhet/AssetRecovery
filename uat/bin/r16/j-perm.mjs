// ช่วง J รอบ 6 — เมทริกซ์สิทธิ์ต่อ persona (อ่าน + write เชิงลบด้วย body ว่าง/id สุ่ม) · จองล็อก persona ก่อน openAs
import { openAs, BASE } from '../lib.mjs'
import { E } from '../r10v3/endpoints.mjs'
import { mkdirSync, rmdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const SP = '/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6'
const ORDER = ['superadmin', 'uat.admin', 'uat.approver', 'uat.finance', 'uat.account', 'uat.exec', 'uat.mgr.in', 'uat.sup.in', 'uat.agent.in1', 'uat.agent.in2', 'uat.mgr.out', 'uat.agent.out1', 'uat.co1.mgr', 'uat.co1.sup', 'uat.co2.admin']
const COL = { 'uat.sup.out': 'uat.sup.in', 'uat.agent.out2': 'uat.agent.out1' }
const expOf = (grid, u) => { const g = grid.replace(/\|/g, ''); return g[ORDER.indexOf(COL[u] ?? u)] }
const PAGES = ['/dashboard', '/cases', '/cases/submit', '/cases/assign', '/field', '/field/income', '/warehouse', '/finance', '/finance?tab=payout', '/finance?tab=approval', '/accounting', '/accounting?tab=closing', '/reports', '/reports/gross-profit', '/reports/kpi-summary', '/reports/wht-summary', '/reports/success-rate', '/settings/users', '/settings/roles', '/settings/companies', '/settings/finance', '/settings/teams', '/settings/audit-logs', '/settings/organization', '/settings/jobs', '/notifications', '/portal', '/portal/billing']
const R = {
  cases: ['74ce19a5-24ee-4109-931d-653b535f1ca2', 'd513ecea-62b8-4568-a074-e21c2a316b0e', 'cde08b61-3a38-48bc-ba3c-6599d73d0d57', '479ba4d6-ca43-4cd2-a04b-56090cc0d10a', 'a1d0bb2a-61ef-4261-a4cd-cb5499f1621b', '29e29c9e-49c2-4d85-9714-763e27a2c095', '15c347a3-44f5-4777-a226-792bb1e5a7e6', '816b715e-0a19-467e-bf81-a27b1d9a22c4', '10acef3e-157a-4159-a9c8-59f012a5258b', '4648987a-bc65-49dd-bf70-a79657d608de', '77045490-a8d5-45e2-8d69-1d27aa6792d0', '8f9d4bb5-12d2-4390-91c7-11d7c4bb5e78', '295f5b67-0481-40b5-ae79-99fd8f1a7a32', '18d0065a-a888-453d-9051-3b0607232e31', '73689272-1252-4223-80d2-1a0427655135', 'c5af5ab9-fb40-4d26-8e1c-a7f2443d09b9'],
  caseTeam: { '74ce19a5': 'out', 'd513ecea': 'out', 'cde08b61': 'out', '479ba4d6': 'out', 'a1d0bb2a': 'out', '29e29c9e': 'out', '15c347a3': 'in', '816b715e': 'in', '10acef3e': 'in', '4648987a': 'in', '77045490': 'in', '8f9d4bb5': 'in' },
  lots: ['3b22c0aa-3f2e-4f7e-bcba-bacc421c4647', '629357a1-cb9c-4fee-9d26-463c7dc5ffd5', '1694237b-f379-4659-a01c-bde1487ac64d', 'a7940379-d731-4392-acaa-5a1defde888f'],
  adv: ['ac3f60d1-981f-4ec0-9a62-df80a0498fd6', '0cd5986c-0550-4f38-8725-24c8e221c6c5', '72df86dd-ca50-4e07-9827-26b8a988efb3'],
  pb: ['e77278a7-2056-4f43-a6f3-8fe440bd226b', '1c77d118-4e79-47cb-9f27-68e886ea32d6', 'db7167f8-35a8-4142-8cef-1c95214cfa13', '8983058b-612b-4895-bfe9-50dd6f35d126'],
  bl: ['e1f75fbf-53c1-4648-b2f6-bac6f6c5cb2e', '89288c00-45ad-484d-b170-0ea6ccb46515', '4113ac24-dfb2-465b-8897-0d6366935f34'],
  iv: ['84106ab2-fe96-465d-9c4c-3b3a1c66b012', '1f97651f-c45e-45c0-9585-197e7c85ec3f', '105b13a2-05e1-4ac0-b01c-3bf47cfeeaaa', '313d950b-e26b-4e07-99d4-92e273b5eb9c'],
  wht: ['cc6583cc-d2b1-4d42-8f9d-16e1596b927a', '6bd34930-2cf3-4fbf-8b63-5a6224e51f6a', 'a8636777-1796-4d43-b94e-d4d78cdc6c2f'],
  exp: ['9cc8f3f2-db75-4b37-926d-3f4db09b902d', '0cac73e3-029c-45ca-80e8-208f376edcbc', '4e8d241f-30b3-4856-be04-a03f69350da4'],
}
const personas = process.argv.slice(2)
for (const u of personas) {
  const lock = `${SP}/locks/${u}`
  for (;;) { try { mkdirSync(lock); break } catch { await new Promise(r => setTimeout(r, 5000)) } }
  const out = { persona: u, at: new Date().toISOString(), menu: null, pages: [], api: [], real: [], errors: [] }
  let s
  try {
    s = await openAs(u)
    const { page, context } = s
    const call = async (method, url, body) => {
      const opt = { timeout: 45000, maxRedirects: 0 }
      if (body !== undefined) { opt.data = body; opt.headers = { 'content-type': 'application/json' } }
      try { const r = await context.request.fetch(BASE + url, { ...opt, method }); let t = ''; try { t = (await r.text()).slice(0, 160) } catch {} ; return { st: r.status(), t } } catch (e) { return { st: 'ERR', t: String(e.message).slice(0, 100) } }
    }
    const m = await call('GET', '/api/meta/menu'); out.menu = m.t.length ? (await (await context.request.get(BASE + '/api/meta/menu')).text()).slice(0, 4000) : m.st
    for (const p of PAGES) {
      const t0 = Date.now(); let st = null
      try { const r = await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 }); st = r?.status() } catch (e) { st = 'ERR' }
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(300)
      const fin = page.url().replace(BASE, ''); const tx = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
      const deny = (tx.match(/.{0,20}(ไม่มีสิทธิ์|ไม่พบหน้า|ไม่พบข้อมูลที่ต้องการ).{0,40}/) ?? [''])[0]
      out.pages.push({ p, st, fin, ms: Date.now() - t0, deny, h1: (await page.locator('h1').first().innerText().catch(() => '')).slice(0, 50) })
    }
    for (const [id, method, path, grid, opt] of E) {
      const url = path.replace(/\{R\}/g, () => randomUUID())
      const body = method === 'GET' ? undefined : (opt?.body ?? {})
      const r = await call(method, url, body)
      out.api.push({ id, method, url: path, exp: expOf(grid, u), st: r.st, t: r.t.slice(0, 120) })
    }
    // id จริง — GET
    for (const c of R.cases) out.real.push({ k: 'case', team: R.caseTeam[c.slice(0, 8)] ?? '-', url: `/api/cases/${c}`, ...(await call('GET', `/api/cases/${c}`)) })
    for (const c of R.cases.slice(0, 12)) out.real.push({ k: 'fieldcase', team: R.caseTeam[c.slice(0, 8)], url: `/api/field/cases/${c}`, ...(await call('GET', `/api/field/cases/${c}`)) })
    for (const x of R.lots) out.real.push({ k: 'lot', url: `/api/handover-lots/${x}`, ...(await call('GET', `/api/handover-lots/${x}`)) })
    for (const x of R.adv) { out.real.push({ k: 'adv', url: `/api/advances/${x}`, ...(await call('GET', `/api/advances/${x}`)) }); out.real.push({ k: 'advpdf', url: `/api/advances/${x}/pdf`, ...(await call('GET', `/api/advances/${x}/pdf`)) }) }
    for (const x of R.pb) out.real.push({ k: 'pb', url: `/api/payout-batches/${x}`, ...(await call('GET', `/api/payout-batches/${x}`)) })
    for (const x of R.bl) out.real.push({ k: 'bl', url: `/api/billing-batches/${x}`, ...(await call('GET', `/api/billing-batches/${x}`)) })
    for (const x of R.iv) out.real.push({ k: 'ivpdf', url: `/api/accounting/tax-invoices/${x}/pdf`, ...(await call('GET', `/api/accounting/tax-invoices/${x}/pdf`)) })
    for (const x of R.wht) out.real.push({ k: 'whtpdf', url: `/api/accounting/wht-certificates/${x}/pdf`, ...(await call('GET', `/api/accounting/wht-certificates/${x}/pdf`)) })
    for (const x of R.exp) out.real.push({ k: 'claim', url: `/api/claims/${x}`, ...(await call('GET', `/api/claims/${x}`)) })
    // id จริง — write เฉพาะ role ที่ grid บอกว่าไม่มีสิทธิ์ (กันผลจริง) · body ว่าง
    const W = Object.fromEntries(E.map(e => [e[0], e]))
    const realW = [['W08', 'PATCH', `/api/claims/${R.exp[0]}/approve`], ['W02', 'PATCH', `/api/cases/${R.cases[9]}/status`], ['W03', 'POST', `/api/cases/${R.cases[14]}/assign`], ['W07', 'PATCH', `/api/handover-lots/${R.lots[0]}/confirm`], ['W11', 'PATCH', `/api/advances/${R.adv[0]}/approve`], ['W13', 'POST', `/api/payout-batches/${R.pb[0]}/generate-payment-file`], ['W17', 'PATCH', `/api/accounting/wht-certificates/${R.wht[0]}/cancel`], ['W05', 'POST', `/api/field/cases/${R.cases[9]}/checkin`]]
    for (const [wid, method, url] of realW) {
      const e = expOf(W[wid][3], u)
      if (e !== 'D' && e !== 'N') { out.real.push({ k: 'write-skip(allowed)', wid, url }); continue }
      out.real.push({ k: 'write', wid, exp: e, url, ...(await call(method, url, {})) })
    }
    out.consoleErrors = s.consoleErrors.slice(0, 10); out.serverErrors = s.serverErrors.slice(0, 10)
  } catch (e) { out.errors.push(String(e.message ?? e).slice(0, 300)) }
  finally { try { await s?.browser.close() } catch {} ; try { rmdirSync(lock) } catch {} }
  writeFileSync(`${SP}/J/raw/perm-${u}.json`, JSON.stringify(out, null, 1))
  const bad = out.api.filter(a => (a.exp === 'D' || a.exp === 'N') && typeof a.st === 'number' && a.st < 300)
  const st5 = [...out.api, ...out.real].filter(a => a.st === 'ERR' || a.st >= 500)
  console.log(u, 'pages', out.pages.length, 'api', out.api.length, 'real', out.real.length, 'deniedBut2xx', bad.length, '5xx', st5.length, out.errors.join(' '))
}
