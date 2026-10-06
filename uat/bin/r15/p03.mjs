// probe: upload-url สำหรับโลโก้ (ไม่อัปโหลดไฟล์จริง — ขอ URL อย่างเดียว)
import { openAs, log, BASE, post } from './_h.mjs'
const { browser, page } = await openAs('admin')
const org = '00000000-0000-0000-0000-000000000001'
log('upload-url org(seed id)', await post(page, '/api/storage/upload-url', { target: { kind: 'organization_logo', organizationId: org }, fileName: 'x.png', contentType: 'image/png', size: 1000 }))
await browser.close()
