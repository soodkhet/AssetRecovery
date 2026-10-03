// R5.04 probe API intake/reject (ล้มก่อนทรานแซกชันทุกตัว)
import { openAs, log, q, api, guard2xx, A, RND, SQL } from './_h.mjs'
const { browser, page } = await openAs('uat.admin')
log('=== s04', new Date().toISOString())
const B = { imeiActual: '356789100000011', condition: 'normal', photos: [] }
const P = `/api/assets/${A.C1}/intake`
const cases = [
  ['a', P, { ...B, imeiActual: '35678910000001' }],
  ['b', P, { ...B, imeiActual: '356789-100000011' }],
  ['c', P, { ...B, condition: null }],
  ['d', P, { ...B, condition: 'damaged', conditionNote: '' }],
  ['e', P, { ...B, photos: [`assets/${A.C2}/intake/front/x.png`] }],
  ['f', P, { ...B, photos: [`assets/${A.C1}/intake/front/nope.png`] }],
  ['g', P, { ...B, imeiActual: ' 356789100000011', condition: null }],
  ['h', P, { ...B, imeiActual: null, condition: null }],
  ['i', `/api/assets/${A.C1}/reject-intake`, { rejectReason: '   ' }],
  ['j', `/api/assets/${RND}/intake`, B],
]
for (const [k, path, body] of cases) {
  const r = await api(page, 'POST', path, body)
  log(`R5.04 ${k}:`, r)
  guard2xx(`R5.04 ${k}`, r)
}
await browser.close()
log(q(`select case_ref,asset_status,imei_actual,condition from assets where id='${A.C1}'`))
log(q(SQL.audit))
