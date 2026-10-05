import { AuthError } from '@/lib/auth/errors'
import { checkPermission } from '@/lib/auth/permission'
import { requirePermission } from '@/lib/auth/require-permission'
import type { SessionUser } from '@/lib/auth/types'
import { ModuleError } from '@/lib/api/errors'
import { CASE_READ_CAPABILITIES, CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { getCase } from '@/lib/cases/queries'
import { assertTaxInvoiceInScope } from '@/lib/credit-notes/queries'
import { MANAGE_SALES_EXPENSES, MAP_COST_CENTER } from '@/lib/expenses/expense-record'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { MANAGE_TAX_INVOICE, SALES_READ_CAPABILITIES } from '@/lib/sales/sales'
import { assertOwnFieldCase, getFieldCase } from '@/lib/field/queries'
import { UploadError } from '@/lib/uploads/errors'
import type { UploadRule } from '@/lib/uploads/inspect'
import {
  caseDocumentRule,
  creditNoteFileRule,
  expenseReceiptRule,
  fieldEvidenceRule,
  intakePhotoRule,
  lotDocumentRule,
} from '@/lib/uploads/rules'
import { parseStoragePath, uploadTargetPath, type StoragePathOwner, type UploadTarget } from '@/lib/uploads/targets'
import {
  WAREHOUSE_CONFIRM_LOT_CAPABILITY,
  WAREHOUSE_INTAKE_CAPABILITY,
  WAREHOUSE_READ_CAPABILITIES,
  isTeamScopedViewer,
} from '@/lib/warehouse/permissions'
import { getAsset, getLot } from '@/lib/warehouse/queries'

/**
 * ตัดสินสิทธิ์เข้าถึงไฟล์ใน bucket `case-documents` (BUG-143 · DEC-014) — **ทางเดียว** ที่ browser จะได้
 * URL/โทเคนของ Storage · bucket ไม่มี policy ให้ `authenticated` แล้ว (DEC-002: สิทธิ์อยู่ที่ API layer)
 *
 * กติกา = "ทำ action ปลายทางได้ ⇒ ได้โทเคน" — ใช้ capability + scope ตัวเดียวกับ endpoint ที่ผูก/แสดงไฟล์นั้น
 * (ออกโทเคนให้แล้วก็ยังต้องผ่าน `verify.ts` ตอนผูกไฟล์เข้าข้อมูลเหมือนเดิม)
 *
 * ⚠️ ฝั่ง server เท่านั้น
 */

/** capability ที่เข้าใกล้การอัปโหลดได้อย่างน้อยหนึ่งทาง — ยามชั้นแรกของ route (ตรวจละเอียดต่อ target ด้านล่าง) */
export const STORAGE_UPLOAD_CAPABILITIES = [
  CASE_WRITE_CAPABILITY,
  FIELD_CAPABILITY,
  WAREHOUSE_INTAKE_CAPABILITY,
  WAREHOUSE_CONFIRM_LOT_CAPABILITY,
  MANAGE_TAX_INVOICE,
] as const

/**
 * ผู้ตรวจใบเสร็จเบิกแยกของคนอื่นได้ (การเงิน/ผู้บริหาร/บัญชีค่าใช้จ่าย) — ผู้จัดการทีมยังไม่เปิด
 * เพราะยังไม่มีหน้าจอใดของผู้จัดการที่เปิดใบเสร็จ (เปิดเมื่อไรต้องเพิ่มการตรวจทีมด้วย)
 */
export const RECEIPT_REVIEW_CAPABILITIES = [
  'approve_expense_finance',
  'approve_expense_executive',
  MANAGE_SALES_EXPENSES,
  MAP_COST_CENTER,
] as const

/** capability ที่เปิดดูไฟล์ได้อย่างน้อยหนึ่งชนิด — ยามชั้นแรกของ route */
export const STORAGE_VIEW_CAPABILITIES: readonly string[] = [
  ...new Set<string>([
    ...CASE_READ_CAPABILITIES,
    FIELD_CAPABILITY,
    ...WAREHOUSE_READ_CAPABILITIES,
    ...RECEIPT_REVIEW_CAPABILITIES,
    ...SALES_READ_CAPABILITIES,
  ]),
]

function hasAny(user: SessionUser, action: 'view' | 'manage', resources: readonly string[]): boolean {
  return resources.some((resource) => checkPermission(user, action, resource) === null)
}

function denied(user: SessionUser, detail: string): AuthError {
  return new AuthError('PERMISSION_DENIED', `${detail} user=${user.id}`)
}

function ruleFor(target: UploadTarget, user: SessionUser): UploadRule {
  switch (target.kind) {
    case 'case_document':
      return caseDocumentRule(target.caseId, target.slot)
    case 'field_evidence':
      return fieldEvidenceRule(target.caseId, target.mediaKind)
    case 'expense_receipt':
      return expenseReceiptRule(user.id)
    case 'intake_photo':
      return intakePhotoRule(target.assetId)
    case 'lot_document':
      return lotDocumentRule(target.lotId, target.document)
    case 'credit_note':
      return creditNoteFileRule(target.taxInvoiceId)
  }
}

/** capability + scope ของ endpoint ที่จะผูกไฟล์ของ target นี้ — ไม่ผ่าน = throw (AuthError / NOT_FOUND ของโมดูล) */
async function assertCanUpload(target: UploadTarget): Promise<SessionUser> {
  switch (target.kind) {
    case 'case_document': {
      const user = await requirePermission('manage', CASE_WRITE_CAPABILITY)
      await getCase(user, target.caseId)
      return user
    }
    case 'field_evidence': {
      const user = await requirePermission('manage', FIELD_CAPABILITY)
      await assertOwnFieldCase(user, target.caseId)
      return user
    }
    case 'expense_receipt':
      return requirePermission('manage', FIELD_CAPABILITY)
    case 'intake_photo': {
      const user = await requirePermission('manage', WAREHOUSE_INTAKE_CAPABILITY)
      await getAsset(user, target.assetId)
      return user
    }
    case 'lot_document': {
      const user = await requirePermission('manage', WAREHOUSE_CONFIRM_LOT_CAPABILITY)
      await getLot(user, target.lotId)
      return user
    }
    case 'credit_note': {
      // แนบไฟล์ใบลดหนี้ = บันทึกใบลดหนี้ ⇒ สิทธิ์เดียวกับ endpoint บันทึก (บัญชี `manage_tax_invoice`)
      const user = await requirePermission('manage', MANAGE_TAX_INVOICE)
      await assertTaxInvoiceInScope(user, target.taxInvoiceId)
      return user
    }
  }
}

/**
 * ตรวจสิทธิ์อัปโหลดแล้วคืน path ที่ server ประกอบเอง (client ไม่มีสิทธิ์เลือก path)
 * ขนาดเกินเพดานของช่อง = `UPLOAD_FILE_TOO_LARGE` ตั้งแต่ก่อนอัปโหลด
 */
export async function authorizeUpload(input: {
  target: UploadTarget
  fileName: string
  sizeBytes: number
  uniqueKey: string
}): Promise<{ user: SessionUser; path: string }> {
  const user = await assertCanUpload(input.target)
  const rule = ruleFor(input.target, user)
  if (input.sizeBytes > rule.maxBytes) {
    throw new UploadError('UPLOAD_FILE_TOO_LARGE', { detail: `${input.sizeBytes} > ${rule.maxBytes}` })
  }
  const path = uploadTargetPath(input.target, user.id, input.fileName, input.uniqueKey)
  // ยามซ้ำ: path ต้องอยู่ใต้ prefix ที่ตัวตรวจตอนผูกไฟล์ยอมรับ (กันตัวสร้าง path กับกติกาหลุดกัน)
  if (!path.startsWith(rule.prefix) || parseStoragePath(path) === null) {
    throw new UploadError('UPLOAD_PATH_OUT_OF_SCOPE', { detail: path })
  }
  return { user, path }
}

/** ลองตัวโหลดตาม scope — `ModuleError` (NOT_FOUND นอก scope) = ไม่ผ่าน · error อื่นโยนต่อ */
async function passes(load: () => Promise<unknown>): Promise<ModuleError | null> {
  try {
    await load()
    return null
  } catch (error) {
    if (error instanceof ModuleError) return error
    throw error
  }
}

async function assertCanView(user: SessionUser, owner: StoragePathOwner): Promise<void> {
  switch (owner.kind) {
    case 'case': {
      // เคสเปิดดูได้ 2 ทาง: หน้ารายละเอียดเคส (ธุรการ/อนุมัติ/ผู้จัดการ/บริหาร/บริษัท) หรือหน้าเคสภาคสนาม
      let failure: ModuleError | null = null
      let tried = false
      if (hasAny(user, 'view', CASE_READ_CAPABILITIES)) {
        tried = true
        failure = await passes(() => getCase(user, owner.caseId))
        if (failure === null) return
      }
      if (hasAny(user, 'view', [FIELD_CAPABILITY])) {
        tried = true
        failure = await passes(() => getFieldCase(user, owner.caseId))
        if (failure === null) return
      }
      if (!tried) throw denied(user, `view:case-file case=${owner.caseId}`)
      throw failure ?? denied(user, `view:case-file case=${owner.caseId}`)
    }
    case 'asset': {
      if (!hasAny(user, 'view', WAREHOUSE_READ_CAPABILITIES)) throw denied(user, `view:asset-file asset=${owner.assetId}`)
      await getAsset(user, owner.assetId)
      return
    }
    case 'lot': {
      if (!hasAny(user, 'view', WAREHOUSE_READ_CAPABILITIES)) throw denied(user, `view:lot-file lot=${owner.lotId}`)
      // เอกสารทั้งล็อตมีเครื่องของทีมอื่นปน — ผู้จัดการ/หัวหน้าทีม (scope ทีม) อ่านได้แค่รายการเครื่องของทีม (มติ PO U22)
      if (isTeamScopedViewer(user)) throw denied(user, `view:lot-file team-scope lot=${owner.lotId}`)
      await getLot(user, owner.lotId)
      return
    }
    case 'expense_receipt': {
      if (owner.userId === user.id && hasAny(user, 'view', [FIELD_CAPABILITY])) return
      if (hasAny(user, 'view', RECEIPT_REVIEW_CAPABILITIES)) return
      throw denied(user, `view:receipt owner=${owner.userId}`)
    }
    case 'tax_invoice': {
      if (!hasAny(user, 'view', SALES_READ_CAPABILITIES)) throw denied(user, `view:credit-note invoice=${owner.taxInvoiceId}`)
      await assertTaxInvoiceInScope(user, owner.taxInvoiceId)
      return
    }
  }
}

/**
 * ตรวจสิทธิ์เปิดดูไฟล์ตาม **เจ้าของ path** (เคส/เครื่อง/ล็อต/ผู้เบิก) — path นอกโครงที่ระบบสร้าง = `UPLOAD_PATH_OUT_OF_SCOPE`
 * นอก scope = NOT_FOUND ของโมดูลนั้น (ไม่ leak ว่ามีรายการของบริษัท/ทีมอื่น)
 */
export async function authorizeDownload(user: SessionUser, path: string): Promise<void> {
  const owner = parseStoragePath(path)
  if (owner === null) throw new UploadError('UPLOAD_PATH_OUT_OF_SCOPE', { detail: path })
  await assertCanView(user, owner)
}
