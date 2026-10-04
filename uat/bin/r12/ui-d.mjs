import { chromium } from '@playwright/test'
import { shot, BASE } from '../lib.mjs'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: 'uat/.auth/uat.co1.mgr.json' })
const p = await ctx.newPage(); await p.goto(BASE + '/portal'); await p.waitForLoadState('networkidle'); await p.mouse.move(5, 880); await p.waitForTimeout(4000)
const bars = await p.evaluate(() => [...document.querySelectorAll('.recharts-bar-rectangle path, .recharts-rectangle')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.height), e.getAttribute('fill')] }))
const tip = await p.evaluate(() => document.querySelector('.recharts-tooltip-wrapper')?.getAttribute('style')?.includes('visibility: visible'))
console.log(JSON.stringify({ bars, tip }))
await shot(p, 'R12', '02-mgr-overview', { fullPage: true }); await browser.close()
