import { createHash } from 'node:crypto'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import type { ExpenseType } from '@/lib/generated/prisma/enums'
import { expenseApprovalRequestedMessage, type NotificationMessage } from '@/lib/notifications/messages'
import type { RecipientScope } from '@/lib/notifications/recipients'
import type { ApproverColumn } from '@/lib/settings/approval-matrix'

/**
 * แผนการแจ้งเตือน "รายการเบิกรออนุมัติ" — **pure ล้วน** (มติ PO 05/10/2569 U29 · BUG-106)
 *
 * รับรายการที่ resolve ขั้น/capability มาแล้ว (ชั้น DB อยู่ `approval-queue.ts`) แล้วตัดสินว่า
 * "ใครควรได้ข้อความอะไร" — แยกออกมาเพื่อเทสต์การจัดกลุ่ม/scope/คีย์กันซ้ำได้โดยไม่ต้องมี DB
 *
 * ### การจัดกลุ่ม
 * มติ U29 เลือก "แจ้งทันทีทุกรายการ" (ไม่ใช่สรุปรายวัน) ⇒ ทุกเหตุการณ์ที่ทำให้รายการเข้าคิวแจ้งทันที
 * แต่เหตุการณ์เดียวที่สร้างหลายแถวพร้อมกัน (ปิดงาน = ค่าน้ำมัน + เบี้ยเสี่ยง · job รายวัน = น้ำมัน + เบี้ยเลี้ยง
 * · ยืนยันล็อตปลดหลายเคส) รวมเป็น **1 ข้อความต่อ (ผู้ขอ × ขั้น × ผู้รับชุดเดียวกัน)** พร้อมจำนวน + ยอดรวม
 * — ไม่ให้ผู้จัดการได้ 40 ใบจากการกดยืนยันล็อตครั้งเดียว
 *
 * ### scope ของผู้รับ (มติ R6-A/R6-B · UAT Q17)
 * - ขั้นผู้จัดการ = ผู้จัดการ/หัวหน้าของ **ทีมของรายการ** (ทีมของงาน · ไม่ผูกงาน = ทีมของผู้เบิก)
 * - ขั้นการเงิน/บริหาร = ระดับองค์กร (คิวของสองขั้นนี้เห็นทั้งองค์กรอยู่แล้ว)
 */

export interface ExpenseQueueItem {
  id: string
  expenseType: ExpenseType
  grossSatang: number
  caseRef: string | null
  /** ผู้ใช้เจ้าของ payee — ผู้ขอ (ไม่รับแจ้งเตือนของรายการตัวเอง) */
  requesterUserId: string
  requesterName: string
  /** ทีมของรายการ: ทีมของงาน ถ้าไม่ผูกงาน = ทีมของผู้เบิก */
  teamId: string | null
  step: number
  totalSteps: number
  column: ApproverColumn
  capability: string
  /** จำนวนแถวใน `approval_history` — แยก "รอบ" ของขั้นเดียวกัน (ส่งใหม่หลังตีกลับ = คีย์ใหม่) */
  historyLength: number
  /** ผู้ที่ไม่ต้องได้รับ (ผู้ขอ · ผู้บันทึกแทน · ผู้อนุมัติขั้นก่อนเมื่อบังคับแบ่งแยกหน้าที่) */
  excludeUserIds: readonly string[]
}

export interface ApprovalNotice {
  capability: string
  scope: RecipientScope
  excludeUserIds: readonly string[]
  message: NotificationMessage
}

/**
 * ขั้นผู้จัดการเท่านั้นที่ผูกทีม — ขั้นอื่นเป็นเรื่องระดับองค์กร (`{}` = `ORGANIZATION_SCOPE` · ไม่ import ค่าจริง
 * เพราะ `recipients.ts` ดึง Prisma เข้ามา — ไฟล์นี้ต้อง pure)
 */
export function expenseNoticeScope(column: ApproverColumn, teamId: string | null): RecipientScope {
  return column === 'manager' ? { teamId } : {}
}

/**
 * คีย์กันซ้ำของกลุ่ม — สร้างจาก (id, ขั้น, ความยาว history) ของทุกแถว **ไม่มีเวลาปัจจุบัน**
 * ⇒ event เดิมส่งซ้ำ (retry/duplicate delivery/job รันซ้ำ) ได้คีย์เดิม = ไม่แจ้งซ้ำ ·
 * รายการเดิมขยับขั้นหรือส่งใหม่หลังตีกลับ = คีย์ใหม่ = แจ้งได้อีกครั้งตามจริง
 */
export function expenseNoticeDedupeKey(items: readonly Pick<ExpenseQueueItem, 'id' | 'step' | 'historyLength'>[]): string {
  const parts = items.map((item) => `${item.id}:s${item.step}:h${item.historyLength}`).sort()
  const digest = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)
  return `expense-approval-${digest}`
}

export function planExpenseApprovalNotices(items: readonly ExpenseQueueItem[]): ApprovalNotice[] {
  const groups = new Map<string, ExpenseQueueItem[]>()
  for (const item of items) {
    const scopeTeam = item.column === 'manager' ? (item.teamId ?? '-') : '*'
    const excluded = [...new Set(item.excludeUserIds)].sort().join(',')
    const key = [item.requesterUserId, item.capability, item.step, item.totalSteps, scopeTeam, excluded].join('|')
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [item])
    else group.push(item)
  }

  const notices: ApprovalNotice[] = []
  for (const group of groups.values()) {
    const first = group[0]
    if (first === undefined) continue
    const typeLabels = [...new Set(group.map((item) => EXPENSE_TYPE_LABEL[item.expenseType]))]
    const caseRefs = [...new Set(group.flatMap((item) => (item.caseRef === null ? [] : [item.caseRef])))]
    notices.push({
      capability: first.capability,
      scope: expenseNoticeScope(first.column, first.teamId),
      excludeUserIds: [...new Set(first.excludeUserIds)],
      message: expenseApprovalRequestedMessage({
        typeLabels,
        requesterName: first.requesterName,
        count: group.length,
        totalSatang: group.reduce((sum, item) => sum + item.grossSatang, 0),
        step: first.step,
        totalSteps: first.totalSteps,
        caseRefs,
        dedupeKey: expenseNoticeDedupeKey(group),
      }),
    })
  }
  return notices
}
