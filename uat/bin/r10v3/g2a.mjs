import { openAs, shot, BASE } from '../lib.mjs'
const o = await openAs('uat.admin'); await o.page.goto(BASE + '/cases/submit'); await o.page.waitForLoadState('networkidle')
console.log((await o.page.getByRole('button').allInnerTexts()).join(' | '))
await o.browser.close()
