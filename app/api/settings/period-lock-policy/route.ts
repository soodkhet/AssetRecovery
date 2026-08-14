import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { PERIOD_LOCK_POLICY } from '@/lib/settings/period-lock'

/**
 * นโยบายล็อกรอบบัญชี (`13` §6.11 · §13) — **GET อย่างเดียว**
 *
 * `13` §13 ร่างไว้ว่ามี PATCH แต่ `02` **ไม่มีตารางเก็บนโยบายนี้** (ลำดับความสำคัญเอกสาร: `02`
 * ชนะ API draft) — ตารางนี้เป็นกติกาตายตัวขององค์กร แก้ = แก้สเปค `13` + โค้ดคู่กัน ไม่ใช่ค่าตั้งค่า
 * ส่วนการ "ปลดล็อกรอบ" เป็น action ของไฟล์ 30 (`POST /api/periods/:id/unlock`, Phase 4.1)
 *
 * อ่านได้ทุก role ที่เห็น master data — ตัวบังคับจริง (`assertPeriodEditable`) ต่อเข้า write endpoint
 * ของสายการเงิน/บัญชีใน Phase 4.1
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest) =>
    Response.json({
      data: {
        policy: PERIOD_LOCK_POLICY,
        /** แบนเนอร์เตือนสีเหลืองบนแท็บนี้ (`13` §7) — ข้อความเดียวกับที่ spec กำหนด */
        banner: 'เมื่อรอบบัญชีถูกรับรองส่งมอบแล้ว ห้ามแก้ source record โดยตรง',
      },
    }),
)
