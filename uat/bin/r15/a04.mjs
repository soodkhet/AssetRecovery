// R15a.04 role อื่นเปิดหน้า ข้อมูลองค์กร: ต้องไม่เห็นปุ่มแก้ไข/อัปโหลด + PATCH/POST logo = 403
import { openAs, shot, log, settle, sleep, R, BASE, post, get, mainText } from './_h.mjs'
for (const u of ['uat.account', 'uat.exec', 'uat.finance', 'uat.admin']) {
  const { browser, page, serverErrors } = await openAs(u)
  await page.goto(`${BASE}/settings/organization`); await settle(page); await sleep(800)
  const editBtn = await page.getByRole('button', { name: 'แก้ไขข้อมูล' }).count()
  const upBtn = await page.getByRole('button', { name: /อัปโหลดโลโก้|เปลี่ยนโลโก้/ }).count()
  log(u, 'url', page.url().replace(BASE, ''), 'edit', editBtn, 'upload', upBtn, '|', await mainText(page, 220))
  await shot(page, R, `04-org-${u.replace('uat.', '')}`)
  const patch = await page.request.patch(`${BASE}/api/settings/organization`, { data: { phone: '02-111-1111', reason: 'UAT R15a ลองแก้โดยไม่มีสิทธิ์' }, failOnStatusCode: false })
  log(u, 'GET', (await get(page, '/api/settings/organization')).slice(0, 60), 'PATCH', patch.status(), (await patch.text()).slice(0, 120))
  log(u, 'POST logo', (await post(page, '/api/settings/organization/logo', { path: 'x/y.png', reason: 'UAT R15a ลองโดยไม่มีสิทธิ์' })).slice(0, 120))
  log(u, '5xx', serverErrors)
  await browser.close()
}
