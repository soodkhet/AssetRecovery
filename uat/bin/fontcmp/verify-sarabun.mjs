// localhost — หลังเปลี่ยนเป็น Sarabun: ฟอนต์ที่วาดจริง + หน้าเลื่อนแนวนอน (ล้นจอ) หลายหน้า/หลาย role · อ่านอย่างเดียว
import { mkdirSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR; mkdirSync(OUT, { recursive: true })
const PLAN = [
  ['uat.finance', false, ['/dashboard', '/finance?tab=advances', '/finance?tab=payouts', '/finance?tab=revenue', '/accounting']],
  ['uat.admin', false, ['/cases', '/settings/companies', '/settings', '/warehouse', '/reports']],
  ['uat.agent.out1', true, ['/field', '/field/advances', '/field/expenses']],
  ['uat.co1.mgr', true, ['/portal']],
]
const rows = []
for (const [persona, mobile, paths] of PLAN) {
  const s = await openAs(persona, { mobile })
  await s.context.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  for (const path of paths) {
    await s.page.goto(`${BASE}${path}`); await s.page.waitForLoadState('networkidle').catch(() => {}); await s.page.waitForTimeout(800)
    const info = await s.page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, family: getComputedStyle(document.body).fontFamily.slice(0, 60), thaiLoaded: document.fonts.check("16px Sarabun", "ก") || [...document.fonts].some((f) => /sarabun/i.test(f.family) && f.status === 'loaded') }))
    const cdp = await s.context.newCDPSession(s.page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    await s.page.evaluate(() => { const el = [...document.querySelectorAll('h1,h2,h3,p,span,td,button,a,label')].find((e) => /[฀-๿]{3}/.test(e.textContent ?? '') && e.children.length === 0 && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'); el?.setAttribute('data-fp', '1') })
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-fp]' })
    const fonts = nodeId ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map((x) => x.familyName).join('+') : '-'
    await cdp.detach()
    await s.page.screenshot({ path: `${OUT}/${persona}${path.replace(/[/?=&]/g, '_')}.png` })
    rows.push({ persona, path, rendered: fonts, overflowX: info.overflowX, url: new URL(s.page.url()).pathname })
  }
  rows.push({ persona, console: s.consoleErrors.slice(0, 3), server: s.serverErrors.slice(0, 3) })
  await s.browser.close()
}
console.log(JSON.stringify(rows, null, 1))
