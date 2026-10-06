import { openAs, log, post } from './_h.mjs'
const { browser, page } = await openAs('uat.finance')
log('generate-payment-file:', await post(page, '/api/payout-batches/4b234a2e-5c73-4504-8cbe-fc5611166a77/generate-payment-file', { bankAccountId: 'c30800c4-52c6-431a-a357-b073cf077b89', bankFileFormatId: 'add7ece2-24bc-4166-bbf5-2f6c4b1702d7', confirmDuplicate: false, reason: 'UAT R15b probe สร้างไฟล์โอน' }, 400))
await browser.close()
