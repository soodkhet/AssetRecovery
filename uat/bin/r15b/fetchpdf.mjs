// node uat/bin/r15b/fetchpdf.mjs <user> <apiPath> <outName>  → บันทึก PDF ลง DL
import { writeFileSync } from 'node:fs'
import { openAs, BASE, log, DL } from './_h.mjs'
const [user, path, name] = process.argv.slice(2)
const { browser, page } = await openAs(user)
const r = await page.request.get(`${BASE}${path}`, { failOnStatusCode: false })
const ct = r.headers()['content-type'], cd = r.headers()['content-disposition']
if (r.status() === 200 && ct?.includes('pdf')) { writeFileSync(`${DL}/${name}.pdf`, await r.body()); log('PDF', user, path, r.status(), cd, `${DL}/${name}.pdf`) }
else log('PDF FAIL', user, path, r.status(), ct, (await r.text()).slice(0, 400))
await browser.close()
