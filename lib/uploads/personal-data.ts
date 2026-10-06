import type { AuditEntry } from '@/lib/audit/types'
import type { DocumentSlot } from '@/lib/cases/case'
import { parseStoragePath } from '@/lib/uploads/targets'

/**
 * ไฟล์ที่มีข้อมูลส่วนบุคคล — การเปิดผ่าน signed URL ต้องบันทึก audit (มติ PO 06/10/2569 U90 · `90` §13)
 *
 * บันทึกเฉพาะ:
 * - เอกสารเคสจากบริษัทไฟแนนซ์ `cases/<caseId>/<slot>/…` ที่ slot เป็นเอกสารของลูกหนี้
 *   (สัญญา / บัตรประชาชน / เอกสารชุดรับเคส / เอกสารอื่นจากไฟแนนซ์)
 * - สแกน 50 ทวิ ที่ลูกค้าหักเรา `customer-wht/<certificateId>/…`
 * - เอกสารบริษัทไฟแนนซ์ `finance-companies/<companyId>/documents/…` (มติ PO U132 — หนังสือรับรอง/ภ.พ.20/สัญญา/สมุดบัญชี)
 *
 * **ไม่บันทึก**: รูปสินค้า, หลักฐานปิดงาน (`cases/<id>/field_evidence/…`), รูปรับเข้าคลัง, ใบเสร็จ,
 * เอกสารล็อต, หลักฐานคืนเงิน ฯลฯ — ไม่ใช่เอกสารระบุตัวบุคคลโดยตรง
 *
 * **pure ล้วน** — ใช้ path ที่ผ่าน `parseStoragePath()` แล้วเท่านั้น
 */

/** slot ของเอกสารเคสที่ถือว่ามีข้อมูลส่วนบุคคลของลูกหนี้ — `product_photo` ไม่นับ */
export const PERSONAL_DATA_CASE_SLOTS: readonly DocumentSlot[] = [
  'contract_doc',
  'national_id_doc',
  'bundle_doc',
  'other_doc',
]

export type PersonalDataFile =
  | { kind: 'case_document'; targetType: 'cases'; targetId: string; slot: DocumentSlot; fileName: string }
  | { kind: 'customer_wht'; targetType: 'customer_wht_certificates'; targetId: string; fileName: string }
  | { kind: 'company_document'; targetType: 'finance_companies'; targetId: string; fileName: string }

/** เหตุผลมาตรฐานของ audit — ผู้ใช้ไม่ต้องกรอก */
export const PERSONAL_FILE_VIEW_REASON = 'เปิดดูเอกสารข้อมูลส่วนบุคคล'

/** เหตุผลมาตรฐานของการเปิดเอกสารบริษัทไฟแนนซ์ (มติ PO U132) */
export const COMPANY_DOCUMENT_VIEW_REASON = 'เปิดดูเอกสารบริษัทไฟแนนซ์'

function lastSegment(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] ?? ''
}

/** path นี้เป็นไฟล์ข้อมูลส่วนบุคคลไหม — `null` = ไม่ต้องบันทึก (รวม path นอกโครงที่ระบบสร้าง) */
export function personalDataFileOf(path: string): PersonalDataFile | null {
  const owner = parseStoragePath(path)
  if (owner === null) return null
  if (owner.kind === 'case') {
    const slot = path.split('/')[2]
    const personalSlot = PERSONAL_DATA_CASE_SLOTS.find((candidate) => candidate === slot)
    if (personalSlot === undefined) return null
    return {
      kind: 'case_document',
      targetType: 'cases',
      targetId: owner.caseId,
      slot: personalSlot,
      fileName: lastSegment(path),
    }
  }
  if (owner.kind === 'customer_wht') {
    return {
      kind: 'customer_wht',
      targetType: 'customer_wht_certificates',
      targetId: owner.certificateId,
      fileName: lastSegment(path),
    }
  }
  if (owner.kind === 'finance_company') {
    return {
      kind: 'company_document',
      targetType: 'finance_companies',
      targetId: owner.companyId,
      fileName: lastSegment(path),
    }
  }
  return null
}

/**
 * audit ของการเปิดไฟล์ข้อมูลส่วนบุคคล — `null` = ไฟล์ชนิดที่ไม่บันทึก
 * เก็บ path/ชื่อไฟล์เท่านั้น **ห้ามเก็บ signed URL** (โทเคนเข้าถึงไฟล์)
 */
export function buildPersonalFileViewAudit(input: {
  actor: { id: string; organizationId: string; roleName: string }
  path: string
  ipAddress: string | null
  userAgent: string | null
}): AuditEntry | null {
  const file = personalDataFileOf(input.path)
  if (file === null) return null
  return {
    organizationId: input.actor.organizationId,
    actorId: input.actor.id,
    actorRole: input.actor.roleName,
    action: 'view',
    targetType: file.targetType,
    targetId: file.targetId,
    after: {
      kind: file.kind,
      ...(file.kind === 'case_document' ? { slot: file.slot } : {}),
      path: input.path,
      fileName: file.fileName,
    },
    reason: file.kind === 'company_document' ? COMPANY_DOCUMENT_VIEW_REASON : PERSONAL_FILE_VIEW_REASON,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  }
}
