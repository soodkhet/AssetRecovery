import { withEndpoint } from '@/lib/api/http'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { getOwnPayeeSummary, type OwnPayeeSummaryDto } from '@/lib/payees/self'

/**
 * `GET /api/field/me/payee` (staging E-035 · `41` §7.12) — ข้อมูลรับเงินของผู้เรียกเอง อ่านอย่างเดียว
 * scope ตัวเองเสมอ (ไม่รับ id) · เลขบัญชี/เลขผู้เสียภาษีปิดบัง · แก้ไขต้องแจ้งการเงิน
 */
export const GET = withEndpoint<unknown, OwnPayeeSummaryDto>({
  endpoint: 'field.mePayee',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (_request, _context, user) => ({ data: await getOwnPayeeSummary(user) }),
})
