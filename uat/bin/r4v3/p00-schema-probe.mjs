import { openAs, BASE } from '/Users/beer/AssetRecovery/uat/bin/lib.mjs'
const { browser, page } = await openAs('uat.agent.in1', { mobile: true })
for (const p of ['/api/field/expenses?type=caseBound','/api/field/income','/api/field/cases?tab=pending']) {
  const r = await page.request.get(`${BASE}${p}`); console.log(p, r.status(), (await r.text()).slice(0,300))
}
await browser.close()
