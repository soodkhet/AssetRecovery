// เทียบฟอนต์ (localhost เท่านั้น · อ่านอย่างเดียว) — ฉีด CSS ทับ --font-sans ทีละแบบ แล้วถ่าย 3 หน้า
import { mkdirSync } from 'node:fs'
import { openAs, BASE, IS_LOCAL } from '../lib.mjs'
if (!IS_LOCAL) throw new Error('local only')
const OUT = process.env.SHOT_DIR
mkdirSync(OUT, { recursive: true })
const FONTS = [
  { key: '1-current-noto', label: 'ปัจจุบัน: Inter + Noto Sans Thai', css: null },
  { key: '2-system', label: 'ฟอนต์ของเครื่อง (แบบ Report-System)', css: "ui-sans-serif, system-ui, sans-serif" },
  { key: '3-sarabun', label: 'Sarabun', gf: 'Sarabun:wght@400;500;600;700', css: "var(--font-inter), 'Sarabun', sans-serif" },
  { key: '4-ibmplex', label: 'IBM Plex Sans Thai', gf: 'IBM+Plex+Sans+Thai:wght@400;500;600;700', css: "var(--font-inter), 'IBM Plex Sans Thai', sans-serif" },
  { key: '5-anuphan', label: 'Anuphan', gf: 'Anuphan:wght@400;500;600;700', css: "var(--font-inter), 'Anuphan', sans-serif" },
  { key: '6-prompt', label: 'Prompt', gf: 'Prompt:wght@400;500;600;700', css: "var(--font-inter), 'Prompt', sans-serif" },
]
// crop = ส่วนที่ถ่าย (ซูม 2 เท่า) — อ่านตัวหนังสือได้ชัดเมื่อแสดงเต็มความกว้าง
const PAGES = [
  { key: 'a-dashboard', persona: 'uat.finance', path: '/dashboard', crop: (p) => p.locator('section, div.rounded-xl', { hasText: 'งานรอดำเนินการของฉัน' }).last() },
  { key: 'b-advances', persona: 'uat.finance', path: '/finance?tab=advances', crop: (p) => p.locator('tr', { hasText: 'ADV-2569-0004' }).first() },
  { key: 'd-table-head', persona: 'uat.finance', path: '/finance?tab=advances', crop: (p) => p.locator('table').first(), clipHeight: 420 },
  { key: 'c-field', persona: 'uat.agent.out1', path: '/field', mobile: true, crop: null },
]
const report = []
for (const pg of PAGES.filter((x) => !process.env.ONLY || x.key === process.env.ONLY)) {
  const s = await openAs(pg.persona, { mobile: pg.mobile })
  if (!pg.mobile) {
    const cdp0 = await s.context.newCDPSession(s.page)
    await cdp0.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  }
  await s.context.route('**/api/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()))
  for (const f of FONTS) {
    await s.page.goto(`${BASE}${pg.path}`)
    await s.page.waitForLoadState('networkidle').catch(() => {})
    if (f.gf) await s.page.addStyleTag({ url: `https://fonts.googleapis.com/css2?family=${f.gf}&display=block` })
    if (f.css) await s.page.addStyleTag({ content: `:root{--font-sans:${f.css} !important} html,body{font-family:${f.css} !important}` })
    if (f.gf) {
      const fam = decodeURIComponent(f.gf.split(':')[0]).replace(/\+/g, ' ')
      await s.page.evaluate(async (fam) => { await Promise.all([400, 600].map((w) => document.fonts.load(`${w} 16px '${fam}'`, 'กขค'))) }, fam)
    }
    await s.page.evaluate(() => document.fonts.ready)
    await s.page.waitForTimeout(1200)
    const el = pg.crop?.(s.page)
    if (el) await el.scrollIntoViewIfNeeded()
    if (!el) {
      await s.page.screenshot({ path: `${OUT}/${pg.key}__${f.key}.png` })
    } else if (pg.clipHeight) {
      const box = await el.boundingBox()
      await s.page.screenshot({ path: `${OUT}/${pg.key}__${f.key}.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, pg.clipHeight) } })
    } else {
      await el.screenshot({ path: `${OUT}/${pg.key}__${f.key}.png` })
    }
    // ฟอนต์ที่ใช้วาดอักษรไทยจริง
    const cdp = await s.context.newCDPSession(s.page)
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    await s.page.evaluate(() => { const el = [...document.querySelectorAll('h1,h2,h3,p,span,td,button,a')].find((e) => /[\u0E00-\u0E7F]{3}/.test(e.textContent ?? '') && e.children.length === 0); el?.setAttribute('data-fp', '1') })
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-fp]' })
    const fonts = nodeId ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map((x) => x.familyName) : []
    report.push(`${pg.key} ${f.key}: ${fonts.join(', ')}`)
    await cdp.detach()
  }
  await s.browser.close()
}
console.log(report.join('\n'))
