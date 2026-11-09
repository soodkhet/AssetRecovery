// staging — ฟอนต์ที่วาดอักษรไทยจริง (อ่านอย่างเดียว · ไม่ต้อง login ใช้หน้า /login)
import { chromium } from '@playwright/test'
import { STAGING_URL } from '../lib.mjs'
const b = await chromium.launch({ channel: 'chrome' })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto(`${STAGING_URL}/login`); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1000)
const cdp = await p.context().newCDPSession(p); await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
await p.evaluate(() => { const el = [...document.querySelectorAll('h1,h2,p,span,label,button')].find((e) => /[฀-๿]{3}/.test(e.textContent ?? '') && e.children.length === 0); el?.setAttribute('data-fp', '1') })
const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-fp]' })
const fonts = nodeId ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map((x) => x.familyName) : []
console.log(JSON.stringify({ url: p.url(), fonts }))
await p.screenshot({ path: process.env.SHOT ?? '/dev/null' })
await b.close()
