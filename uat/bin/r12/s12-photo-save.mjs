import { sess, ID } from './_h.mjs'
import { writeFileSync } from 'node:fs'
const c = await sess('uat.co2.admin'); const r = await c.get(`/api/portal/assets/${ID.AS5}/photos/0`); writeFileSync('uat/fixtures/downloads-R12/admin-co2-UAT-CO2-005-photo0.png', await r.body()); console.log(r.status(), r.headers()['content-type'])
