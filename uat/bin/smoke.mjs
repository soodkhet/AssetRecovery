import { openAs, shot } from './lib.mjs'
const s = await openAs('admin', { fresh: true })
await s.page.waitForLoadState('networkidle')
console.log('landed', s.page.url())
console.log('nav', (await s.page.getByRole('link').allInnerTexts()).filter(Boolean).slice(0, 15).join(' | '))
console.log('shot', await shot(s.page, 'R0', '01-after-login'))
console.log('consoleErrors', s.consoleErrors.slice(0, 5))
console.log('serverErrors', s.serverErrors)
await s.browser.close()
