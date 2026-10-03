import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=-2000,0'] })
const p = await b.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 3 })
await p.goto('file://' + process.cwd() + '/uat/shots/R5v2/R5.13-DLV-2569-003.pdf').catch(e => console.log('goto', e.message))
await p.waitForTimeout(3000)
await p.screenshot({ path: process.env.OUT ?? 'uat/shots/R5v2/R5.13-DLV-2569-003-pdf.png', clip: process.env.OUT ? { x: 655, y: 190, width: 300, height: 110 } : undefined })
await b.close()
