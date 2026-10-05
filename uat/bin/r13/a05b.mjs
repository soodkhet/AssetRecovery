// R13.05 ต่อ — บริหารเปิดรายละเอียด LOT-2569-003 แล้วดาวน์โหลด PDF/Excel
import { openAs, shot, log, settle, sleep, R, q, BASE } from './_h.mjs'
const T5 = new Date().toISOString()
const { browser, page } = await openAs('uat.exec')
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /ส่งมอบแล้ว/ }).click(); await settle(page); await sleep(800)
const card = page.locator('div', { hasText: 'LOT-2569-003' }).filter({ has: page.getByRole('button', { name: 'ดูรายการ' }) }).last()
await card.getByRole('button', { name: 'ดูรายการ' }).click(); await sleep(1500)
const dlg = page.locator('main')
log('detail', (await dlg.innerText().catch(() => page.locator('main').innerText())).replace(/\s*\n+\s*/g, ' | ').slice(0, 1200))
const btns = (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map(x => x.trim())
const links = (await dlg.getByRole('link').allInnerTexts().catch(() => [])).map(x => x.trim())
log('buttons', btns, 'links', links)
await shot(page, R, '05-exec-lot3-detail')
for (const re of [/PDF/i, /Excel/i]) {
  const b = dlg.getByRole('button', { name: re }).or(dlg.getByRole('link', { name: re })).first()
  if (!(await b.count())) { log('no button', String(re)); continue }
  try {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), b.click()])
    const pth = `uat/fixtures/downloads-R13/${d.suggestedFilename()}`; await d.saveAs(pth); log('downloaded', pth)
  } catch (e) { log('download fail', String(re), e.message.slice(0, 150)) }
}
await browser.close()
log('audit since T5', q(`select u.username,a.action,a.target_type,count(*) from audit_logs a left join users u on u.id=a.actor_id where a.created_at > '${T5}' and a.action<>'login' group by 1,2,3`))
