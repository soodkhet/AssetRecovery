import { isDomainEvent } from '@/lib/api/events'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ทะเบียน Event ที่ "แจ้งเตือน" ได้ (`90` §6.3 — เฟส 1 = Push/In-app เท่านั้น ไม่มี gateway ภายนอก)
 *
 * ต่างกับ `lib/api/events.ts` อย่างไร: ไฟล์นั้นคือทะเบียน **domain event** ที่โมดูล emit
 * (SSOT = ไฟล์ต้นทาง `38`/`40`/`41`/`44`) ส่วนไฟล์นี้คือ **แค็ตตาล็อกการแจ้งเตือน** —
 * บอกว่า event ไหนควรเด้งหาผู้ใช้ อยู่โมดูลอะไร และแสดงด้วยสีระดับไหน (`04` §8.1)
 * ชื่อ code ต้องสะกดตรงกับทะเบียน domain event เสมอเมื่อ event นั้นมีอยู่แล้ว
 * (เทสต์ `events.test.ts` บังคับ — กันสะกดเพี้ยนแบบ `evidence.reject_evidence` ที่ `90` §6.3 เขียนไว้
 * แต่ไฟล์ต้นทาง `41` §17.2 ใช้ `case.evidence_rejected`)
 *
 * ⚠️ เฟส 5.1 สร้าง "ท่อ" (service + ศูนย์แจ้งเตือน) · **เฟส 5.2 ต่อสายเข้าโมดูลจริงครบทุกกลุ่ม**
 * — ข้อความ/ปลายทางลิงก์ของแต่ละ event อยู่ที่ `lib/notifications/messages.ts` (pure)
 * และผู้รับ + จุดเรียกอยู่ที่ `lib/notifications/dispatch.ts` · code ที่ยังไม่มีที่ให้ emit
 * (สคีมาไม่รองรับ) อยู่ใน `NOTIFICATION_ONLY_EVENTS` ด้านล่างพร้อมเหตุผล
 */

/** ระดับความสำคัญบน UI — ใช้กลุ่มสีของ `04` §8.1 ตรง ๆ ห้ามตั้งสีเอง (mockup `notifications.html` L45) */
export type NotificationLevel = Extract<StatusBadgeGroup, 'critical' | 'warning' | 'success' | 'sent'>

export interface NotificationEventContract {
  /** ป้ายโมดูลภาษาไทยบนรายการ (mockup `notifications.html` — คอลัมน์ `mod`) */
  readonly module: string
  readonly level: NotificationLevel
  /** ที่มาของ event ตามเอกสาร */
  readonly source: string
  readonly description: string
}

/**
 * เกณฑ์ระดับสี (คงเส้นคงวาทั้งระบบ — mockup ใช้ 4 ระดับนี้):
 * - `success` งานเดินหน้าจบขั้นตอนแล้ว · `sent` ข้อมูล/รอฝ่ายอื่นตอบ
 * - `warning` มีคนต้องลงมือแก้ต่อ (ตีกลับ/เลยกำหนด/ใกล้ deadline) · `critical` บล็อกงานหรือทำไม่สำเร็จ
 */
export const NOTIFICATION_EVENTS = {
  // ── Case Submission (38) — `90` §6.3 แถว 1–2 ──────────────────────────
  'case.need_info_requested': {
    module: 'เคส',
    level: 'warning',
    source: '90 §6.3 · 38 §10',
    description: 'ผู้ตรวจขอข้อมูลเพิ่มเติม — ผู้ส่งเคสต้องแก้แล้วส่งกลับ',
  },
  'case.rejected': {
    module: 'เคส',
    level: 'critical',
    source: '90 §6.3 · 38 §10',
    description: 'เคสถูกปฏิเสธ (มีเหตุผลเสมอ) — ปิดทางเดินของเคสรอบนี้',
  },
  'case.approved': {
    module: 'เคส',
    level: 'success',
    source: '90 §6.3 · 38 §10',
    description: 'เคสผ่านการอนุมัติ — snapshot ค่าบริการที่จุดนี้ (`10` §9.2)',
  },
  'case.recycle_approved': {
    module: 'เคส',
    level: 'sent',
    source: '90 §6.3 · 38 §6.6',
    description: 'อนุมัติรีไซเกิลเคส — เคสกลับเข้า pipeline ใหม่ (tracking_round +1)',
  },

  // ── Assignment (40) — `90` §6.3 แถว 3 ─────────────────────────────────
  'assignment.reassignment_requested': {
    module: 'มอบหมาย',
    level: 'sent',
    source: '90 §6.3 · 40 §17.2',
    description: 'คำขอเปลี่ยนผู้รับผิดชอบ รอความยินยอมของคนเดิม',
  },
  'assignment.reassignment_timeout_resolved': {
    module: 'มอบหมาย',
    level: 'warning',
    source: '90 §6.3 (เขียนว่า `reassignment_timeout`) · 40 §17.2',
    description: 'คำขอหมดเขตความยินยอม — job ตัดสินให้อัตโนมัติ',
  },

  // ── Field Tracker (41) — `90` §6.3 แถว 4 ──────────────────────────────
  'case.closed_success': {
    module: 'ภาคสนาม',
    level: 'success',
    source: '90 §6.3 · 41 §17.2',
    description: 'ปิดงานสำเร็จ — รอคลังยืนยันรับทรัพย์ก่อนเกิดรายได้ (`19` §6.1)',
  },
  'case.closed_fail': {
    module: 'ภาคสนาม',
    level: 'warning',
    source: '90 §6.3 · 41 §17.2',
    description: 'ปิดงานไม่สำเร็จ — ไม่ผ่านคลัง',
  },
  'case.evidence_rejected': {
    module: 'ภาคสนาม',
    level: 'warning',
    source: '90 §6.3 (เขียนว่า `evidence.reject_evidence`) · 41 §17.2',
    description: 'หลักฐานปิดงานถูกตีกลับ — พนักงานต้องส่งใหม่',
  },

  // ── Warehouse (44) — `90` §6.3 แถว 5 ──────────────────────────────────
  'asset.intake_rejected': {
    module: 'คลังสินค้า',
    level: 'warning',
    source: '90 §6.3 · 44 §14',
    description: 'ตีกลับการรับเข้าคลัง (IMEI ไม่ตรง/สภาพไม่ตรง) — ต้องแก้แล้วรับใหม่',
  },
  'lot.confirmed': {
    module: 'คลังสินค้า',
    level: 'success',
    source: '90 §6.3 · 44 §14',
    description: 'ยืนยันส่งมอบล็อต — จุดปลดล็อกค่าตอบแทน + สร้างรายได้',
  },

  // ── Compensation / Claims (15/16) — `90` §6.3 แถว 6 ───────────────────
  'expense.rejected': {
    module: 'ค่าตอบแทน',
    level: 'warning',
    source: '90 §6.3 · 16 §9',
    description: 'รายการเบิกถูกตีกลับ (needs_revision) — แก้แล้วส่งใหม่ได้',
  },
  'expense.approved': {
    module: 'ค่าตอบแทน',
    level: 'success',
    source: '90 §6.3 · 16 §9',
    description: 'รายการเบิกผ่านครบทุกขั้นของสายอนุมัติ',
  },
  'expense.case_bound_created': {
    module: 'ค่าตอบแทน',
    level: 'sent',
    source: '41 §15 (จุดเรียกจริงใน `lib/field/queries.ts`)',
    description: 'มีรายการเบิกที่ผูกกับเคสเข้าคิวอนุมัติ',
  },

  // ── Payout (17) — `90` §6.3 แถว 7 ─────────────────────────────────────
  'payout_batch.completed': {
    module: 'การเงิน',
    level: 'success',
    source: '90 §6.3 · 17 §9',
    description: 'รอบจ่ายโอนเงินสำเร็จ — ระบบออกใบ 50 ทวิ ตามยอดที่จ่ายจริง (`33`)',
  },
  'payout_batch.failed': {
    module: 'การเงิน',
    level: 'critical',
    source: '90 §6.3 · 17 §9',
    description: 'รอบจ่ายล้มเหลว — ต้องตรวจไฟล์โอน/บัญชีปลายทางก่อนทำใหม่',
  },
  'advance.overdue': {
    module: 'การเงิน',
    level: 'warning',
    source: 'mockup `notifications.html` · 15 §9.3 (job `advance_overdue`)',
    description: 'เงินทดรองเลยกำหนดเคลียร์ — ระบบ mark overdue อัตโนมัติ',
  },

  // ── Accounting (33/34/30) — `90` §6.3 แถว 8–9 ─────────────────────────
  'wht.filing_due_reminder': {
    module: 'บัญชี',
    level: 'warning',
    source: '90 §6.3 · 33 §9',
    description: 'ใกล้ครบกำหนดยื่น ภ.ง.ด. ของงวด — เตือนก่อนถึงกำหนด',
  },
  'exception.created': {
    module: 'บัญชี',
    level: 'critical',
    source: '90 §6.3 · 34 §9',
    description: 'ข้อยกเว้นใหม่ระดับ critical — บล็อกการส่งงวดจนกว่าจะเคลียร์',
  },
  'exception.due_soon': {
    module: 'บัญชี',
    level: 'warning',
    source: '90 §6.3 · 34 §9',
    description: 'ข้อยกเว้นใกล้ครบกำหนดแก้ไข',
  },
  'question.asked': {
    module: 'บัญชี',
    level: 'sent',
    source: 'mockup `notifications.html` · 36 §9',
    description: 'ข้อซักถามใหม่จากสำนักงานบัญชี รอคำตอบ',
  },
  'period.sent_to_accountant': {
    module: 'บัญชี',
    level: 'success',
    source: 'mockup `notifications.html` · 30 §9',
    description: 'ส่งมอบงวดบัญชีให้สำนักงานบัญชีแล้ว',
  },
} as const satisfies Readonly<Record<string, NotificationEventContract>>

export type NotificationEventCode = keyof typeof NOTIFICATION_EVENTS

export const NOTIFICATION_EVENT_CODES = Object.keys(NOTIFICATION_EVENTS) as NotificationEventCode[]

/**
 * code ในแค็ตตาล็อกที่ **ยังไม่มี** ในทะเบียน domain event (`lib/api/event-names.ts`)
 * เพราะโมดูลต้นทางยังไม่ emit · รายการนี้ต้องหดลงเรื่อย ๆ ห้ามโตขึ้นเงียบ ๆ — เทสต์บังคับให้ตรงกับความจริง
 *
 * Phase 5.2 ย้ายเข้าทะเบียนไปแล้ว 7 ตัว เหลือ 2 ตัวที่ **ยังไม่มีที่ให้ emit จริงในสคีมาปัจจุบัน**
 * (ลำดับเอกสาร: `02` ชนะ `90` — CLAUDE.md) ⇒ ต้องแก้ `02` ก่อนถึงจะต่อสายได้:
 * - `payout_batch.failed` — `02` §3 `payout_batch_status` มีแค่ `draft|checking|file_generated|completed`
 *   ไม่มีสถานะล้มเหลว และ `23` ก็ไม่มี transition ไปสถานะนั้น
 * - `exception.due_soon` — `02` §9 `exceptions` **ไม่มีคอลัมน์วันครบกำหนด** และไฟล์ `34` ไม่มีแนวคิด deadline เลย
 *   (`90` §6.3 เขียนว่า "ใหม่/ใกล้ deadline" ⇒ ทำได้เฉพาะครึ่งแรก คือ `exception.created`)
 * ทั้งสองยังอยู่ในแค็ตตาล็อกเพื่อให้หน้าจอแสดงข้อมูลเก่า/ข้อมูลนำเข้าได้ถูกกลุ่มสี ถ้า PO ตัดสินใจเพิ่ม
 * คอลัมน์/สถานะใน `02` เมื่อไร ให้ต่อสายแล้วย้ายออกจากรายการนี้ในคอมมิตเดียวกัน (Rule 04)
 */
export const NOTIFICATION_ONLY_EVENTS: readonly NotificationEventCode[] = [
  'payout_batch.failed',
  'exception.due_soon',
]

export function isNotificationEvent(code: string): code is NotificationEventCode {
  return Object.hasOwn(NOTIFICATION_EVENTS, code)
}

/** ป้ายโมดูล + ระดับสีของ event — code นอกแค็ตตาล็อก (ข้อมูลเก่าในฐาน) ตกเป็นกลางเสมอ ไม่ throw บนหน้าจอ */
export function notificationDisplay(code: string): { module: string; level: NotificationLevel } {
  if (!isNotificationEvent(code)) return { module: 'ระบบ', level: 'sent' }
  const contract = NOTIFICATION_EVENTS[code]
  return { module: contract.module, level: contract.level }
}

/** ใช้ตอนรับ code จากข้อมูลภายนอก (job payload/import) — ชื่อนอกแค็ตตาล็อกต้องดังทันที */
export function assertNotificationEvent(code: string): NotificationEventCode {
  if (!isNotificationEvent(code)) {
    throw new Error(`event "${code}" ไม่มีในแค็ตตาล็อกการแจ้งเตือน (\`lib/notifications/events.ts\` · \`90\` §6.3)`)
  }
  return code
}

/** code ที่เป็น domain event จริงแล้ว (ทะเบียน `45` §7) — ใช้ในเทสต์ความสอดคล้อง 2 ทะเบียน */
export function isWiredDomainEvent(code: NotificationEventCode): boolean {
  return isDomainEvent(code)
}
