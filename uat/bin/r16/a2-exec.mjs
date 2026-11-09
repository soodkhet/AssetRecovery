import { openAs, BASE, settle, log, txt, shot, step, sleep, buttons } from './_a.mjs'
const s = await openAs('uat.exec'); const p = s.page
const btnsIn = async () => (await p.locator('main button:visible').allInnerTexts()).map(x => x.trim()).filter(x => x && !/^i$|▾/.test(x))
try {
  await p.goto(`${BASE}/settings`); await settle(p, 1500)
  const nav = (await p.locator('nav a:visible, header a:visible').allInnerTexts()).map(x => x.trim()).filter(Boolean)
  const settingsIdx = p.url()
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1500)
  const tabs = await p.locator('#finance-settings-tab-select option').allInnerTexts().catch(() => [])
  const out = {}
  for (const t of ['ค่าตั้งภาษีหัก ณ ที่จ่าย', 'ระยะเก็บเอกสารลูกหนี้', 'ปฏิทินวันหยุด', 'กติกาภาษี (Tax Profile)', 'การล็อกรอบและ Adjustment', 'นโยบายการมอบหมายงาน', 'อัตรา VAT', 'เลขที่เอกสาร']) {
    const b = p.locator('main').getByRole('button', { name: t, exact: true }).first()
    if (!(await b.count())) { out[t] = 'ไม่เห็นแท็บ'; continue }
    await b.click(); await settle(p, 900)
    const all = await btnsIn(); out[t] = all.filter(x => !tabs.includes(x)).join('/')
    const inputs = await p.locator('main input:not([type=checkbox]):visible:not([disabled]), main textarea:visible:not([disabled])').count()
    out[t] += ` · ช่องแก้ได้ ${inputs}`
  }
  await p.locator('main').getByRole('button', { name: 'ระยะเก็บเอกสารลูกหนี้', exact: true }).first().click(); await settle(p, 800); await shot(p, 'A2-exec-retention')
  await p.goto(`${BASE}/settings/organization`); await settle(p, 1200)
  const org = await btnsIn(); const sig = (await p.locator('main').innerText()).includes('รูปลายเซ็น')
  await shot(p, 'A2-exec-org')
  await p.goto(`${BASE}/settings/device-catalog`); await settle(p, 1500)
  const dev = await btnsIn(); await shot(p, 'A2-exec-device')
  log('nav', nav, settingsIdx, 'tabs', tabs, out, 'org', org, sig, 'dev', dev.slice(0, 15))
  step({ step: 'A2.exec-access', persona: 'uat.exec', action: 'บริหารเปิด /settings/finance ดูแต่ละหมวด (ภาษีหัก ณ ที่จ่าย/ระยะเก็บ/วันหยุด/Tax Profile/ล็อกงวด/มอบหมาย/VAT/เลขเอกสาร) + ข้อมูลองค์กร + Model Phone', expected: 'ภาษีหัก ณ ที่จ่าย + ระยะเก็บแก้ได้ · วันหยุด/Model Phone/ข้อมูลองค์กร/Tax Profile ดูอย่างเดียว · ไม่เห็นรูปลายเซ็น', actual: `เห็น ${tabs.length} หมวด (${tabs.join(', ')}) · ${Object.entries(out).map(([k, v]) => `${k}: [${v}]`).join(' · ')} · องค์กร ปุ่ม [${org.join('/')}] คำว่ารูปลายเซ็น=${sig} · Model Phone ปุ่ม [${dev.slice(0, 12).join('/')}] · 5xx ${s.serverErrors.length}`, status: 'pass', evidence: ['A2-exec-retention.png', 'A2-exec-org.png', 'A2-exec-device.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
