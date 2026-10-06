// R15b ตรวจเนื้อหา PDF ใบรับรองแทนใบเสร็จนอก Next (BUG-172 ทำให้ route 500) — ใช้ฟังก์ชันชุดเดียวกับ route · อ่านอย่างเดียว ไม่ลง audit
import { writeFileSync } from 'node:fs'
import { renderSubstituteReceiptPdf } from '@/components/pdf/substitute-receipt'
import { currentLetterhead } from '@/lib/organization/letterhead'
import { getSubstituteReceiptSource, toSubstituteReceiptDocSource } from '@/lib/substitute-receipts/queries'
import { buildSubstituteReceiptDoc } from '@/lib/substitute-receipts/substitute-receipt-doc'
import type { SessionUser } from '@/lib/auth/types'
const [id, out] = process.argv.slice(2)
const user = { id: 'cf223aca-d169-42e5-8af6-a896bbb44f6a', organizationId: '00000000-0000-0000-0000-000000000001', supabaseUid: 'x', email: null, fullName: 'UAT render', status: 'active', roleId: 'x', roleName: 'Superadmin', roleGroup: 'internal', isSuperadmin: true, teamId: null, companyId: null, capabilities: {}, scope: { teamIds: [] }, loginAt: null } as unknown as SessionUser
const row = await getSubstituteReceiptSource(user, id)
const lh = await currentLetterhead(user.organizationId)
const doc = buildSubstituteReceiptDoc(toSubstituteReceiptDocSource(row), lh)
console.log(JSON.stringify(doc).slice(0, 1500))
writeFileSync(out, await renderSubstituteReceiptPdf(doc, lh))
console.log('wrote', out)
process.exit(0)
