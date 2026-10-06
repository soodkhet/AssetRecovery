// ถ่ายภาพหน้าแรกของ PDF: node uat/bin/r13/_pdfshot.mjs <pdf> <png>
import { chromium } from '@playwright/test'
const [pdf, png] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=-2000,0'] })
const p = await b.newPage({ viewport: { width: 1000, height: 1300 } })
await p.goto('file://' + process.cwd() + '/' + pdf).catch(e => console.log('goto', e.message))
await p.waitForTimeout(3000)
await p.screenshot({ path: png })
await b.close()
