import type { DomainEventName } from '@/lib/api/event-names'

/**
 * ตรวจซ้ำ staging SV6-R-03 — ป้ายภาษาไทยของชื่อเหตุการณ์ที่บันทึกใน audit (`after.events` เช่น `["case.status_changed","case.approved"]`)
 * — **pure ล้วน** · แสดงผลเท่านั้น (ค่าใน audit คงชื่อเหตุการณ์เดิม)
 *
 * - ทุกชื่อในทะเบียนเหตุการณ์ (`EVENT_NAMES`) ต้องมีป้าย — ล็อกด้วยชนิด `Record<DomainEventName, string>`
 * - ชื่อที่บันทึกใน audit แต่ไม่ใช่ event ที่ส่งต่อ (ร่องรอยภายในโมดูล) อยู่ใน {@link AUDIT_ONLY_EVENT_LABEL}
 *   — `field-label-coverage.test.ts` สแกน `events: [ … ]` ในซอร์สให้ครบ
 */
const DOMAIN_EVENT_LABEL: Readonly<Record<DomainEventName, string>> = {
  'case.created': 'สร้างเคส',
  'case.updated': 'แก้ไขข้อมูลเคส',
  'case.document_uploaded': 'อัปโหลดเอกสารเคส',
  'case.status_changed': 'เปลี่ยนสถานะเคส',
  'case.approved': 'อนุมัติเคส',
  'case.rejected': 'ไม่รับเคส',
  'case.need_info_requested': 'ขอข้อมูลเพิ่มเติม',
  'case.recycle_approved': 'อนุมัติรีไซเคิลเคส',
  'assignment.created': 'มอบหมายงาน',
  'assignment.reassigned': 'เปลี่ยนผู้รับผิดชอบ',
  'assignment.reassignment_requested': 'ขอเปลี่ยนผู้รับผิดชอบ',
  'assignment.reassignment_consented': 'ผู้รับผิดชอบเดิมยินยอมให้เปลี่ยน',
  'assignment.reassignment_declined': 'ผู้รับผิดชอบเดิมไม่ยินยอมให้เปลี่ยน',
  'assignment.reassignment_timeout_resolved': 'คำขอเปลี่ยนผู้รับผิดชอบหมดเวลา — ระบบเปลี่ยนให้',
  'assignment.accepted': 'รับงาน',
  'case.accepted': 'รับงานภาคสนาม',
  'case.scheduled': 'นัดวันลงพื้นที่',
  'case.reordered': 'จัดลำดับเคสในวัน',
  'case.checkin_recorded': 'บันทึกเช็คอิน',
  'case.close_draft_saved': 'บันทึกร่างปิดงาน',
  'case.closed_success': 'ปิดงานสำเร็จ',
  'case.closed_fail': 'ปิดงานไม่สำเร็จ',
  'case.evidence_rejected': 'ตีกลับหลักฐานปิดงาน',
  'case.close_resubmitted': 'ส่งปิดงานใหม่',
  'expense.case_bound_created': 'สร้างรายการเบิกของเคส',
  'expense.hotel_claim_submitted': 'ส่งคำขอเบิกค่าที่พัก',
  'expense.resubmitted': 'ส่งรายการเบิกใหม่',
  'reassignment.consented': 'ยินยอมให้เปลี่ยนผู้รับผิดชอบ',
  'reassignment.declined': 'ไม่ยินยอมให้เปลี่ยนผู้รับผิดชอบ',
  'asset.intake': 'รับเครื่องเข้าคลัง',
  'asset.intake_rejected': 'ตีกลับการรับเข้าคลัง',
  'asset.intake_retry': 'รับเข้าคลังใหม่',
  'lot.created': 'สร้างล็อตส่งมอบ',
  'lot.doc_attached': 'แนบเอกสารล็อต',
  'lot.confirmed': 'ยืนยันส่งมอบล็อต',
  'expense.approved': 'อนุมัติรายการเบิก',
  'expense.rejected': 'ตีกลับรายการเบิก',
  'expense.approval_requested': 'รายการเบิกรออนุมัติ',
  'advance.approval_requested': 'คำขอเงินทดรองรออนุมัติ',
  'adjustment.approval_requested': 'รายการปรับปรุงรออนุมัติ',
  'field_allowance.period_locked': 'ค่าเบี้ยเลี้ยงรายวันติดงวดที่ปิดแล้ว',
  'payout_batch.completed': 'รอบจ่ายเงินจ่ายสำเร็จ',
  'advance.overdue': 'เงินทดรองเกินกำหนดเคลียร์',
  'payout.paid_to_payee': 'โอนเงินให้ผู้รับเงินแล้ว',
  'advance.approved': 'อนุมัติเงินทดรอง',
  'advance.rejected': 'ไม่อนุมัติเงินทดรอง',
  'advance.clear_reopened': 'เปิดเคลียร์เงินทดรองใหม่',
  'wht.filing_due_reminder': 'เตือนกำหนดยื่นภาษีหัก ณ ที่จ่าย',
  'wht.supplementary_filing_required': 'ต้องยื่นภาษีหัก ณ ที่จ่ายเพิ่มเติม',
  'device_catalog.tac_update_failed': 'อัปเดตฐานข้อมูลรุ่นโทรศัพท์ไม่สำเร็จ',
  'exception.created': 'เกิดรายการข้อยกเว้น',
  'question.asked': 'ส่งคำถามถึงนักบัญชี',
  'period.sent_to_accountant': 'ส่งงวดให้นักบัญชี',
}

/** ชื่อที่ลงใน `after.events` ของ audit แต่ไม่อยู่ในทะเบียนเหตุการณ์ (ไม่ส่งต่อเป็น event) */
const AUDIT_ONLY_EVENT_LABEL: Readonly<Record<string, string>> = {
  'asset.intake_confirmed': 'ยืนยันรับเครื่องเข้าคลัง',
  'lot.asset_removed': 'นำทรัพย์ออกจากล็อต',
  'lot.deleted_empty': 'ลบล็อตว่าง',
  'substitute_receipt.issued': 'ออกใบรับรองแทนใบเสร็จ',
  'substitute_receipt.reissued': 'ออกใบรับรองแทนใบเสร็จใหม่',
  'substitute_receipt.cancelled': 'ยกเลิกใบรับรองแทนใบเสร็จ',
  'substitute_receipt.signed': 'แนบใบรับรองแทนใบเสร็จที่ลงนามแล้ว',
}

export const AUDIT_EVENT_LABEL: Readonly<Record<string, string>> = { ...DOMAIN_EVENT_LABEL, ...AUDIT_ONLY_EVENT_LABEL }

/** ป้ายของชื่อเหตุการณ์ · ไม่รู้จัก = `null` */
export function auditEventLabel(name: string): string | null {
  return Object.hasOwn(AUDIT_EVENT_LABEL, name) ? (AUDIT_EVENT_LABEL[name] ?? null) : null
}
