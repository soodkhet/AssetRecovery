// R15b ตรวจ PDF สรุปรอบจ่ายนอก Next (BUG-172) — ฟังก์ชันชุดเดียวกับ route · อ่านอย่างเดียว ไม่ลง audit
import { writeFileSync } from 'node:fs'
import { renderPayoutBatchSummary } from '@/components/pdf/payout-batch-summary'
import { currentLetterhead } from '@/lib/organization/letterhead'
import { assertPayoutDocReady, buildPayoutSummaryDoc } from '@/lib/payout/payout-doc'
import { getPayoutDocSource } from '@/lib/payout/queries'
import type { SessionUser } from '@/lib/auth/types'
const [id, out] = process.argv.slice(2)
const user = { id: 'cf223aca-d169-42e5-8af6-a896bbb44f6a', organizationId: '00000000-0000-0000-0000-000000000001', supabaseUid: 'x', email: null, fullName: 'UAT render', status: 'active', roleId: 'x', roleName: 'Superadmin', roleGroup: 'internal', isSuperadmin: true, teamId: null, companyId: null, capabilities: {}, scope: { teamIds: [] }, loginAt: null } as unknown as SessionUser
const source = await getPayoutDocSource(user, id)
assertPayoutDocReady(source.batch.status)
writeFileSync(out, await renderPayoutBatchSummary(buildPayoutSummaryDoc(source.batch, source.issuer), await currentLetterhead(user.organizationId)))
console.log('wrote', out); process.exit(0)
