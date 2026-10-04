import { openAs, shot, R, log, settle, sleep, mainText, dlgText, BASE } from './_h.mjs'
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance?tab=adjustment`); await settle(p); await sleep(1200)
console.log('main', await mainText(p, 1500))
await shot(p, R, '20a-finance-adjustment-empty', { fullPage: true })
await p.getByRole('button', { name: /สร้าง Adjustment/ }).first().click(); await sleep(900)
const d = p.locator('[role="dialog"]').last()
console.log('dlg', await dlgText(p, 2000))
console.log(await d.evaluate(el => [...el.querySelectorAll('input,select,textarea,button,[role=combobox],[role=radio]')].map(x => `${x.tagName}|${x.getAttribute('type')}|${x.getAttribute('name')}|${x.id}|${x.getAttribute('placeholder')}|${x.getAttribute('aria-label')}|${(x.innerText||'').slice(0,40)}|${x.tagName==='SELECT'?[...x.options].map(o=>o.value+':'+o.text).join(','):''}`).join('\n')))
await f.browser.close()
