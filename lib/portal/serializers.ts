import { netInvoiceAmounts } from '@/lib/credit-notes/credit-note'
import { arOutstandingSatang } from '@/lib/finance/ar-calc'
import type {
  AssetCondition,
  AssignmentStatus,
  BillingBatchStatus,
  CaseStatus,
  HandoverLotStatus,
  HandoverType,
  InvoiceDeliveryFormat,
  ServiceFeeBasis,
  ServiceFeeModel,
  TaxInvoiceDocKind,
  TaxInvoiceStatus,
  VatMode,
} from '@/lib/generated/prisma/enums'
import { deviceAttributesText } from '@/lib/device-catalog/device-attributes'
import { formatBranch } from '@/lib/format/branch'
import { canAccess, type PortalCapabilities } from '@/lib/portal/access'
import {
  portalBillingStatusDisplay,
  portalCaseShowsReason,
  portalCaseStatusDisplay,
  portalLotDownloadable,
  portalLotStatusDisplay,
  portalTaxInvoiceStatusDisplay,
  type PortalBillingStatusCode,
  type PortalCaseStatusCode,
  type PortalLotStatusCode,
  type PortalStatusDisplay,
} from '@/lib/portal/status-map'
import { ROW_KEY, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { hasDebitNoteOutstanding, REVENUE_FEE_MODEL_LABEL } from '@/lib/revenue/revenue-ui'
import { TAX_INVOICE_DOC_KIND_TITLE } from '@/lib/sales/receipt-invoice'
import { intakePhotoAngleLabel } from '@/lib/warehouse/intake-photos'
import { INVOICE_DELIVERY_FORMAT_LABEL } from '@/lib/sales/sales'
import { SERVICE_FEE_BASIS_LABEL } from '@/lib/service-fee/template'
import { documentDeviceText } from '@/lib/warehouse/handover-doc'
import { ASSET_CONDITION_LABEL, HANDOVER_TYPE_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * Serializer ของพอร์ทัลบริษัทไฟแนนซ์ (`97` §6 · มติ PO 05/10/2569 U6/O43) — **whitelist ล้วน**
 *
 * ทุกฟังก์ชันประกอบ object ใหม่จากฟิลด์ที่ระบุทีละตัว (ห้าม spread แถวภายใน) ⇒ ฟิลด์ที่เพิ่มในตาราง
 * ภายหลังจะไม่หลุดออกพอร์ทัลเอง · input รับ "แถวภายใน" แบบ structural (query layer ส่งแถว Prisma
 * ที่มีฟิลด์มากกว่านี้ได้) แต่ output มีแค่ที่ `97` §6 อนุญาต
 *
 * ไม่ส่งออก: IMEI/serial ทรัพย์ · ชื่อ/เบอร์พนักงาน · ทีม · template/แผนค่าตอบแทน (ยกเว้นชื่อ+model ของ
 * template บริษัท `97` §6.6) · ต้นทุน/ค่าตอบแทน · หลักฐานภาคสนาม · บันทึก/ผู้พิจารณา · path ไฟล์ใน Storage
 *
 * เงิน = satang integer (UI หาร 100 เอง) · วันเวลา = ISO UTC / วันที่ล้วน `YYYY-MM-DD` (UI แปลง พ.ศ.)
 * · สถานะ = `statusDisplay` จาก `lib/portal/status-map.ts` (ไม่ส่ง raw enum ของเคส/ล็อต)
 */

function iso(value: Date): string {
  return value.toISOString()
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** คอลัมน์ `DATE` (เก็บเที่ยงคืน UTC) → `YYYY-MM-DD` */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function decimalToNumber(value: number | string | { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value.toString())
  return Number.isFinite(parsed) ? parsed : null
}

// ── เคส (`97` §6.1 + ค่าบริการ v4.1 §6.6) ───────────────────────────────────

export interface PortalCaseSource {
  id: string
  caseRef: string
  debtorName: string | null
  status: CaseStatus
  /** assignment ปัจจุบัน (ไม่นับ `reassigned_away`) — จับเคสถูกตีกลับ */
  assignmentStatus?: AssignmentStatus | null
  trackingRound: number
  /**
   * `cases.review_note` — แสดงเป็น `statusReason` เฉพาะ "ขอข้อมูลเพิ่มเติม"
   * · เคสไม่รับ = **หมายเหตุภายใน** ห้ามออกพอร์ทัล (มติผู้ใช้ 12/10/2569 I3-01)
   */
  reviewNote: string | null
  /** `cases.client_reject_reason` — เหตุผลไม่รับเคสที่แจ้งบริษัทไฟแนนซ์ (I3-01) */
  clientRejectReason: string | null
  createdAt: Date
}

/** ข้อความกลางของเคสที่ไม่รับซึ่งไม่มีเหตุผลที่แจ้งบริษัทไฟแนนซ์ (ปฏิเสธก่อนแยกช่อง — I3-01) */
export const PORTAL_DECLINED_GENERIC_REASON = 'เคสนี้ไม่ผ่านการพิจารณา — ติดต่อเจ้าหน้าที่เพื่อสอบถามรายละเอียด'

/**
 * เหตุผลที่พอร์ทัลแสดงต่อสถานะ (`97` §6.1 `status_reason` · มติผู้ใช้ 12/10/2569 I3-01)
 * - ไม่รับเคส → `client_reject_reason` เท่านั้น · ว่าง ⇒ ข้อความกลาง (ไม่ fallback ไป `review_note` ซึ่งเป็นหมายเหตุภายใน)
 * - ขอข้อมูลเพิ่มเติม → `review_note`
 * - สถานะอื่น → ไม่แสดง
 */
export function portalCaseStatusReason(
  code: PortalCaseStatusCode,
  row: Pick<PortalCaseSource, 'reviewNote' | 'clientRejectReason'>,
): string | null {
  if (!portalCaseShowsReason(code)) return null
  if (code === 'declined') {
    const reason = row.clientRejectReason?.trim() ?? ''
    return reason === '' ? PORTAL_DECLINED_GENERIC_REASON : reason
  }
  return row.reviewNote
}

export interface PortalCaseListItemDto {
  id: string
  caseRef: string
  debtorName: string | null
  statusDisplay: PortalStatusDisplay<PortalCaseStatusCode>
  statusReason: string | null
  createdAt: string
  /** รอบติดตาม — แสดงเฉพาะเคสที่เคย recycle (`tracking_round > 1`) */
  recycleRound: number | null
}

export function serializePortalCaseListItem(row: PortalCaseSource): PortalCaseListItemDto {
  const statusDisplay = portalCaseStatusDisplay({ status: row.status, assignmentStatus: row.assignmentStatus ?? null })
  return {
    id: row.id,
    caseRef: row.caseRef,
    debtorName: row.debtorName,
    statusDisplay,
    statusReason: portalCaseStatusReason(statusDisplay.code, row),
    createdAt: iso(row.createdAt),
    recycleRound: row.trackingRound > 1 ? row.trackingRound : null,
  }
}

export interface PortalCaseServiceFeeSource {
  serviceFeeModelSnapshot: ServiceFeeModel | null
  serviceFeeRatePct: number | string | { toString(): string } | null
  serviceFeeBaseSatang: number | null
  serviceFeeBasisSnapshot: ServiceFeeBasis | null
  serviceFeeFailFeeSatang: number | null
  projectedRevenueSatang: number | null
  /** staging E-073 — โหมด VAT **ปัจจุบัน**ของบริษัท (ใช้เป็นป้ายของยอดค่าบริการ) · ไม่ส่ง = ไม่ติดป้าย */
  companyVatMode?: VatMode | null
  /**
   * มติชั่วคราว M9 — รายได้จริงของเคส (แถวที่ยังไม่ถูกลบ) · ไม่ส่ง/`null` = ยังไม่เกิดรายได้
   * · มติ PO 12/10/2569 I2-01 — `creditNotes` = ใบลดหนี้ **active** ที่ผูกกับรายได้ของเคสผ่าน Adjustment (เรียงตามวันที่ออก)
   */
  revenue?: { totalSatang: number; vatSatang: number; creditNotes?: readonly PortalCaseCreditNoteSource[] } | null
}

/** ใบลดหนี้ที่ออกแล้วของเคส (มติ PO 12/10/2569 I2-01) — ยอดรวม VAT ตามเอกสาร */
export interface PortalCaseCreditNoteSource {
  creditNoteNumber: string
  totalSatang: number
}

/**
 * pure — ค่าบริการยอดจริงระดับเคส = ยอดรายได้ (รวม VAT) − ใบลดหนี้ที่ออกแล้ว (รวม VAT) · satang ล้วน
 * (มติ PO 12/10/2569 I2-01) · ลดเกินยอด ⇒ 0 (ไม่ติดลบ) · ผู้เรียกกรองใบที่ยกเลิก/ใบเพิ่มหนี้ออกมาแล้ว
 */
export function portalCaseNetRevenueSatang(revenueTotalSatang: number, creditNotes: readonly PortalCaseCreditNoteSource[]): number {
  const credited = creditNotes.reduce((sum, note) => sum + note.totalSatang, 0)
  return Math.max(0, revenueTotalSatang - credited)
}

/** staging E-073 (`97` §17) — ป้าย VAT ของยอดค่าบริการในพอร์ทัล (ภาษาไทย ไม่ส่ง enum) */
export const PORTAL_VAT_MODE_LABEL: Readonly<Record<VatMode, string>> = {
  exclude_vat: 'ก่อน VAT',
  include_vat: 'รวม VAT แล้ว',
  no_vat: 'ไม่มี VAT',
}

/** ทรัพย์ที่รับเข้าคลังของเคส (ใช้เฉพาะเคส "ติดตามสำเร็จ" — `97` §6.1 v3) */
export interface PortalCaseAssetSource {
  id: string
  photos: readonly string[]
  condition: AssetCondition | null
  conditionNote: string | null
}

export interface PortalCaseDetailSource extends PortalCaseSource, PortalCaseServiceFeeSource {
  /** ยี่ห้อ/รุ่น + ความจุ/สีตามสัญญา (มติ PO U166 · BUG-184) — บริษัทเป็นผู้ส่งค่าเหล่านี้มาเอง */
  assetDescription?: string | null
  assetCapacity?: string | null
  assetColor?: string | null
  asset?: PortalCaseAssetSource | null
}

export interface PortalServiceFeeDto {
  model: ServiceFeeModel
  modelLabel: string
  ratePct: number | null
  baseSatang: number | null
  basis: ServiceFeeBasis | null
  basisLabel: string | null
  /** มติ U165 — ยอดค่าบริการกรณีไม่สำเร็จ (snapshot) · `null` = ไม่เรียกเก็บ */
  failFeeSatang: number | null
  projectedRevenueSatang: number | null
  /** staging E-073 — "ก่อน VAT" / "รวม VAT แล้ว" / "ไม่มี VAT" ตามโหมดปัจจุบันของบริษัท · `null` = ไม่ทราบ */
  vatLabel: string | null
  /** มติชั่วคราว M9 (PT-01) — เคสปิดไม่สำเร็จ ⇒ ยอดประมาณการใช้ค่าบริการกรณีไม่สำเร็จ (ไม่ใช่ยอดกรณีสำเร็จ) */
  closedFail: boolean
  /**
   * มติชั่วคราว M9 — รายได้จริงของเคส (รวม VAT) · `null` = ยังไม่เกิดรายได้
   * · มติ PO 12/10/2569 I2-01 — **หักใบลดหนี้ที่ออกแล้ว** (รวม VAT · ไม่ต่ำกว่า 0) · Adjustment ที่ยังไม่ออกใบลดหนี้ไม่หัก
   */
  actualRevenueSatang: number | null
  /** มติ PO 12/10/2569 I2-01 — ยอดรายได้ก่อนหักใบลดหนี้ (รวม VAT) · `null` = ยังไม่เกิดรายได้ */
  actualRevenueOriginalSatang: number | null
  /** มติ PO 12/10/2569 I2-01 — ใบลดหนี้ที่ออกแล้วของเคส (ว่าง = ไม่มี ⇒ ไม่แสดงบรรทัดย่อย) */
  actualRevenueCreditNotes: PortalCaseCreditNoteSource[]
  /** ป้าย VAT ของยอดจริง ("รวม VAT แล้ว"/"ไม่มี VAT") · `null` เมื่อไม่มียอดจริง */
  actualRevenueVatLabel: string | null
}

export interface PortalAssetPhotosDto {
  /** ใช้ประกอบ `/api/portal/assets/:id/photos/:index` — ไม่ส่ง path ไฟล์ */
  assetId: string
  photoCount: number
  /** staging E-074 — ชื่อมุมของแต่ละรูปตามลำดับ index (เช่น "ด้านหน้า") — อ่านจาก path แต่ไม่ส่ง path */
  photoLabels: string[]
  condition: AssetCondition | null
  conditionLabel: string | null
  conditionNote: string | null
}

export interface PortalCaseDetailDto extends PortalCaseListItemDto {
  /** "Samsung Galaxy A55 5G · 256GB · ดำ" (ข้อความชุดเดียวกับใบส่งมอบ) — `null` = เคสไม่มีข้อมูลเครื่อง */
  deviceText: string | null
  /** ค่าบริการที่ snapshot ตอนอนุมัติ — `null` = ยังไม่อนุมัติ (ยังไม่มี snapshot) */
  serviceFee: PortalServiceFeeDto | null
  /** รูปสินค้า + สภาพ — เฉพาะสถานะ "ติดตามสำเร็จ" */
  assetPhotos: PortalAssetPhotosDto | null
}

function serializeServiceFee(row: PortalCaseServiceFeeSource, closedFail: boolean): PortalServiceFeeDto | null {
  if (row.serviceFeeModelSnapshot === null) return null
  const revenue = row.revenue ?? null
  const creditNotes = revenue?.creditNotes ?? []
  const basis = row.serviceFeeBasisSnapshot
  return {
    model: row.serviceFeeModelSnapshot,
    // mytester3 G3-03 — ป้ายไทยล้วนชุดเดียวกับหลังบ้าน (ป้ายสองภาษาเป็นของหน้าตั้งค่าเท่านั้น)
    modelLabel: REVENUE_FEE_MODEL_LABEL[row.serviceFeeModelSnapshot],
    ratePct: decimalToNumber(row.serviceFeeRatePct),
    baseSatang: row.serviceFeeBaseSatang,
    basis,
    basisLabel: basis === null ? null : SERVICE_FEE_BASIS_LABEL[basis],
    failFeeSatang: row.serviceFeeFailFeeSatang,
    projectedRevenueSatang: row.projectedRevenueSatang,
    vatLabel: row.companyVatMode == null ? null : PORTAL_VAT_MODE_LABEL[row.companyVatMode],
    closedFail,
    actualRevenueSatang: revenue === null ? null : portalCaseNetRevenueSatang(revenue.totalSatang, creditNotes),
    actualRevenueOriginalSatang: revenue === null ? null : revenue.totalSatang,
    actualRevenueCreditNotes: creditNotes.map((note) => ({ creditNoteNumber: note.creditNoteNumber, totalSatang: note.totalSatang })),
    actualRevenueVatLabel:
      revenue === null ? null : revenue.vatSatang > 0 ? PORTAL_VAT_MODE_LABEL.include_vat : PORTAL_VAT_MODE_LABEL.no_vat,
  }
}

/** ข้อความเครื่องของเคส — ใช้ `documentDeviceText()` ชุดเดียวกับใบส่งมอบ/หน้าส่งมอบของพอร์ทัล */
export function portalCaseDeviceText(row: {
  assetDescription?: string | null
  assetCapacity?: string | null
  assetColor?: string | null
}): string | null {
  const description = (row.assetDescription ?? '').trim()
  const capacity = row.assetCapacity ?? null
  const color = row.assetColor ?? null
  if (description !== '') return documentDeviceText({ deviceDesc: description, deviceCapacity: capacity, deviceColor: color })
  const attributes = deviceAttributesText(capacity, color)
  return attributes === '—' ? null : attributes
}

export function serializePortalCaseDetail(row: PortalCaseDetailSource): PortalCaseDetailDto {
  const base = serializePortalCaseListItem(row)
  const asset = row.asset ?? null
  return {
    ...base,
    deviceText: portalCaseDeviceText(row),
    serviceFee: serializeServiceFee(row, base.statusDisplay.code === 'not_recovered'),
    assetPhotos:
      base.statusDisplay.code === 'recovered' && asset !== null
        ? {
            assetId: asset.id,
            photoCount: asset.photos.length,
            photoLabels: asset.photos.map((path) => intakePhotoAngleLabel(path)),
            condition: asset.condition,
            conditionLabel: asset.condition === null ? null : ASSET_CONDITION_LABEL[asset.condition],
            conditionNote: asset.conditionNote,
          }
        : null,
  }
}

// ── รอบวางบิล (`97` §6.2) ────────────────────────────────────────────────────

export interface PortalBillingBatchSource {
  id: string
  /** เลขรอบวางบิลจริง `BL-<พ.ศ.>-NNN` (มติ U76) */
  batchNumber: string
  period: string
  status: BillingBatchStatus
  /** ยอดตามเอกสาร (ใบกำกับ − ใบลดหนี้ — `documentedBillingAmounts()` · มติ U14) ไม่ใช่ยอดหลัง Adjustment ภายใน */
  totalSatang: number
  receivedSatang: number
  whtWithheldByCustomerSatang: number
  /** มติ PO U144 — ส่วนต่างที่ตัดเป็นค่าธรรมเนียมธนาคาร (นับเป็นชำระแล้ว · ไม่แสดงแยกในพอร์ทัล) */
  bankFeeWrittenOffSatang: number
  dueDate: Date
  sentAt: Date | null
  /** จำนวนรายการรายได้ (= เคส) ในรอบ — 1 เคส 1 รายการรายได้ (มติ U62) */
  caseCount: number
  /** mytester G-04 — มีหนังสือ 50 ทวิ ที่ยังรอจากลูกค้า (สถานะ pending) · ไม่ระบุ = ไม่มี */
  customerWhtCertificatePending?: boolean
}

export interface PortalBillingBatchDto {
  id: string
  /** เลขรอบวางบิลจริง `BL-<พ.ศ.>-NNN` ต่อองค์กร รีเซ็ตทุกปี พ.ศ. (มติ U76 — แทน `BB-<พ.ศ.>-<MM>` ของ U62) */
  batchNumber: string
  period: string
  /** จำนวนเคสในรอบ (มติ U62) */
  caseCount: number
  totalSatang: number
  /** ชำระแล้ว = เงินรับ + ค่าธรรมเนียมโอนที่ตัดบัญชี (มติ U144 · R3-007) */
  receivedSatang: number
  /** ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ (มติ U11) — รวม = ชำระแล้ว + ลูกค้าหัก + ค้าง */
  customerWhtSatang: number
  outstandingSatang: number
  dueDate: string
  sentAt: string | null
  statusDisplay: PortalStatusDisplay<PortalBillingStatusCode>
  /** มติ O74 — รับชำระครบแล้วแต่ยังค้างจากใบเพิ่มหนี้ ⇒ หน้าจอแสดงป้ายเสริม "มีใบเพิ่มหนี้ค้าง" */
  debitNoteOutstanding: boolean
  /** mytester G-04 — ยังรอหนังสือ 50 ทวิ จากบริษัท (บันทึกรับแล้ว/ไม่หักภาษี = `false`) */
  customerWhtCertificatePending: boolean
}

/** `draft` → `null` (ห้ามแสดงในพอร์ทัล — `97` §6.2) */
export function serializePortalBillingBatch(row: PortalBillingBatchSource): PortalBillingBatchDto | null {
  // สูตรกลาง `22` §6.11 (รวม WHT ที่ลูกค้าหัก — ตัวเดียวกับฝั่งภายใน) · `totalSatang` = ยอดตามเอกสาร
  const outstandingSatang = arOutstandingSatang({
    totalSatang: row.totalSatang,
    receivedSatang: row.receivedSatang,
    whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    bankFeeWrittenOffSatang: row.bankFeeWrittenOffSatang,
  })
  const statusDisplay = portalBillingStatusDisplay(row.status, outstandingSatang)
  if (statusDisplay === null) return null
  return {
    id: row.id,
    // มติ U76 — เลขจริงที่เก็บใน DB (เดิม U62 สร้าง `BB-<พ.ศ.>-<MM>` จาก period)
    batchNumber: row.batchNumber,
    period: row.period,
    caseCount: row.caseCount,
    totalSatang: row.totalSatang,
    // มติ PO U144 — ค่าธรรมเนียมโอนที่ตัดเป็นค่าใช้จ่ายบริษัทนับเป็น "ชำระแล้ว" (ไม่แสดงแยก) ⇒ รวมในช่องนี้
    // ให้สูตรบนหน้า (รวม = ชำระแล้ว + ภาษีที่ลูกค้าหัก + ค้างชำระ) ลงตัว — preship R3-007
    receivedSatang: row.receivedSatang + row.bankFeeWrittenOffSatang,
    customerWhtSatang: row.whtWithheldByCustomerSatang,
    outstandingSatang,
    dueDate: dateOnly(row.dueDate),
    sentAt: isoOrNull(row.sentAt),
    statusDisplay,
    debitNoteOutstanding: hasDebitNoteOutstanding(row.status, outstandingSatang),
    customerWhtCertificatePending: row.whtWithheldByCustomerSatang > 0 && row.customerWhtCertificatePending === true,
  }
}

/** กรอง `draft` ทิ้งซ้ำอีกชั้น (defense in depth แม้ query กรองแล้ว) */
export function serializePortalBillingBatches(rows: readonly PortalBillingBatchSource[]): PortalBillingBatchDto[] {
  return rows.flatMap((row) => {
    const dto = serializePortalBillingBatch(row)
    return dto === null ? [] : [dto]
  })
}

// ── ใบกำกับภาษี (`97` §6.3) ──────────────────────────────────────────────────

export interface PortalTaxInvoiceSource {
  id: string
  /** ชนิดเอกสาร (มติ PO U95) — ไม่ส่ง = ใบกำกับภาษีแบบเดิม */
  docKind?: TaxInvoiceDocKind
  /** เลขใบแจ้งหนี้/รอบวางบิลที่อ้างถึง */
  billingBatchNumber?: string | null
  invoiceNumber: string
  invoiceDate: Date
  status: TaxInvoiceStatus
  /** ยอด snapshot บนใบ (ไม่คำนวณใหม่ — ตัวเดียวกับที่พิมพ์ลง PDF) */
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  deliveryFormat: InvoiceDeliveryFormat
  /**
   * ใบลดหนี้/ใบเพิ่มหนี้ **active** ที่อ้างถึงใบนี้ (มติ U14/U19) — แถวภายในส่งมาได้ แต่ส่งออกเฉพาะฟิลด์ใน
   * `PortalCreditNoteDto` · แยกชนิดด้วย `noteType` (ไม่ส่ง = ใบลดหนี้)
   */
  creditNotes: readonly PortalCreditNoteSource[]
}

export interface PortalCreditNoteSource {
  id: string
  noteType?: 'credit' | 'debit'
  creditNoteNumber: string
  /** ISO (date-only หรือ timestamp) — ส่งออกเป็น `YYYY-MM-DD` */
  issueDate: string | Date
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** snapshot สาขาผู้ซื้อตามใบกำกับเดิม (มติ PO U82) — `00000` = สำนักงานใหญ่ */
  buyerBranchCode: string
}

/** ใบลดหนี้/ใบเพิ่มหนี้ที่ลูกค้าเห็น — ไม่มีเหตุผลภายใน/ผู้บันทึก/ไฟล์สแกน/Adjustment ต้นเหตุ */
export interface PortalCreditNoteDto {
  id: string
  creditNoteNumber: string
  issueDate: string
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** สำนักงานใหญ่/สาขาของลูกค้าตามใบกำกับเดิม — "สำนักงานใหญ่" / "สาขาที่ 00001" (มติ PO U82) */
  branchLabel: string
}

export interface PortalTaxInvoiceDto {
  id: string
  /** ชื่อเอกสาร — "ใบเสร็จรับเงิน/ใบกำกับภาษี" (ออกตอนรับเงิน · U95) หรือ "ใบกำกับภาษี" (แบบเดิม) */
  documentTitle: string
  /** เลขใบแจ้งหนี้/รอบวางบิลที่อ้างถึง (`BL-<พ.ศ.>-NNN`) */
  billingBatchNumber: string | null
  invoiceNumber: string
  issueDate: string
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  deliveryFormat: InvoiceDeliveryFormat
  deliveryFormatLabel: string
  statusDisplay: PortalStatusDisplay<TaxInvoiceStatus>
  /** ใบลดหนี้ active (เรียงตามวันที่ออก) — ยอดหน้าใบด้านบนไม่หัก (ใบลดหนี้เป็นเอกสารแยก) */
  creditNotes: PortalCreditNoteDto[]
  /** ใบเพิ่มหนี้ active (เรียงตามวันที่ออก — มติ U19) — ยอดหน้าใบด้านบนไม่บวก */
  debitNotes: PortalCreditNoteDto[]
  /** ยอดสุทธิตามเอกสาร = ยอดหน้าใบ − ใบลดหนี้ + ใบเพิ่มหนี้ (ไม่มีเอกสารปรับปรุง ⇒ เท่ายอดหน้าใบ) */
  netBeforeVatSatang: number
  netVatSatang: number
  netTotalSatang: number
}

export function serializePortalTaxInvoice(row: PortalTaxInvoiceSource): PortalTaxInvoiceDto {
  const net = netInvoiceAmounts(
    { totalBeforeVatSatang: row.totalBeforeVatSatang, vatSatang: row.vatSatang, totalSatang: row.totalSatang },
    row.creditNotes.map((note) => ({ ...amountsOf(note), status: 'active' as const, noteType: note.noteType ?? 'credit' })),
  )
  const credits = row.creditNotes.filter((note) => (note.noteType ?? 'credit') === 'credit')
  const debits = row.creditNotes.filter((note) => note.noteType === 'debit')
  return {
    id: row.id,
    documentTitle: TAX_INVOICE_DOC_KIND_TITLE[row.docKind ?? 'tax_invoice'],
    billingBatchNumber: row.billingBatchNumber ?? null,
    invoiceNumber: row.invoiceNumber,
    issueDate: dateOnly(row.invoiceDate),
    totalBeforeVatSatang: row.totalBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    deliveryFormat: row.deliveryFormat,
    deliveryFormatLabel: INVOICE_DELIVERY_FORMAT_LABEL[row.deliveryFormat],
    statusDisplay: portalTaxInvoiceStatusDisplay(row.status),
    creditNotes: credits.map(serializePortalCreditNote),
    debitNotes: debits.map(serializePortalCreditNote),
    netBeforeVatSatang: net.totalBeforeVatSatang,
    netVatSatang: net.vatSatang,
    netTotalSatang: net.totalSatang,
  }
}

function amountsOf(note: PortalCreditNoteSource): { amountBeforeVatSatang: number; vatSatang: number; totalSatang: number } {
  return { amountBeforeVatSatang: note.amountBeforeVatSatang, vatSatang: note.vatSatang, totalSatang: note.totalSatang }
}

export function serializePortalCreditNote(note: PortalCreditNoteSource): PortalCreditNoteDto {
  return {
    id: note.id,
    creditNoteNumber: note.creditNoteNumber,
    issueDate: typeof note.issueDate === 'string' ? note.issueDate.slice(0, 10) : dateOnly(note.issueDate),
    ...amountsOf(note),
    branchLabel: formatBranch(note.buyerBranchCode),
  }
}

// ── ล็อตส่งมอบ (`97` §6.4 · D6) ──────────────────────────────────────────────

export interface PortalLotSource {
  id: string
  lotNumber: string
  docRef: string
  type: HandoverType
  status: HandoverLotStatus
  assetCount: number
  createdAt: Date
  confirmedAt: Date | null
}

export interface PortalLotListItemDto {
  id: string
  lotNumber: string
  docRef: string
  type: HandoverType
  typeLabel: string
  statusDisplay: PortalStatusDisplay<PortalLotStatusCode>
  assetCount: number
  /** ปุ่มดาวน์โหลดเปิดเฉพาะล็อต `confirmed` */
  downloadable: boolean
  createdAt: string
  confirmedAt: string | null
}

export function serializePortalLotListItem(row: PortalLotSource): PortalLotListItemDto {
  return {
    id: row.id,
    lotNumber: row.lotNumber,
    docRef: row.docRef,
    type: row.type,
    typeLabel: HANDOVER_TYPE_LABEL[row.type],
    statusDisplay: portalLotStatusDisplay(row.status),
    assetCount: row.assetCount,
    downloadable: portalLotDownloadable(row.status),
    createdAt: iso(row.createdAt),
    confirmedAt: isoOrNull(row.confirmedAt),
  }
}

export interface PortalLotAssetSource {
  id: string
  caseRef: string
  debtorName: string
  deviceDesc: string
  deviceCapacity: string | null
  deviceColor: string | null
  condition: AssetCondition | null
  conditionNote: string | null
  photos: readonly string[]
}

export interface PortalLotAssetDto {
  id: string
  caseRef: string
  debtorName: string
  deviceDesc: string
  /** ความจุ/สีตามสัญญา (มติ PO U166) — บริษัทเป็นผู้ส่งค่านี้มาเอง · ผลตรวจในคลังไม่ส่งออก */
  deviceCapacity: string | null
  deviceColor: string | null
  condition: AssetCondition | null
  conditionLabel: string | null
  conditionNote: string | null
  photoCount: number
}

export interface PortalLotDetailSource extends Omit<PortalLotSource, 'assetCount'> {
  /** ล็อตเราส่งที่แนบหลักฐานการจัดส่งแล้ว (คำนวณที่ query — path ไม่เข้ามาถึง serializer) */
  hasDeliveryProof: boolean
  assets: readonly PortalLotAssetSource[]
}

export interface PortalLotDetailDto extends PortalLotListItemDto {
  /** มีหลักฐานการจัดส่งให้ดาวน์โหลด (เฉพาะล็อตแบบเราส่ง — มติ U13) */
  deliveryProofAvailable: boolean
  assets: PortalLotAssetDto[]
}

export function serializePortalLotAsset(row: PortalLotAssetSource): PortalLotAssetDto {
  return {
    id: row.id,
    caseRef: row.caseRef,
    debtorName: row.debtorName,
    deviceDesc: row.deviceDesc,
    deviceCapacity: row.deviceCapacity,
    deviceColor: row.deviceColor,
    condition: row.condition,
    conditionLabel: row.condition === null ? null : ASSET_CONDITION_LABEL[row.condition],
    conditionNote: row.conditionNote,
    photoCount: row.photos.length,
  }
}

export function serializePortalLotDetail(row: PortalLotDetailSource): PortalLotDetailDto {
  return {
    ...serializePortalLotListItem({ ...row, assetCount: row.assets.length }),
    deliveryProofAvailable: row.hasDeliveryProof,
    assets: row.assets.map(serializePortalLotAsset),
  }
}

// ── รูปทรัพย์ (`97` §17 `/assets/:id/photos/:index`) ─────────────────────────

export interface PortalAssetPhotoMeta {
  assetId: string
  index: number
  count: number
}

/**
 * ตรวจ index ของรูป — นอกช่วง/ไม่ใช่จำนวนเต็ม ⇒ `null` (route ตอบ 403 `PERMISSION_DENIED` แบบเดียวกับ id สุ่ม)
 * · path ใน Storage ไม่ถูกส่งออก (route ใช้สร้าง signed URL/stream เอง)
 */
export function portalAssetPhotoMeta(
  asset: { id: string; photos: readonly string[] },
  index: number,
): PortalAssetPhotoMeta | null {
  if (!Number.isInteger(index) || index < 0 || index >= asset.photos.length) return null
  return { assetId: asset.id, index, count: asset.photos.length }
}

// ── ข้อมูลบริษัท (`97` §6.6) ─────────────────────────────────────────────────

export interface PortalCompanyProfileSource {
  name: string
  taxId: string
  /** สำนักงานใหญ่/สาขา (มติ PO U77) — `00000` = สำนักงานใหญ่ */
  branchCode: string
  address: string | null
  contactName: string | null
  contactPhone: string | null
  signerName: string | null
  serviceFeeTemplate: { templateName: string; model: ServiceFeeModel } | null
}

export interface PortalCompanyProfileDto {
  name: string
  taxId: string
  /** "สำนักงานใหญ่" / "สาขาที่ 00001" — แสดงต่อจากเลขประจำตัวผู้เสียภาษี (มติ PO U77) */
  branchLabel: string
  address: string | null
  contactName: string | null
  contactPhone: string | null
  signerName: string | null
  /** ชื่อ + model เท่านั้น — ไม่แสดงอัตราละเอียดของ template (`97` §6.6) */
  serviceFeeTemplate: { name: string; model: ServiceFeeModel; modelLabel: string } | null
}

export function serializePortalCompanyProfile(row: PortalCompanyProfileSource): PortalCompanyProfileDto {
  const template = row.serviceFeeTemplate
  return {
    name: row.name,
    taxId: row.taxId,
    branchLabel: formatBranch(row.branchCode),
    address: row.address,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    signerName: row.signerName,
    serviceFeeTemplate:
      template === null
        ? null
        : { name: template.templateName, model: template.model, modelLabel: REVENUE_FEE_MODEL_LABEL[template.model] },
  }
}

// ── ภาพรวม (`97` §5 KPI 4 ใบ · D12) ─────────────────────────────────────────

export interface PortalDashboardSource {
  inProgressCaseCount: number
  /** ยอดค้างจาก batch `sent` ขึ้นไป คำนวณสด (D9) */
  arOutstandingSatang: number
  latestTaxInvoice: { invoiceNumber: string; invoiceDate: Date; totalSatang: number } | null
  pendingLotCount: number
}

/** การ์ดของหมวดที่ไม่มีสิทธิ์ **ไม่มีคีย์ใน response** (ไม่ใช่แค่ `null`) */
export interface PortalDashboardDto {
  inProgressCases?: { count: number }
  arOutstanding?: { outstandingSatang: number }
  latestTaxInvoice?: { invoiceNumber: string; issueDate: string; totalSatang: number } | null
  pendingLots?: { count: number }
}

export function serializePortalDashboard(
  source: PortalDashboardSource,
  capabilities: PortalCapabilities,
): PortalDashboardDto {
  const dto: PortalDashboardDto = {}
  if (canAccess('cases', capabilities)) dto.inProgressCases = { count: source.inProgressCaseCount }
  if (canAccess('finance', capabilities)) {
    dto.arOutstanding = { outstandingSatang: source.arOutstandingSatang }
    const invoice = source.latestTaxInvoice
    dto.latestTaxInvoice =
      invoice === null
        ? null
        : { invoiceNumber: invoice.invoiceNumber, issueDate: dateOnly(invoice.invoiceDate), totalSatang: invoice.totalSatang }
  }
  if (canAccess('handover', capabilities)) dto.pendingLots = { count: source.pendingLotCount }
  return dto
}

// ── รายงานสรุป (`97` §6.5 · มติ O43 D9 — Portal-P5) ─────────────────────────
//
// รับ `ReportData` จาก builder ภายในตัวเดิม (`buildRevenueSummary` F2 / `buildArAgingReport` F3) ที่
// query layer scope เฉพาะบริษัท + เฉพาะ batch `sent` ขึ้นไปแล้ว → ดึงเฉพาะค่าที่อนุญาตทีละคีย์
// (ไม่ส่ง `columns`/`note`/`__key` ของรายงานภายในออกไป · ไม่มีชื่อ/รหัสบริษัท)

function cellNumber(row: ReportRow | null | undefined, key: string): number {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function cellNumberOrNull(row: ReportRow | null | undefined, key: string): number | null {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function kpiNumber(report: ReportData, key: string): number {
  const value = report.kpis?.find((kpi) => kpi.key === key)?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export interface PortalRevenueSummaryMonth {
  /** `YYYY-MM-DD` วันแรกของเดือน (= คีย์แถวของ F2 แบบรายเดือน) */
  key: string
  /** ป้าย พ.ศ. เช่น "สิงหาคม 2569" */
  label: string
}

export interface PortalRevenueSummaryFigures {
  revenueSatang: number
  caseCount: number
  successCount: number
  failCount: number
  /** `null` = ยังไม่มีเคสปิด (แสดง N/A — ห้ามหารศูนย์) */
  successPct: number | null
  revenuePerCaseSatang: number | null
}

export interface PortalRevenueSummaryRowDto extends PortalRevenueSummaryFigures {
  /** `YYYY-MM-DD` วันแรกของเดือน */
  month: string
  label: string
}

export interface PortalRevenueSummaryDto {
  rangeStart: string
  rangeEnd: string
  /** ครบทุกเดือนในช่วง (เดือนที่ไม่มีรายได้ = 0) เรียงเก่า → ใหม่ */
  months: PortalRevenueSummaryRowDto[]
  total: PortalRevenueSummaryFigures
}

function revenueFiguresOf(row: ReportRow | null | undefined): PortalRevenueSummaryFigures {
  return {
    revenueSatang: cellNumber(row, 'revenueSatang'),
    caseCount: cellNumber(row, 'caseCount'),
    successCount: cellNumber(row, 'successCount'),
    failCount: cellNumber(row, 'failCount'),
    successPct: cellNumberOrNull(row, 'successPct'),
    revenuePerCaseSatang: cellNumberOrNull(row, 'revenuePerCaseSatang'),
  }
}

/**
 * mytester G-09 — จำนวนเคสปิดไม่ซ้ำต่อเดือน (เคสที่มีรายได้ ∪ เคสปิดไม่สำเร็จที่ไม่คิดเงิน — U55)
 * `caseCount` ของรายงานนับเฉพาะเคสที่มีรายได้ ⇒ ตารางพอร์ทัลขึ้น "ทั้งหมด 1 · สำเร็จ 1 · ไม่สำเร็จ 2"
 * ช่อง "เคสทั้งหมด" ของพอร์ทัลใช้ค่านี้ (ทั้งหมด ≥ สำเร็จ + ไม่สำเร็จ เสมอ) · รายได้ต่อเคสยังหารด้วยเคสที่มีรายได้
 */
export function portalClosedCaseCounts(
  entries: readonly { groupKey: string; caseId: string }[],
  failCases: readonly { groupKey: string; caseId: string }[],
): { byKey: Map<string, number>; total: number } {
  const sets = new Map<string, Set<string>>()
  const all = new Set<string>()
  for (const row of [...entries, ...failCases]) {
    const set = sets.get(row.groupKey) ?? new Set<string>()
    set.add(row.caseId)
    sets.set(row.groupKey, set)
    all.add(row.caseId)
  }
  return { byKey: new Map([...sets].map(([key, set]) => [key, set.size])), total: all.size }
}

/** ผลของ `buildRevenueSummary({ groupBy: 'month' })` → DTO พอร์ทัล (whitelist) */
export function serializePortalRevenueSummary(input: {
  report: ReportData
  months: readonly PortalRevenueSummaryMonth[]
  rangeStart: Date
  rangeEnd: Date
  /** mytester G-09 — เคสปิดไม่ซ้ำ (`portalClosedCaseCounts`) · ไม่ส่ง = ใช้ `caseCount` ของรายงาน */
  closedCaseCounts?: { byKey: ReadonlyMap<string, number>; total: number }
}): PortalRevenueSummaryDto {
  const closed = input.closedCaseCounts
  const withClosed = (figures: PortalRevenueSummaryFigures, count: number | undefined): PortalRevenueSummaryFigures =>
    count === undefined ? figures : { ...figures, caseCount: Math.max(figures.caseCount, count) }
  const byKey = new Map<string, ReportRow>()
  for (const row of input.report.rows) {
    const key = row[ROW_KEY]
    if (typeof key === 'string') byKey.set(key, row)
  }
  return {
    rangeStart: dateOnly(input.rangeStart),
    rangeEnd: dateOnly(input.rangeEnd),
    months: input.months.map((month) => ({
      month: month.key,
      label: month.label,
      ...withClosed(revenueFiguresOf(byKey.get(month.key)), closed?.byKey.get(month.key)),
    })),
    total: withClosed(revenueFiguresOf(input.report.totalRow), closed?.total),
  }
}

export interface PortalArAgingBucketDto {
  /** ป้ายช่วงจากค่าตั้งองค์กร เช่น `0-30 วัน` / `90+ วัน` */
  label: string
  outstandingSatang: number
  tone: 'default' | 'warning' | 'danger'
}

export interface PortalArAgingDto {
  asOf: string
  totalOutstandingSatang: number
  over60Satang: number
  over90Satang: number
  /** จำนวนรอบวางบิลที่ยังค้างชำระ */
  batchCount: number
  /**
   * จำนวนรอบวางบิลทั้งหมดที่ส่งถึงบริษัทแล้ว (รวมที่ชำระครบ) — แยก "ยังไม่เคยมีบิล" ออกจาก "ชำระครบแล้ว"
   * ในการ์ดอายุหนี้ (mytester PT-02) · นับเฉพาะรอบของบริษัทตัวเอง (ไม่ leak)
   */
  billedBatchCount: number
  buckets: PortalArAgingBucketDto[]
}

const AGING_BUCKET_KEY = /^bucket\d+$/

/** ผลของ `buildArAgingReport()` (scope บริษัทเดียว) → DTO พอร์ทัล (whitelist) */
export function serializePortalArAging(report: ReportData, asOf: Date, billedBatchCount: number): PortalArAgingDto {
  const totalRow = report.totalRow ?? null
  return {
    asOf: dateOnly(asOf),
    totalOutstandingSatang: kpiNumber(report, 'outstanding'),
    over60Satang: kpiNumber(report, 'over60'),
    over90Satang: kpiNumber(report, 'over90'),
    batchCount: cellNumber(totalRow, 'batchCount'),
    billedBatchCount,
    buckets: report.columns
      .filter((column) => AGING_BUCKET_KEY.test(column.key))
      .map((column) => ({
        label: column.header,
        outstandingSatang: cellNumber(totalRow, column.key),
        tone: column.tone ?? 'default',
      })),
  }
}
