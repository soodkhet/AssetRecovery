import { APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/advance'
import { assertAdvanceInScope } from '@/lib/advances/queries'
import { AuthError } from '@/lib/auth/errors'
import { checkPermission } from '@/lib/auth/permission'
import { requireAnyPermission, requirePermission } from '@/lib/auth/require-permission'
import type { SessionUser } from '@/lib/auth/types'
import { ModuleError } from '@/lib/api/errors'
import { CASE_READ_CAPABILITIES, CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { getCase } from '@/lib/cases/queries'
import { assertTaxInvoiceInScope } from '@/lib/credit-notes/queries'
import { MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/matching'
import { assertBankTransactionInScope } from '@/lib/bank-recon/queries'
import { MANAGE_CUSTOMER_WHT } from '@/lib/customer-wht/customer-wht'
import { assertCustomerWhtInScope } from '@/lib/customer-wht/queries'
import { MANAGE_SALES_EXPENSES, MAP_COST_CENTER } from '@/lib/expenses/expense-record'
import { ExpenseStateError } from '@/lib/field/expense-status'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { MANAGE_TAX_INVOICE, SALES_READ_CAPABILITIES } from '@/lib/sales/sales'
import { MANAGE_ORGANIZATION_PROFILE, VIEW_ORGANIZATION_PROFILE } from '@/lib/organization/permissions'
import { assertOwnFieldCase, getFieldCase } from '@/lib/field/queries'
import { UploadError } from '@/lib/uploads/errors'
import { assertCompanyDocumentAccess, MANAGE_COMPANIES, VIEW_COMPANY_DOCUMENTS } from '@/lib/finance-companies/document-queries'
import { isReceiptVisibleViaExpense } from '@/lib/compensation/approval-queries'
import { MANAGE_PAYEE_PROFILE_CAPABILITY } from '@/lib/payees/payee'
import { PayeeError } from '@/lib/payees/errors'
import { prisma } from '@/lib/prisma'
import type { UploadRule } from '@/lib/uploads/inspect'
import {
  advanceReturnFileRule,
  bankRefundFileRule,
  caseDocumentRule,
  creditNoteFileRule,
  customerWhtFileRule,
  expenseReceiptRule,
  fieldEvidenceRule,
  intakePhotoRule,
  lotDocumentRule,
  organizationLogoRule,
  organizationSignatureRule,
  substituteReceiptFileRule,
  companyDocumentRule,
  payeeIdDocumentRule,
} from '@/lib/uploads/rules'
import {
  deviceTacFilePrefix,
  parseStoragePath,
  uploadTargetPath,
  type StoragePathOwner,
  type UploadTarget,
} from '@/lib/uploads/targets'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'

/** ไฟล์ฐาน TAC เต็ม ~12 MB — เผื่อโต (มติ PO U166) */
export const DEVICE_TAC_FILE_MAX_BYTES = 40 * 1024 * 1024
import {
  WAREHOUSE_CONFIRM_LOT_CAPABILITY,
  WAREHOUSE_INTAKE_CAPABILITY,
  WAREHOUSE_READ_CAPABILITIES,
  isTeamScopedViewer,
} from '@/lib/warehouse/permissions'
import { getAsset, getLot } from '@/lib/warehouse/queries'
import {
  assertCanUploadSignedSubstituteReceipt,
  assertSubstituteReceiptInScope,
  SUBSTITUTE_RECEIPT_CAPABILITIES,
} from '@/lib/substitute-receipts/queries'

/**
 * ตัดสินสิทธิ์เข้าถึงไฟล์ใน bucket `case-documents` (BUG-143 · DEC-014) — **ทางเดียว** ที่ browser จะได้
 * URL/โทเคนของ Storage · bucket ไม่มี policy ให้ `authenticated` แล้ว (DEC-002: สิทธิ์อยู่ที่ API layer)
 *
 * รูปแบบการปฏิเสธ (สม่ำเสมอทุก kind — UAT BUG-145 · มติ PO U64):
 * - **403 `PERMISSION_DENIED`** = ผู้เรียกไม่มี capability/ระดับ scope ของไฟล์ชนิดนั้นเลย — ตัดสินจาก role ล้วน
 *   ก่อนแตะข้อมูลใด ๆ ⇒ ผลเหมือนกันทุก id ไม่ว่ารายการมีจริงหรือไม่ (ไม่ leak)
 * - **404 NOT_FOUND ของโมดูลเจ้าของ** = มี capability แต่รายการ "ไม่มี" หรือ "อยู่นอก scope" — สองกรณีนี้ต้องตอบเหมือนกันเป๊ะ
 *   (เคส `CASE_NOT_FOUND`/`ASSIGNMENT_NOT_FOUND` · เครื่อง/ล็อต · ใบกำกับ · เงินทดรอง `ADVANCE_NOT_FOUND`
 *   · ใบเสร็จของคนอื่น `EXPENSE_NOT_FOUND` · 50 ทวิ ลูกค้า · รายการเดินบัญชี)
 * - ห้ามโยน 403 หลังจากรู้แล้วว่ารายการเป็นของใคร (เช่น ใบเสร็จของพนักงานอื่น) — ใช้ 404 แทน
 *
 * กติกา = "ทำ action ปลายทางได้ ⇒ ได้โทเคน" — ใช้ capability + scope ตัวเดียวกับ endpoint ที่ผูก/แสดงไฟล์นั้น
 * (ออกโทเคนให้แล้วก็ยังต้องผ่าน `verify.ts` ตอนผูกไฟล์เข้าข้อมูลเหมือนเดิม)
 *
 * ⚠️ ฝั่ง server เท่านั้น
 */

/**
 * ผู้อัปโหลดใบเสร็จได้ (`expenses/<ผู้อัปโหลด>/receipts/…`) — พนักงานภาคสนาม (ค่าที่พัก) · ผู้สร้างรายการเบิกด้วยมือ
 * (การเงิน · มติ PO U143) · ผู้เคลียร์เงินทดรอง (เจ้าของคำขอ / การเงิน) ⇒ capability เดียวกับ endpoint ที่ผูกไฟล์
 */
export const EXPENSE_RECEIPT_UPLOAD_CAPABILITIES = [
  FIELD_CAPABILITY,
  'approve_expense_finance',
  REQUEST_ADVANCE,
  APPROVE_ADVANCE,
] as const

/** capability ที่เข้าใกล้การอัปโหลดได้อย่างน้อยหนึ่งทาง — ยามชั้นแรกของ route (ตรวจละเอียดต่อ target ด้านล่าง) */
export const STORAGE_UPLOAD_CAPABILITIES = [
  CASE_WRITE_CAPABILITY,
  FIELD_CAPABILITY,
  WAREHOUSE_INTAKE_CAPABILITY,
  WAREHOUSE_CONFIRM_LOT_CAPABILITY,
  MANAGE_TAX_INVOICE,
  APPROVE_ADVANCE,
  MANAGE_CUSTOMER_WHT,
  MANAGE_BANK_RECONCILIATION,
  MANAGE_ORGANIZATION_PROFILE,
  MANAGE_COMPANIES,
  // มติ PO U143 — ผู้สร้างรายการเบิกด้วยมือ / ผู้เคลียร์เงินทดรองแนบใบเสร็จเองได้
  'approve_expense_finance',
  REQUEST_ADVANCE,
  // มติ PO U150 — เอกสารยืนยันตัวตนผู้รับเงิน
  MANAGE_PAYEE_PROFILE_CAPABILITY,
  // มติ PO U166 — ไฟล์ฐาน TAC ที่นำเข้าเอง
  MANAGE_DEVICE_CATALOG_CAPABILITY,
] as const

/**
 * ผู้ตรวจใบเสร็จเบิกแยกของคนอื่นได้ทั้งองค์กร (การเงิน/ผู้บริหาร/บัญชีค่าใช้จ่าย)
 * ผู้จัดการทีม (ขั้น 1) เปิดได้เฉพาะใบเสร็จของรายการในทีมที่ตนดูแล (มติ PO U152 — ตรวจที่ `assertCanView`)
 */
export const RECEIPT_REVIEW_CAPABILITIES = [
  'approve_expense_finance',
  'approve_expense_executive',
  MANAGE_SALES_EXPENSES,
  MAP_COST_CENTER,
] as const

/** ผู้อนุมัติขั้นผู้จัดการ (`16` §10 — scope ทีมที่ดูแล) */
const APPROVAL_MANAGER_CAPABILITY = 'approve_expense_manager'

/** capability ที่เปิดดูไฟล์ได้อย่างน้อยหนึ่งชนิด — ยามชั้นแรกของ route */
export const STORAGE_VIEW_CAPABILITIES: readonly string[] = [
  ...new Set<string>([
    ...CASE_READ_CAPABILITIES,
    FIELD_CAPABILITY,
    ...WAREHOUSE_READ_CAPABILITIES,
    ...RECEIPT_REVIEW_CAPABILITIES,
    ...SALES_READ_CAPABILITIES,
    APPROVE_ADVANCE,
    REQUEST_ADVANCE,
    // มติ PO U152 — ผู้อนุมัติขั้นผู้จัดการเปิดใบเสร็จจากคิวอนุมัติ (scope ทีม)
    APPROVAL_MANAGER_CAPABILITY,
    // มติ PO U150 — เอกสารยืนยันตัวตนผู้รับเงิน (การเงินทั้งองค์กร · ผู้รับเห็นของตัวเอง)
    MANAGE_PAYEE_PROFILE_CAPABILITY,
    MANAGE_CUSTOMER_WHT,
    MANAGE_BANK_RECONCILIATION,
    VIEW_ORGANIZATION_PROFILE,
    VIEW_COMPANY_DOCUMENTS,
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
    case 'advance_return':
      return advanceReturnFileRule(target.advanceId)
    case 'customer_wht':
      return customerWhtFileRule(target.certificateId)
    case 'bank_refund':
      return bankRefundFileRule(target.transactionId)
    case 'organization_logo':
      return organizationLogoRule(target.organizationId)
    case 'organization_signature':
      return organizationSignatureRule(target.organizationId)
    case 'substitute_receipt':
      return substituteReceiptFileRule(target.substituteReceiptId)
    case 'company_document':
      return companyDocumentRule(target.companyId, target.documentType)
    case 'payee_id_document':
      return payeeIdDocumentRule(user.organizationId)
    case 'device_tac_file':
      // CSV ไม่มี magic bytes ⇒ ไม่ผ่าน `inspectUploadedBytes()` · route นำเข้าตรวจรูปแบบเอง (มติ PO U166)
      return { prefix: deviceTacFilePrefix(user.organizationId), accept: [], maxBytes: DEVICE_TAC_FILE_MAX_BYTES }
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
      // path ผูกกับผู้อัปโหลดเสมอ — ผู้มีสิทธิ์สร้าง/เคลียร์รายการที่แนบใบเสร็จได้ (มติ PO U143)
      return requireAnyPermission('manage', EXPENSE_RECEIPT_UPLOAD_CAPABILITIES)
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
    case 'advance_return': {
      // แนบหลักฐานรับคืน = บันทึกรับคืนแยก ⇒ สิทธิ์เดียวกับ endpoint บันทึก (การเงิน `manage:approve_advance`)
      const user = await requirePermission('manage', APPROVE_ADVANCE)
      await assertAdvanceInScope(user, target.advanceId)
      return user
    }
    case 'customer_wht': {
      // แนบสแกน 50 ทวิ ของลูกค้า = บันทึกรับหนังสือ ⇒ สิทธิ์เดียวกับ endpoint รับหนังสือ (มติ PO U40)
      const user = await requirePermission('manage', MANAGE_CUSTOMER_WHT)
      await assertCustomerWhtInScope(user, target.certificateId, { requirePending: true })
      return user
    }
    case 'bank_refund': {
      // หลักฐานคืนเงินผู้โอน = บันทึกคืนเงิน ⇒ สิทธิ์กระทบยอดธนาคาร (มติ PO U41)
      const user = await requirePermission('manage', MANAGE_BANK_RECONCILIATION)
      await assertBankTransactionInScope(user, target.transactionId, { requireSuspense: true })
      return user
    }
    case 'organization_logo': {
      // โลโก้บนหัวเอกสาร = แก้ข้อมูลองค์กร ⇒ สิทธิ์เดียวกับ endpoint ผูกโลโก้ (Superadmin — มติ PO U99)
      const user = await requirePermission('manage', MANAGE_ORGANIZATION_PROFILE)
      if (target.organizationId !== user.organizationId) throw denied(user, `upload:organization-logo org=${target.organizationId}`)
      return user
    }
    case 'organization_signature': {
      // รูปลายเซ็นผู้มีอำนาจ = แก้ข้อมูลองค์กร ⇒ สิทธิ์เดียวกับ endpoint ผูกรูป (Superadmin — มติ PO U122)
      const user = await requirePermission('manage', MANAGE_ORGANIZATION_PROFILE)
      if (target.organizationId !== user.organizationId) {
        throw denied(user, `upload:organization-signature org=${target.organizationId}`)
      }
      return user
    }
    case 'substitute_receipt': {
      // ฉบับเซ็นของใบรับรองแทนใบเสร็จ (มติ PO U103) — เจ้าของใบหรือการเงิน ⇒ ยามเดียวกับ endpoint ผูกไฟล์
      const user = await requireAnyPermission('view', SUBSTITUTE_RECEIPT_CAPABILITIES)
      await assertCanUploadSignedSubstituteReceipt(user, target.substituteReceiptId)
      return user
    }
    case 'company_document': {
      // แนบเอกสารบริษัท = แก้ข้อมูลบริษัท ⇒ สิทธิ์เดียวกับ endpoint ผูกไฟล์ (Superadmin `manage_companies` — มติ PO U132)
      const user = await requirePermission('manage', MANAGE_COMPANIES)
      await assertCompanyDocumentAccess(user, target.companyId)
      return user
    }
    case 'payee_id_document':
      // แนบเอกสารยืนยันตัวตน = แก้ข้อมูลผู้รับเงิน ⇒ สิทธิ์เดียวกับ endpoint ผู้รับเงิน/ฟอร์มผู้ใช้ (มติ PO U150)
      return requirePermission('manage', MANAGE_PAYEE_PROFILE_CAPABILITY)
    case 'device_tac_file':
      // นำเข้าไฟล์ TAC เอง = แก้แคตตาล็อก Model Phone ⇒ สิทธิ์เดียวกับ endpoint นำเข้า (มติ PO U166)
      return requirePermission('manage', MANAGE_DEVICE_CATALOG_CAPABILITY)
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
  const path = uploadTargetPath(input.target, user.id, input.fileName, input.uniqueKey, user.organizationId)
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

async function assertCanView(user: SessionUser, owner: StoragePathOwner, path: string): Promise<void> {
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
      if (hasAny(user, 'view', RECEIPT_REVIEW_CAPABILITIES)) return
      const canOwn = hasAny(user, 'view', EXPENSE_RECEIPT_UPLOAD_CAPABILITIES)
      const asManager = hasAny(user, 'view', [APPROVAL_MANAGER_CAPABILITY])
      if (!canOwn && !asManager) throw denied(user, `view:receipt owner=${owner.userId}`)
      if (canOwn && owner.userId === user.id) return
      // มติ PO U152/U153 — ใบเสร็จที่ผู้อื่นแนบให้รายการของผู้เรียก (การเงินบันทึกแทน) หรือรายการในทีมที่ผู้จัดการดูแล
      if (await isReceiptVisibleViaExpense(user, path, { asManager })) return
      // ใบเสร็จของพนักงานคนอื่น = นอก scope ⇒ ตอบเหมือน "ไม่มีรายการเบิกนี้" (ไม่ leak — UAT BUG-145)
      throw new ExpenseStateError('EXPENSE_NOT_FOUND', { detail: `view:receipt owner=${owner.userId} user=${user.id}` })
    }
    case 'tax_invoice': {
      if (!hasAny(user, 'view', SALES_READ_CAPABILITIES)) throw denied(user, `view:credit-note invoice=${owner.taxInvoiceId}`)
      await assertTaxInvoiceInScope(user, owner.taxInvoiceId)
      return
    }
    case 'advance': {
      // การเงินเห็นทุกราย · เจ้าของเงินทดรองเห็นของตัวเอง (scope เดียวกับหน้าเงินทดรอง)
      if (!hasAny(user, 'view', [APPROVE_ADVANCE, REQUEST_ADVANCE])) {
        throw denied(user, `view:advance-return advance=${owner.advanceId}`)
      }
      await assertAdvanceInScope(user, owner.advanceId)
      return
    }
    case 'customer_wht': {
      if (!hasAny(user, 'view', [MANAGE_CUSTOMER_WHT])) throw denied(user, `view:customer-wht id=${owner.certificateId}`)
      await assertCustomerWhtInScope(user, owner.certificateId)
      return
    }
    case 'bank_transaction': {
      if (!hasAny(user, 'view', [MANAGE_BANK_RECONCILIATION])) {
        throw denied(user, `view:bank-refund tx=${owner.transactionId}`)
      }
      await assertBankTransactionInScope(user, owner.transactionId)
      return
    }
    case 'organization_logo': {
      // โลโก้ไม่ใช่ข้อมูลส่วนบุคคล — ผู้ดูข้อมูลองค์กรได้เห็นได้ · องค์กรอื่น = ปฏิเสธเหมือนกันทุกกรณี
      if (!hasAny(user, 'view', [VIEW_ORGANIZATION_PROFILE, MANAGE_ORGANIZATION_PROFILE])) {
        throw denied(user, `view:organization-logo org=${owner.organizationId}`)
      }
      if (owner.organizationId !== user.organizationId) throw denied(user, `view:organization-logo org=${owner.organizationId}`)
      return
    }
    case 'organization_signature': {
      // ลายเซ็นผู้มีอำนาจเป็นข้อมูลอ่อนไหว (ปลอมแปลงได้) — เปิดไฟล์ได้เฉพาะผู้มีสิทธิ์แก้ข้อมูลองค์กร
      // (PDF ที่ออกแล้วฝังรูปฝั่ง server ด้วย service role — ไม่ผ่านด่านนี้)
      if (!hasAny(user, 'manage', [MANAGE_ORGANIZATION_PROFILE])) {
        throw denied(user, `view:organization-signature org=${owner.organizationId}`)
      }
      if (owner.organizationId !== user.organizationId) {
        throw denied(user, `view:organization-signature org=${owner.organizationId}`)
      }
      return
    }
    case 'substitute_receipt': {
      if (!hasAny(user, 'view', SUBSTITUTE_RECEIPT_CAPABILITIES)) {
        throw denied(user, `view:substitute-receipt id=${owner.substituteReceiptId}`)
      }
      await assertSubstituteReceiptInScope(user, owner.substituteReceiptId)
      return
    }
    case 'finance_company': {
      // เอกสารบริษัท (มติ PO U132) — ผู้ดูข้อมูลบริษัทได้ (view_master_data) เห็นได้ · ผู้ใช้บริษัท (พอร์ทัล) ไม่เห็น
      if (!hasAny(user, 'view', [VIEW_COMPANY_DOCUMENTS, MANAGE_COMPANIES])) {
        throw denied(user, `view:company-document company=${owner.companyId}`)
      }
      await assertCompanyDocumentAccess(user, owner.companyId)
      return
    }
    case 'device_tac_file': {
      // ไฟล์ TAC ที่นำเข้าเอง (มติ PO U166) — ผู้ดูแลแคตตาล็อกขององค์กรเดียวกันเท่านั้น
      if (!hasAny(user, 'view', [MANAGE_DEVICE_CATALOG_CAPABILITY]) || owner.organizationId !== user.organizationId) {
        throw denied(user, `view:device-tac-file org=${owner.organizationId}`)
      }
      return
    }
    case 'payee_id_document': {
      // มติ PO U150 — การเงิน (`manage`) เห็นทั้งองค์กร · ผู้ถือแค่ `view` (ผู้รับเงิน) เห็นเฉพาะเอกสารบนผู้รับของตัวเอง
      if (!hasAny(user, 'view', [MANAGE_PAYEE_PROFILE_CAPABILITY])) {
        throw denied(user, `view:payee-id-document org=${owner.organizationId}`)
      }
      if (owner.organizationId !== user.organizationId) {
        throw new PayeeError('PAYEE_NOT_FOUND', { detail: `view:payee-id-document org=${owner.organizationId}` })
      }
      if (hasAny(user, 'manage', [MANAGE_PAYEE_PROFILE_CAPABILITY])) return
      const own = await prisma.payeeProfile.findFirst({
        where: { organizationId: user.organizationId, userId: user.id, idDocumentUrl: path, deletedAt: null },
        select: { id: true },
      })
      if (own === null) throw new PayeeError('PAYEE_NOT_FOUND', { detail: `view:payee-id-document user=${user.id}` })
      return
    }
  }
}

/**
 * ผู้รับเงินที่อ้างเอกสารยืนยันตัวตน path นี้ — ใช้ระบุเป้าหมายของ audit การเปิดไฟล์ (มติ PO U150 · U90)
 * ยังไม่มีผู้รับอ้าง (เพิ่งอัปโหลดในฟอร์มที่ยังไม่บันทึก) = `null`
 */
export async function payeeIdOfIdDocument(organizationId: string, path: string): Promise<string | null> {
  const row = await prisma.payeeProfile.findFirst({
    where: { organizationId, idDocumentUrl: path, deletedAt: null },
    select: { id: true },
  })
  return row?.id ?? null
}

/**
 * ตรวจสิทธิ์เปิดดูไฟล์ตาม **เจ้าของ path** (เคส/เครื่อง/ล็อต/ผู้เบิก) — path นอกโครงที่ระบบสร้าง = `UPLOAD_PATH_OUT_OF_SCOPE`
 * นอก scope = NOT_FOUND ของโมดูลนั้น (ไม่ leak ว่ามีรายการของบริษัท/ทีมอื่น)
 */
export async function authorizeDownload(user: SessionUser, path: string): Promise<void> {
  const owner = parseStoragePath(path)
  if (owner === null) throw new UploadError('UPLOAD_PATH_OUT_OF_SCOPE', { detail: path })
  await assertCanView(user, owner, path)
}
