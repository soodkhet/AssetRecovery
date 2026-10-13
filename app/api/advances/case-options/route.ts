import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listAdvanceCaseOptions, REQUEST_ADVANCE } from '@/lib/advances/queries'

/**
 * `GET /api/advances/case-options` (mytester DO-07 · `15` §8/§14 · `27` §6.4) — ตัวเลือกช่อง "อ้างอิงเคส (ไม่บังคับ)"
 * ของฟอร์มขอเงินทดรอง = เคสที่ผู้เรียกรับผิดชอบอยู่ (งานค้างของตัวเองเท่านั้น)
 *
 * สิทธิ์ = `manage:request_advance` (ผู้ขอให้ตัวเอง) · ขอแทนผู้อื่นไม่มีตัวเลือกเคส (ฟอร์มซ่อนช่อง) แต่ `POST /api/advances`
 * ยังตรวจ `caseId` กับผู้รับเงินซ้ำทุกครั้ง — UI คัดตัวเลือกเป็นแค่ UX
 */
export const GET = withApiPermission('manage', REQUEST_ADVANCE, toModuleErrorResponse, async (_request, _context: unknown, user) =>
  apiSuccess(await listAdvanceCaseOptions(user)),
)
