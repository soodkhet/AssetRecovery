import { ADJUSTMENT_TYPE_LABEL } from '@/lib/adjustments/adjustment'
import { advanceExcessItemLabel } from '@/lib/advances/advance'
import {
  adjustmentRefLabel,
  assignmentRefLabel,
  auditRefKey,
  bankAccountRefLabel,
  bankFileFormatRefLabel,
  bankTransactionRefLabel,
  caseRefLabel,
  caseScopedRefLabel,
  cashReceiptRefLabel,
  companyDocumentRefLabel,
  costCenterRefLabel,
  customerWhtRefLabel,
  deviceTacRefLabel,
  effectiveVersionRefLabel,
  expenseRefLabel,
  exportRecordRefLabel,
  fieldDaySettlementRefLabel,
  groupAuditRefs,
  holidayRefLabel,
  jobRefLabel,
  payeeAmountRefLabel,
  reassignmentRefLabel,
  shortRefText,
  signedAdjustmentDisplaySatang,
  taxProfileDefaultRefLabel,
  vatRateRefLabel,
  versionedRefLabel,
  type AuditRef,
  type AuditRefType,
} from '@/lib/audit/target-refs'
import { DOCUMENT_SLOT_LABEL, DOCUMENT_SLOTS, type DocumentSlot } from '@/lib/cases/case'
import { CASE_STATUS_LABEL } from '@/lib/cases/status-display'
import { DOCUMENT_NUMBER_LABEL } from '@/lib/document-numbering/format'
import { exportVersionLabel } from '@/lib/exports/pack'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { checkinTypeLabel } from '@/lib/field/evidence-review-ui'
import { COMPANY_DOCUMENT_LABEL } from '@/lib/finance-companies/documents'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import { JOB_TYPE_SPECS, JOB_TYPES, type JobTypeCode } from '@/lib/jobs/job-types'
import { payeeLegalName } from '@/lib/payees/payee'
import { prisma } from '@/lib/prisma'
import { SETTING_ASSUMPTION_KEYS, SETTING_ASSUMPTIONS, type SettingAssumptionKey } from '@/lib/settings/assumptions'
import { maskAccountNumber } from '@/lib/settings/bank-account'
import { TEMPLATE_DOCUMENT_TYPE_LABEL } from '@/lib/settings/tax-doc-template'

/**
 * known H-06 — ค้นชื่อ/เลขเอกสารของ id ในบันทึกการใช้งานแบบ **batch**: 1 query ต่อชนิดเป้าหมาย (ไม่ใช่ต่อแถว)
 * กรอง `organization_id` ของผู้เรียกทุก query (Rule 02) · แถวที่ถูกลบแบบ soft delete ยังแสดงชื่อได้ (ประวัติย้อนหลัง)
 * ผลลัพธ์ = Map ของ `ชนิด:id` (ตัวพิมพ์เล็ก) → ป้าย · id ที่หาไม่พบไม่อยู่ใน Map (หน้าจอแสดง id ย่อแทน)
 */

type Labeled = { id: string; label: string }

const JOB_TYPE_SET: ReadonlySet<string> = new Set(JOB_TYPES)

/** ชื่องานเบื้องหลัง — ชนิดที่ไม่รู้จัก (งานเก่า) แสดงรหัสเดิม */
function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_SET.has(jobType) ? JOB_TYPE_SPECS[jobType as JobTypeCode].label : jobType
}
type Resolver = (organizationId: string, ids: string[]) => Promise<Labeled[]>

// ── mytester5 H5-01 — select/ป้ายย่อยที่ใช้ซ้ำหลายชนิด ────────────────────────────────────────

const caseLabelSelect = { caseRef: true, trackingRound: true } as const
const payeeLabelSelect = { payeeType: true, legalName: true, user: { select: { fullName: true } } } as const

type CaseLabelRow = { caseRef: string; trackingRound: number }
type PayeeLabelRow = { payeeType: 'individual' | 'corporate'; legalName: string | null; user: { fullName: string } }

function caseText(row: CaseLabelRow): string {
  return caseRefLabel(row.caseRef, row.trackingRound)
}

function payeeText(row: PayeeLabelRow): string {
  return payeeLegalName({ payeeType: row.payeeType, legalName: row.legalName, userFullName: row.user.fullName })
}

const DOCUMENT_SLOT_SET: ReadonlySet<string> = new Set(DOCUMENT_SLOTS)
const ASSUMPTION_KEY_SET: ReadonlySet<string> = new Set(SETTING_ASSUMPTION_KEYS)

/** เลขอ้างอิงของต้นทางรายการปรับปรุง (รายได้/รายการเบิก = เลขเคส · รอบวางบิล/รอบจ่าย = เลข/ชื่อรอบ) */
function adjustmentTargetText(row: {
  revenue: { case: CaseLabelRow } | null
  expense: { case: CaseLabelRow | null; payee: PayeeLabelRow } | null
  billingBatch: { batchNumber: string } | null
  payoutBatch: { name: string } | null
}): string {
  if (row.revenue !== null) return caseText(row.revenue.case)
  if (row.expense !== null) return row.expense.case !== null ? caseText(row.expense.case) : payeeText(row.expense.payee)
  if (row.billingBatch !== null) return row.billingBatch.batchNumber
  return row.payoutBatch?.name ?? '—'
}

const RESOLVERS: Readonly<Record<AuditRefType, Resolver>> = {
  cases: async (organizationId, ids) =>
    (
      await prisma.case.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, caseRef: true, trackingRound: true },
      })
    ).map((row) => ({ id: row.id, label: caseRefLabel(row.caseRef, row.trackingRound) })),
  assets: async (organizationId, ids) =>
    (
      await prisma.asset.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, caseRef: true } })
    ).map((row) => ({ id: row.id, label: `เครื่องของเคส ${row.caseRef}` })),
  handover_lots: async (organizationId, ids) =>
    (
      await prisma.handoverLot.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, lotNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.lotNumber })),
  billing_batches: async (organizationId, ids) =>
    (
      await prisma.billingBatch.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, batchNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.batchNumber })),
  accounting_periods: async (organizationId, ids) =>
    (
      await prisma.accountingPeriod.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, periodLabel: true },
      })
    ).map((row) => ({ id: row.id, label: row.periodLabel })),
  exceptions: async (organizationId, ids) =>
    (
      await prisma.exception.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, title: true } })
    ).map((row) => ({ id: row.id, label: row.title })),
  payout_batches: async (organizationId, ids) =>
    (
      await prisma.payoutBatch.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  tax_invoices: async (organizationId, ids) =>
    (
      await prisma.taxInvoice.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, invoiceNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.invoiceNumber })),
  credit_notes: async (organizationId, ids) =>
    (
      await prisma.creditNote.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, creditNoteNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.creditNoteNumber })),
  wht_certificates: async (organizationId, ids) =>
    (
      await prisma.whtCertificate.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, certificateNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.certificateNumber })),
  advances: async (organizationId, ids) =>
    (
      await prisma.advance.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, advanceNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.advanceNumber })),
  substitute_receipts: async (organizationId, ids) =>
    (
      await prisma.substituteReceipt.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, receiptNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.receiptNumber })),
  users: async (organizationId, ids) =>
    (
      await prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, fullName: true } })
    ).map((row) => ({ id: row.id, label: row.fullName })),
  teams: async (organizationId, ids) =>
    (
      await prisma.team.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  finance_companies: async (organizationId, ids) =>
    (
      await prisma.financeCompany.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, name: true },
      })
    ).map((row) => ({ id: row.id, label: row.name })),
  compensation_plans: async (organizationId, ids) =>
    (
      await prisma.compensationPlan.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, name: true, version: true },
      })
    ).map((row) => ({ id: row.id, label: `${row.name} (ฉบับที่ ${row.version})` })),
  export_records: async (organizationId, ids) =>
    (
      await prisma.exportRecord.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, version: true, period: { select: { periodLabel: true } } },
      })
    ).map((row) => ({ id: row.id, label: exportRecordRefLabel(row.period.periodLabel, exportVersionLabel(row.version)) })),
  device_brands: async (organizationId, ids) =>
    (
      await prisma.deviceBrand.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  bank_transactions: async (organizationId, ids) =>
    (
      await prisma.bankTransaction.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, transactionDate: true, amountSatang: true, bankAccount: { select: { bankName: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: bankTransactionRefLabel(
        fmtDate(row.transactionDate),
        fmtSatangSymbol(row.amountSatang),
        row.bankAccount.bankName,
      ),
    })),
  cash_receipts: async (organizationId, ids) =>
    (
      await prisma.cashReceipt.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, amountSatang: true, billingBatch: { select: { batchNumber: true } } },
      })
    ).map((row) => ({ id: row.id, label: cashReceiptRefLabel(row.billingBatch.batchNumber, fmtSatangSymbol(row.amountSatang)) })),
  // mytester5 A5-01 — รายการตั้งค่า
  tax_profiles: async (organizationId, ids) =>
    (
      await prisma.taxProfile.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  tax_profile_default_history: async (organizationId, ids) =>
    (
      await prisma.taxProfileDefaultHistory.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, label: taxProfileDefaultRefLabel(fmtDateTime(row.createdAt)) })),
  bank_accounts: async (organizationId, ids) =>
    (
      await prisma.bankAccount.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, bankName: true, accountNumber: true },
      })
    ).map((row) => ({ id: row.id, label: bankAccountRefLabel(row.bankName, maskAccountNumber(row.accountNumber)) })),
  billing_payout_cycles: async (organizationId, ids) =>
    (
      await prisma.billingPayoutCycle.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  approval_matrices: async (organizationId, ids) =>
    (
      await prisma.approvalMatrix.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, condition: true },
      })
    ).map((row) => ({ id: row.id, label: row.condition })),
  cost_centers: async (organizationId, ids) =>
    (
      await prisma.costCenter.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, code: true, name: true },
      })
    ).map((row) => ({ id: row.id, label: costCenterRefLabel(row.code, row.name) })),
  document_number_series: async (organizationId, ids) =>
    (
      await prisma.documentNumberSeries.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, docType: true },
      })
    ).map((row) => ({ id: row.id, label: DOCUMENT_NUMBER_LABEL[row.docType] })),
  bank_file_formats: async (organizationId, ids) =>
    (
      await prisma.bankFileFormat.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, purpose: true, bankName: true },
      })
    ).map((row) => ({ id: row.id, label: bankFileFormatRefLabel(row.purpose, row.bankName) })),
  service_fee_templates: async (organizationId, ids) =>
    (
      await prisma.serviceFeeTemplate.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, name: true, version: true },
      })
    ).map((row) => ({ id: row.id, label: versionedRefLabel(row.name, row.version) })),
  finance_company_documents: async (organizationId, ids) =>
    (
      await prisma.financeCompanyDocument.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, documentType: true, title: true, version: true, company: { select: { name: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: companyDocumentRefLabel(
        row.title !== null && row.title.trim() !== '' ? row.title : COMPANY_DOCUMENT_LABEL[row.documentType],
        row.company.name,
        row.version,
      ),
    })),
  payee_profiles: async (organizationId, ids) =>
    (
      await prisma.payeeProfile.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, payeeType: true, legalName: true, user: { select: { fullName: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: payeeLegalName({ payeeType: row.payeeType, legalName: row.legalName, userFullName: row.user.fullName }),
    })),
  public_holidays: async (organizationId, ids) =>
    (
      await prisma.publicHoliday.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, holidayDate: true, name: true },
      })
    ).map((row) => ({ id: row.id, label: holidayRefLabel(fmtDate(row.holidayDate), row.name) })),
  tax_document_template_settings: async (organizationId, ids) =>
    (
      await prisma.taxDocumentTemplateSettings.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, documentType: true },
      })
    ).map((row) => ({ id: row.id, label: TEMPLATE_DOCUMENT_TYPE_LABEL[row.documentType] })),
  device_models: async (organizationId, ids) =>
    (
      await prisma.deviceModel.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, name: true, brand: { select: { name: true } } },
      })
    ).map((row) => ({ id: row.id, label: `${row.brand.name} ${row.name}` })),
  jobs: async (organizationId, ids) =>
    (
      await prisma.job.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, jobType: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, label: jobRefLabel(jobTypeLabel(row.jobType), fmtDateTime(row.createdAt)) })),
  // mytester5 H5-01 — ธุรกรรมการเงิน
  expenses: async (organizationId, ids) =>
    (
      await prisma.expense.findMany({
        where: { organizationId, id: { in: ids } },
        select: {
          id: true,
          expenseType: true,
          grossSatang: true,
          revisionNote: true,
          case: { select: caseLabelSelect },
          payee: { select: payeeLabelSelect },
        },
      })
    ).map((row) => ({
      id: row.id,
      label: expenseRefLabel(
        // ตรวจซ้ำ staging SV5-R-04 — คำขอเบิกส่วนเกินเงินทดรอง ⇒ "ส่วนเกินเงินทดรอง ADV-…" (ป้ายเดียวกับคิวอนุมัติ F5-03)
        advanceExcessItemLabel(row.revisionNote) ?? EXPENSE_TYPE_LABEL[row.expenseType],
        row.case !== null ? caseText(row.case) : payeeText(row.payee),
        fmtSatangSymbol(row.grossSatang),
      ),
    })),
  expense_records: async (organizationId, ids) =>
    (
      await prisma.expenseRecord.findMany({
        where: { organizationId, id: { in: ids } },
        select: {
          id: true,
          grossSatang: true,
          payoutBatchItem: { select: { payee: { select: payeeLabelSelect }, payoutBatch: { select: { name: true } } } },
        },
      })
    ).map((row) => ({
      id: row.id,
      label: payeeAmountRefLabel(
        payeeText(row.payoutBatchItem.payee),
        fmtSatangSymbol(row.grossSatang),
        row.payoutBatchItem.payoutBatch.name,
      ),
    })),
  payout_batch_items: async (organizationId, ids) =>
    (
      await prisma.payoutBatchItem.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, netSatang: true, payee: { select: payeeLabelSelect }, payoutBatch: { select: { name: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: payeeAmountRefLabel(payeeText(row.payee), fmtSatangSymbol(row.netSatang), row.payoutBatch.name),
    })),
  adjustments: async (organizationId, ids) =>
    (
      await prisma.adjustment.findMany({
        where: { organizationId, id: { in: ids } },
        select: {
          id: true,
          adjustmentType: true,
          amountSatang: true,
          revenue: { select: { case: { select: caseLabelSelect } } },
          expense: { select: { case: { select: caseLabelSelect }, payee: { select: payeeLabelSelect } } },
          billingBatch: { select: { batchNumber: true } },
          payoutBatch: { select: { name: true } },
        },
      })
    ).map((row) => ({
      id: row.id,
      label: adjustmentRefLabel(
        ADJUSTMENT_TYPE_LABEL[row.adjustmentType],
        adjustmentTargetText(row),
        fmtSatangSymbol(signedAdjustmentDisplaySatang(row.adjustmentType, row.amountSatang)),
      ),
    })),
  advance_returns: async (organizationId, ids) =>
    (
      await prisma.advanceReturn.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, returnNumber: true },
      })
    ).map((row) => ({ id: row.id, label: row.returnNumber })),
  customer_wht_certificates: async (organizationId, ids) =>
    (
      await prisma.customerWhtCertificate.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, withheldSatang: true, certificateNumber: true, company: { select: { name: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: customerWhtRefLabel(row.company.name, fmtSatangSymbol(row.withheldSatang), row.certificateNumber),
    })),
  sales_records: async (organizationId, ids) =>
    (
      await prisma.salesRecord.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, totalSatang: true, billingBatch: { select: { batchNumber: true } } },
      })
    ).map((row) => ({ id: row.id, label: `${row.billingBatch.batchNumber} ${fmtSatangSymbol(row.totalSatang)}` })),
  revenues: async (organizationId, ids) =>
    (
      await prisma.revenue.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, totalSatang: true, case: { select: caseLabelSelect } },
      })
    ).map((row) => ({ id: row.id, label: `${caseText(row.case)} ${fmtSatangSymbol(row.totalSatang)}` })),
  payee_recoveries: async (organizationId, ids) =>
    (
      await prisma.payeeRecovery.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, amountSatang: true, payee: { select: payeeLabelSelect } },
      })
    ).map((row) => ({ id: row.id, label: payeeAmountRefLabel(payeeText(row.payee), fmtSatangSymbol(row.amountSatang)) })),
  payee_recovery_collections: async (organizationId, ids) =>
    (
      await prisma.payeeRecoveryCollection.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, amountSatang: true, payee: { select: payeeLabelSelect }, payoutBatch: { select: { name: true } } },
      })
    ).map((row) => ({
      id: row.id,
      label: payeeAmountRefLabel(payeeText(row.payee), fmtSatangSymbol(row.amountSatang), row.payoutBatch.name),
    })),
  field_day_settlements: async (organizationId, ids) =>
    (
      await prisma.fieldDaySettlement.findMany({
        where: { organizationId, id: { in: ids } },
        select: {
          id: true,
          fieldDate: true,
          fuelTotalSatang: true,
          allowanceTotalSatang: true,
          agent: { select: { fullName: true } },
        },
      })
    ).map((row) => ({
      id: row.id,
      label: fieldDaySettlementRefLabel(
        row.agent.fullName,
        fmtDate(row.fieldDate),
        // ยอดรวมของวัน (ค่าน้ำมันเหมา + เบี้ยเลี้ยง) — จำนวนเต็มสตางค์ บวกกันเพื่อแสดงผลเท่านั้น
        fmtSatangSymbol(row.fuelTotalSatang + row.allowanceTotalSatang),
      ),
    })),
  // ── ภาคสนาม / เคส
  case_documents: async (organizationId, ids) =>
    (
      await prisma.caseDocument.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, documentType: true, originalName: true, case: { select: caseLabelSelect } },
      })
    ).map((row) => ({
      id: row.id,
      label: caseScopedRefLabel(
        caseText(row.case),
        DOCUMENT_SLOT_SET.has(row.documentType) ? DOCUMENT_SLOT_LABEL[row.documentType as DocumentSlot] : row.originalName,
      ),
    })),
  case_evidences: async (organizationId, ids) =>
    (
      await prisma.caseEvidence.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, outcome: true, submittedAt: true, case: { select: caseLabelSelect } },
      })
    ).map((row) => ({
      id: row.id,
      label: caseScopedRefLabel(caseText(row.case), `${CASE_STATUS_LABEL[row.outcome]} ${fmtDateTime(row.submittedAt)}`),
    })),
  check_ins: async (organizationId, ids) =>
    (
      await prisma.checkIn.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, checkinType: true, checkedInAt: true, case: { select: caseLabelSelect } },
      })
    ).map((row) => ({
      id: row.id,
      label: caseScopedRefLabel(caseText(row.case), `${checkinTypeLabel(row.checkinType)} ${fmtDateTime(row.checkedInAt)}`),
    })),
  case_assignments: async (organizationId, ids) =>
    (
      await prisma.caseAssignment.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, case: { select: caseLabelSelect }, agent: { select: { fullName: true } } },
      })
    ).map((row) => ({ id: row.id, label: assignmentRefLabel(caseText(row.case), row.agent.fullName) })),
  // ร่างที่ส่งปิดงานแล้วถูกลบ ⇒ หาไม่พบ — หน้าจอใช้เคสในค่าหลังแทน (`auditTargetContextRef`)
  close_case_drafts: async (organizationId, ids) =>
    (
      await prisma.closeCaseDraft.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, case: { select: caseLabelSelect } },
      })
    ).map((row) => ({ id: row.id, label: caseText(row.case) })),
  pending_reassignments: async (organizationId, ids) =>
    (
      await prisma.pendingReassignment.findMany({
        where: { organizationId, id: { in: ids } },
        select: {
          id: true,
          case: { select: caseLabelSelect },
          fromAgent: { select: { fullName: true } },
          newAgent: { select: { fullName: true } },
        },
      })
    ).map((row) => ({
      id: row.id,
      label: reassignmentRefLabel(caseText(row.case), row.fromAgent.fullName, row.newAgent.fullName),
    })),
  // ── บัญชี / ค่าตั้ง
  accountant_questions: async (organizationId, ids) =>
    (
      await prisma.accountantQuestion.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, questionText: true },
      })
    ).map((row) => ({ id: row.id, label: shortRefText(row.questionText) })),
  wht_filing_summaries: async (organizationId, ids) =>
    (
      await prisma.whtFilingSummary.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, periodLabel: true },
      })
    ).map((row) => ({ id: row.id, label: row.periodLabel })),
  wht_policy_history: async (organizationId, ids) =>
    (
      await prisma.whtPolicyHistory.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, effectiveFrom: true },
      })
    ).map((row) => ({ id: row.id, label: effectiveVersionRefLabel(fmtDate(row.effectiveFrom)) })),
  vat_rate_history: async (organizationId, ids) =>
    (
      await prisma.vatRateHistory.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, ratePct: true, effectiveFrom: true },
      })
    ).map((row) => ({ id: row.id, label: vatRateRefLabel(fmtPercent(row.ratePct.toString()), fmtDate(row.effectiveFrom)) })),
  setting_assumption_confirmations: async (organizationId, ids) =>
    (
      await prisma.settingAssumptionConfirmation.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, assumptionKey: true },
      })
    ).map((row) => ({
      id: row.id,
      label: ASSUMPTION_KEY_SET.has(row.assumptionKey)
        ? SETTING_ASSUMPTIONS[row.assumptionKey as SettingAssumptionKey].label
        : row.assumptionKey,
    })),
  device_tacs: async (organizationId, ids) =>
    (
      await prisma.deviceTac.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, tac: true, brandName: true, modelName: true },
      })
    ).map((row) => ({ id: row.id, label: deviceTacRefLabel(row.tac, row.brandName, row.modelName) })),
  roles: async (organizationId, ids) =>
    (
      await prisma.role.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  // audit สิทธิ์ของบทบาทลง `target_id` = id ของบทบาท
  role_capabilities: async (organizationId, ids) =>
    (
      await prisma.role.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => ({ id: row.id, label: row.name })),
  // สมัครรับแจ้งเตือนลง id ของ subscription · ยกเลิก (ลบทุกอุปกรณ์ของผู้ใช้) ลง id ของผู้ใช้ ⇒ ค้นทั้งสองแบบ
  push_subscriptions: async (organizationId, ids) => {
    const [subscriptions, users] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, user: { select: { fullName: true } } },
      }),
      prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, fullName: true } }),
    ])
    return [
      ...subscriptions.map((row) => ({ id: row.id, label: row.user.fullName })),
      ...users.map((row) => ({ id: row.id, label: row.fullName })),
    ]
  },
}

/**
 * ผล = Map คีย์ `auditRefKey()` (ชนิด:id) → ป้าย — แยกตามชนิดเพราะ id เดียวกันอาจถูกแปลงต่างกัน
 * (mytester5 H5-01: id ผู้ใช้ในเป้าหมาย "การรับแจ้งเตือนบนอุปกรณ์")
 */
export async function resolveAuditRefLabels(organizationId: string, refs: readonly AuditRef[]): Promise<Map<string, string>> {
  const grouped = groupAuditRefs(refs)
  const results = await Promise.all(
    [...grouped].map(async ([type, ids]) => ({
      type,
      rows: ids.length === 0 ? [] : await RESOLVERS[type](organizationId, ids),
    })),
  )
  const labels = new Map<string, string>()
  for (const { type, rows } of results) {
    for (const row of rows) labels.set(auditRefKey({ type, id: row.id }), row.label)
  }
  return labels
}
