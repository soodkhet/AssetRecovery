// R15b ตรวจ PDF ใบเบิกเงินทดรองนอก Next (BUG-172) — อ่านอย่างเดียว
import { writeFileSync } from 'node:fs'
import { renderAdvanceRequestPdf } from '@/components/pdf/advance-request'
import { assertAdvanceRequestPrintable, buildAdvanceRequestDoc } from '@/lib/advances/advance-doc'
import { getAdvanceRequestDocSource } from '@/lib/advances/doc-queries'
import { currentLetterhead } from '@/lib/organization/letterhead'
import type { SessionUser } from '@/lib/auth/types'
const [id, out] = process.argv.slice(2)
const user = { id: 'cf223aca-d169-42e5-8af6-a896bbb44f6a', organizationId: '00000000-0000-0000-0000-000000000001', supabaseUid: 'x', email: null, fullName: 'UAT render', status: 'active', roleId: 'x', roleName: 'Superadmin', roleGroup: 'internal', isSuperadmin: true, teamId: null, companyId: null, capabilities: {}, scope: { teamIds: [] }, loginAt: null } as unknown as SessionUser
const source = await getAdvanceRequestDocSource(user, id)
try { (assertAdvanceRequestPrintable as (s: unknown) => void)(source) } catch (e) { console.log('printable?', (e as Error).message) }
const lh = await currentLetterhead(user.organizationId)
writeFileSync(out, await renderAdvanceRequestPdf(buildAdvanceRequestDoc(source, lh), lh)); console.log('wrote', out); process.exit(0)
