import { z } from 'zod'
import { advanceReturnFilePath } from '@/lib/advances/return-file'
import { DOCUMENT_SLOTS } from '@/lib/cases/case'
import { creditNoteFilePath } from '@/lib/credit-notes/file'
import { bankRefundFilePath, customerWhtFilePath } from '@/lib/customer-wht/file'
import { storagePath } from '@/lib/cases/document-upload'
import { expenseReceiptPath, FIELD_MEDIA_KINDS, fieldEvidencePath } from '@/lib/field/media-upload'
import { INTAKE_PHOTO_ANGLES } from '@/lib/warehouse/intake'
import { intakePhotoPath } from '@/lib/warehouse/intake-photos'
import { lotDocumentPath } from '@/lib/warehouse/lot-documents'
import { organizationLogoPath, organizationSignaturePath } from '@/lib/organization/profile'
import { substituteReceiptFilePath } from '@/lib/substitute-receipts/file'
import { LOT_DOCUMENTS } from '@/lib/warehouse/lot-status'
import { companyDocumentPath, companyDocumentTypeSchema } from '@/lib/finance-companies/documents'
import { payeeIdDocumentPath } from '@/lib/payees/id-document'

/**
 * ปลายทางอัปโหลด + การอ่าน path ของ bucket `case-documents` (BUG-143 · DEC-014)
 *
 * browser **ไม่ประกอบ path เอง** อีกต่อไป — บอกแค่ "จะอัปโหลดเข้าอะไร" (target) แล้ว server ประกอบ path
 * จากตัวสร้างเดิมของแต่ละโมดูล (prefix ตรงกับ `lib/uploads/rules.ts` ที่ใช้ตรวจตอนผูกไฟล์)
 *
 * **pure ล้วน** — Zod schema ชุดเดียวใช้ร่วม FE/BE (Rule 04)
 *
 * รหัสอ้างอิงใช้ `z.guid()` (รูปแบบ 8-4-4-4-12 hex เท่ากับที่ Postgres `uuid` รับ) ไม่ใช่ `z.uuid()` ที่บังคับ
 * version/variant ตาม RFC — id จาก seed เช่นองค์กร `00000000-0000-0000-0000-000000000001` ไม่ผ่าน `z.uuid()` (BUG-173)
 */

export const uploadTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('case_document'), caseId: z.guid(), slot: z.enum(DOCUMENT_SLOTS) }),
  z.object({ kind: z.literal('field_evidence'), caseId: z.guid(), mediaKind: z.enum(FIELD_MEDIA_KINDS) }),
  /** ใบเสร็จเบิกแยก — path ผูกกับผู้เรียกเสมอ (server ใช้ `user.id` ไม่รับ userId จาก client) */
  z.object({ kind: z.literal('expense_receipt') }),
  z.object({ kind: z.literal('intake_photo'), assetId: z.guid(), angle: z.enum(INTAKE_PHOTO_ANGLES) }),
  z.object({ kind: z.literal('lot_document'), lotId: z.guid(), document: z.enum(LOT_DOCUMENTS) }),
  /** ไฟล์สแกนใบลดหนี้ที่สำนักงานบัญชีออก (มติ PO U14) — ผูกกับใบกำกับที่อ้างถึง */
  z.object({ kind: z.literal('credit_note'), taxInvoiceId: z.guid() }),
  /** หลักฐานรับคืนเงินทดรองแยก (มติ PO U30) — ผูกกับเงินทดรองที่รับคืน */
  z.object({ kind: z.literal('advance_return'), advanceId: z.guid() }),
  /** สแกนหนังสือรับรอง 50 ทวิ ที่ลูกค้าหักเรา (มติ PO U40) — ผูกกับรายการ "รอ 50 ทวิ" */
  z.object({ kind: z.literal('customer_wht'), certificateId: z.guid() }),
  /** หลักฐานคืนเงินผู้โอนของเงินรับรอตรวจสอบ (มติ PO U41) — ผูกกับรายการเดินบัญชี */
  z.object({ kind: z.literal('bank_refund'), transactionId: z.guid() }),
  /** โลโก้บริษัทบนหัวเอกสาร (มติ PO U99) — server ตรวจว่าเป็นองค์กรของผู้เรียกเอง */
  z.object({ kind: z.literal('organization_logo'), organizationId: z.guid() }),
  /** รูปลายเซ็นผู้มีอำนาจ (มติ PO U122) — server ตรวจว่าเป็นองค์กรของผู้เรียกเอง */
  z.object({ kind: z.literal('organization_signature'), organizationId: z.guid() }),
  /** ใบรับรองแทนใบเสร็จฉบับเซ็นแล้ว (มติ PO U103) — ผูกกับใบ CRT · server ตรวจว่าเป็นเจ้าของใบ/การเงิน */
  z.object({ kind: z.literal('substitute_receipt'), substituteReceiptId: z.guid() }),
  /** เอกสารบริษัทไฟแนนซ์ (มติ PO U132) — path ต่อเวอร์ชัน · server ตรวจ `manage_companies` + บริษัทในองค์กร */
  z.object({ kind: z.literal('company_document'), companyId: z.guid(), documentType: companyDocumentTypeSchema }),
  /**
   * เอกสารยืนยันตัวตนผู้รับเงิน (มติ PO U150) — path ผูกกับ **องค์กรของผู้เรียก** (server ใช้ session ไม่รับจาก client)
   * เพราะฟอร์มผู้ใช้ (U131) อัปโหลดก่อนผู้รับเงินเกิด · server ตรวจ `manage:manage_payee_profile`
   */
  z.object({ kind: z.literal('payee_id_document') }),
  /**
   * ไฟล์ฐาน TAC ที่ผู้ดูแลนำเข้าเอง (มติ PO U166) — path ผูกกับ **องค์กรของผู้เรียก** (server ใช้ session)
   * server ตรวจ `manage:manage_device_catalog` · ตรวจรูปแบบไฟล์ตอนสั่งนำเข้า (ไม่ใช่ magic bytes — เป็น CSV)
   */
  z.object({ kind: z.literal('device_tac_file') }),
])

export type UploadTarget = z.infer<typeof uploadTargetSchema>

export const signedUploadRequestSchema = z.object({
  target: uploadTargetSchema,
  fileName: z.string().trim().min(1).max(255),
  /** ขนาดที่ browser แจ้ง — ใช้ปัดไฟล์ใหญ่เกินตั้งแต่ก่อนอัปโหลด (ตัวบังคับจริงยังเป็นการตรวจตอนผูกไฟล์) */
  sizeBytes: z.number().int().positive(),
})

export type SignedUploadRequest = z.infer<typeof signedUploadRequestSchema>

export const MAX_STORAGE_PATH_LENGTH = 1024

export const signedDownloadRequestSchema = z.object({
  path: z.string().min(1).max(MAX_STORAGE_PATH_LENGTH),
})

export interface SignedUploadDto {
  path: string
  token: string
}

export interface SignedDownloadDto {
  url: string
  expiresInSeconds: number
}

/**
 * path ใน bucket ของ target — `ownerUserId` ใช้เฉพาะใบเสร็จ (ต้องเป็นผู้เรียกเสมอ) · `organizationId` ใช้เฉพาะ
 * เอกสารยืนยันตัวตนผู้รับเงิน (องค์กรของผู้เรียกเสมอ)
 */
export function uploadTargetPath(
  target: UploadTarget,
  ownerUserId: string,
  fileName: string,
  uniqueKey: string,
  organizationId = '',
): string {
  switch (target.kind) {
    case 'case_document':
      return storagePath(target.caseId, target.slot, fileName, uniqueKey)
    case 'field_evidence':
      return fieldEvidencePath(target.caseId, target.mediaKind, fileName, uniqueKey)
    case 'expense_receipt':
      return expenseReceiptPath(ownerUserId, fileName, uniqueKey)
    case 'intake_photo':
      return intakePhotoPath(target.assetId, target.angle, fileName, uniqueKey)
    case 'lot_document':
      return lotDocumentPath(target.lotId, target.document, fileName, uniqueKey)
    case 'credit_note':
      return creditNoteFilePath(target.taxInvoiceId, fileName, uniqueKey)
    case 'advance_return':
      return advanceReturnFilePath(target.advanceId, fileName, uniqueKey)
    case 'customer_wht':
      return customerWhtFilePath(target.certificateId, fileName, uniqueKey)
    case 'bank_refund':
      return bankRefundFilePath(target.transactionId, fileName, uniqueKey)
    case 'organization_logo':
      return organizationLogoPath(target.organizationId, fileName, uniqueKey)
    case 'organization_signature':
      return organizationSignaturePath(target.organizationId, fileName, uniqueKey)
    case 'substitute_receipt':
      return substituteReceiptFilePath(target.substituteReceiptId, fileName, uniqueKey)
    case 'company_document':
      return companyDocumentPath(target.companyId, target.documentType, fileName, uniqueKey)
    case 'payee_id_document':
      return payeeIdDocumentPath(organizationId, fileName, uniqueKey)
    case 'device_tac_file':
      return deviceTacFilePath(organizationId, uniqueKey)
  }
}

/** path ไฟล์ TAC ที่นำเข้าเอง — `organization/<orgId>/device-tac/<uuid>.csv` (ไม่ใช้ชื่อไฟล์จากผู้ใช้) */
export function deviceTacFilePrefix(organizationId: string): string {
  return `organization/${organizationId}/device-tac/`
}

export function deviceTacFilePath(organizationId: string, uniqueKey: string): string {
  return `${deviceTacFilePrefix(organizationId)}${uniqueKey}.csv`
}

/** เจ้าของ path ใน bucket — ตัดสินสิทธิ์เปิดดูจาก entity นี้ (ไม่ใช่จากตัวไฟล์) */
export type StoragePathOwner =
  | { kind: 'case'; caseId: string }
  | { kind: 'asset'; assetId: string }
  | { kind: 'lot'; lotId: string }
  | { kind: 'expense_receipt'; userId: string }
  | { kind: 'tax_invoice'; taxInvoiceId: string }
  | { kind: 'advance'; advanceId: string }
  | { kind: 'customer_wht'; certificateId: string }
  | { kind: 'bank_transaction'; transactionId: string }
  | { kind: 'organization_logo'; organizationId: string }
  | { kind: 'organization_signature'; organizationId: string }
  | { kind: 'substitute_receipt'; substituteReceiptId: string }
  | { kind: 'finance_company'; companyId: string }
  | { kind: 'payee_id_document'; organizationId: string }
  | { kind: 'device_tac_file'; organizationId: string }

const HEX = '[0-9a-fA-F]'
const UUID = `${HEX}{8}-${HEX}{4}-${HEX}{4}-${HEX}{4}-${HEX}{12}`
const OWNER_PATTERNS: ReadonlyArray<{ pattern: RegExp; owner: (id: string) => StoragePathOwner }> = [
  { pattern: new RegExp(`^cases/(${UUID})/[^/]`), owner: (id) => ({ kind: 'case', caseId: id }) },
  { pattern: new RegExp(`^assets/(${UUID})/intake/[^/]`), owner: (id) => ({ kind: 'asset', assetId: id }) },
  { pattern: new RegExp(`^handover-lots/(${UUID})/[^/]`), owner: (id) => ({ kind: 'lot', lotId: id }) },
  {
    pattern: new RegExp(`^expenses/(${UUID})/receipts/[^/]`),
    owner: (id) => ({ kind: 'expense_receipt', userId: id }),
  },
  {
    pattern: new RegExp(`^tax-invoices/(${UUID})/credit-notes/[^/]`),
    owner: (id) => ({ kind: 'tax_invoice', taxInvoiceId: id }),
  },
  {
    pattern: new RegExp(`^advances/(${UUID})/returns/[^/]`),
    owner: (id) => ({ kind: 'advance', advanceId: id }),
  },
  { pattern: new RegExp(`^customer-wht/(${UUID})/[^/]`), owner: (id) => ({ kind: 'customer_wht', certificateId: id }) },
  {
    pattern: new RegExp(`^bank-transactions/(${UUID})/refund/[^/]`),
    owner: (id) => ({ kind: 'bank_transaction', transactionId: id }),
  },
  {
    pattern: new RegExp(`^organization/(${UUID})/logo/[^/]`),
    owner: (id) => ({ kind: 'organization_logo', organizationId: id }),
  },
  {
    pattern: new RegExp(`^organization/(${UUID})/signature/[^/]`),
    owner: (id) => ({ kind: 'organization_signature', organizationId: id }),
  },
  {
    pattern: new RegExp(`^substitute-receipts/(${UUID})/signed/[^/]`),
    owner: (id) => ({ kind: 'substitute_receipt', substituteReceiptId: id }),
  },
  {
    pattern: new RegExp(`^finance-companies/(${UUID})/documents/[^/]`),
    owner: (id) => ({ kind: 'finance_company', companyId: id }),
  },
  {
    pattern: new RegExp(`^organization/(${UUID})/device-tac/[^/]`),
    owner: (id) => ({ kind: 'device_tac_file', organizationId: id }),
  },
  {
    pattern: new RegExp(`^payees/(${UUID})/id-documents/[^/]`),
    owner: (id) => ({ kind: 'payee_id_document', organizationId: id }),
  },
]

/**
 * อ่านเจ้าของจาก path — `null` = path นอกโครงที่ระบบสร้าง (ปฏิเสธเสมอ)
 * กัน path traversal: ห้าม `..`/`.` เป็น segment, ห้าม `//`, `\`, ขึ้นต้น `/`, อักขระควบคุม
 */
export function parseStoragePath(path: string): StoragePathOwner | null {
  if (path.length === 0 || path.length > MAX_STORAGE_PATH_LENGTH) return null
  if (path.startsWith('/') || path.includes('\\') || path.includes('//') || /[\u0000-\u001f]/.test(path)) return null
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return null
  for (const { pattern, owner } of OWNER_PATTERNS) {
    const match = pattern.exec(path)
    if (match?.[1] !== undefined) return owner(match[1].toLowerCase())
  }
  return null
}

/** path ของ endpoint ออก URL/โทเคน — นอก contract `45` (ใช้ร่วมทุกโมดูล ไม่ใช่ของโมดูลเคส/คลัง) */
export const STORAGE_API_PATH = {
  uploadUrl: '/api/storage/upload-url',
  downloadUrl: '/api/storage/download-url',
} as const
