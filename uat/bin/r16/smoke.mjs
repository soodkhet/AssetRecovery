import { openAs } from './lib.mjs'
const users = ['superadmin','uat.admin','uat.approver','uat.finance','uat.account','uat.exec','uat.mgr.in','uat.sup.in','uat.agent.in1','uat.agent.in2','uat.mgr.out','uat.sup.out','uat.agent.out1','uat.agent.out2']
for (const u of users) {
  try {
    const s = await openAs(u, { mobile: u.includes('agent') })
    await s.page.waitForLoadState('networkidle').catch(()=>{})
    const h = (await s.page.locator('h1').first().innerText().catch(()=>'')).slice(0,40)
    await s.page.screenshot({ path: `${process.env.SP}/smoke-${u}.png` })
    console.log(u.padEnd(15), new URL(s.page.url()).pathname, '|', h, '| 5xx', s.serverErrors.length, '| console', s.consoleErrors.length)
    await s.browser.close()
  } catch (e) { console.log(u.padEnd(15), 'ERR', e.message.slice(0,120)) }
}
