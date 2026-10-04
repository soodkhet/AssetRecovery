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
  TaxInvoiceStatus,
} from '@/lib/generated/prisma/enums'
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
import { INVOICE_DELIVERY_FORMAT_LABEL } from '@/lib/sales/sales'
import { SERVICE_FEE_BASIS_LABEL, SERVICE_FEE_MODEL_LABEL } from '@/lib/service-fee/template'
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
  /** `cases.review_note` — แสดงเป็น `statusReason` เฉพาะ "ไม่รับเคส"/"ขอข้อมูลเพิ่มเติม" */
  reviewNote: string | null
  createdAt: Date
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
    statusReason: portalCaseShowsReason(statusDisplay.code) ? row.reviewNote : null,
    createdAt: iso(row.createdAt),
    recycleRound: row.trackingRound > 1 ? row.trackingRound : null,
  }
}

export interface PortalCaseServiceFeeSource {
  serviceFeeModelSnapshot: ServiceFeeModel | null
  serviceFeeRatePct: number | string | { toString(): string } | null
  serviceFeeBaseSatang: number | null
  serviceFeeBasisSnapshot: ServiceFeeBasis | null
  serviceFeeChargeOnFail: boolean | null
  projectedRevenueSatang: number | null
}

/** ทรัพย์ที่รับเข้าคลังของเคส (ใช้เฉพาะเคส "ติดตามสำเร็จ" — `97` §6.1 v3) */
export interface PortalCaseAssetSource {
  id: string
  photos: readonly string[]
  condition: AssetCondition | null
  conditionNote: string | null
}

export interface PortalCaseDetailSource extends PortalCaseSource, PortalCaseServiceFeeSource {
  asset?: PortalCaseAssetSource | null
}

export interface PortalServiceFeeDto {
  model: ServiceFeeModel
  modelLabel: string
  ratePct: number | null
  baseSatang: number | null
  basis: ServiceFeeBasis | null
  basisLabel: string | null
  chargeOnFail: boolean | null
  projectedRevenueSatang: number | null
}

export interface PortalAssetPhotosDto {
  /** ใช้ประกอบ `/api/portal/assets/:id/photos/:index` — ไม่ส่ง path ไฟล์ */
  assetId: string
  photoCount: number
  condition: AssetCondition | null
  conditionLabel: string | null
  conditionNote: string | null
}

export interface PortalCaseDetailDto extends PortalCaseListItemDto {
  /** ค่าบริการที่ snapshot ตอนอนุมัติ — `null` = ยังไม่อนุมัติ (ยังไม่มี snapshot) */
  serviceFee: PortalServiceFeeDto | null
  /** รูปสินค้า + สภาพ — เฉพาะสถานะ "ติดตามสำเร็จ" */
  assetPhotos: PortalAssetPhotosDto | null
}

function serializeServiceFee(row: PortalCaseServiceFeeSource): PortalServiceFeeDto | null {
  if (row.serviceFeeModelSnapshot === null) return null
  const basis = row.serviceFeeBasisSnapshot
  return {
    model: row.serviceFeeModelSnapshot,
    modelLabel: SERVICE_FEE_MODEL_LABEL[row.serviceFeeModelSnapshot],
    ratePct: decimalToNumber(row.serviceFeeRatePct),
    baseSatang: row.serviceFeeBaseSatang,
    basis,
    basisLabel: basis === null ? null : SERVICE_FEE_BASIS_LABEL[basis],
    chargeOnFail: row.serviceFeeChargeOnFail,
    projectedRevenueSatang: row.projectedRevenueSatang,
  }
}

export function serializePortalCaseDetail(row: PortalCaseDetailSource): PortalCaseDetailDto {
  const base = serializePortalCaseListItem(row)
  const asset = row.asset ?? null
  return {
    ...base,
    serviceFee: serializeServiceFee(row),
    assetPhotos:
      base.statusDisplay.code === 'recovered' && asset !== null
        ? {
            assetId: asset.id,
            photoCount: asset.photos.length,
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
  period: string
  status: BillingBatchStatus
  totalSatang: number
  receivedSatang: number
  whtWithheldByCustomerSatang: number
  dueDate: Date
  sentAt: Date | null
}

export interface PortalBillingBatchDto {
  id: string
  period: string
  totalSatang: number
  receivedSatang: number
  outstandingSatang: number
  dueDate: string
  sentAt: string | null
  statusDisplay: PortalStatusDisplay<PortalBillingStatusCode>
}

/** `draft` → `null` (ห้ามแสดงในพอร์ทัล — `97` §6.2) */
export function serializePortalBillingBatch(row: PortalBillingBatchSource): PortalBillingBatchDto | null {
  const statusDisplay = portalBillingStatusDisplay(row.status)
  if (statusDisplay === null) return null
  return {
    id: row.id,
    period: row.period,
    totalSatang: row.totalSatang,
    receivedSatang: row.receivedSatang,
    // สูตรกลาง `22` §6.11 (รวม WHT ที่ลูกค้าหัก — ตัวเดียวกับฝั่งภายใน)
    outstandingSatang: arOutstandingSatang({
      totalSatang: row.totalSatang,
      receivedSatang: row.receivedSatang,
      whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    }),
    dueDate: dateOnly(row.dueDate),
    sentAt: isoOrNull(row.sentAt),
    statusDisplay,
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
  invoiceNumber: string
  invoiceDate: Date
  status: TaxInvoiceStatus
  /** ยอด snapshot จาก `sales_records` (ไม่คำนวณใหม่ — ตัวเดียวกับที่พิมพ์ลง PDF) */
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  deliveryFormat: InvoiceDeliveryFormat
}

export interface PortalTaxInvoiceDto {
  id: string
  invoiceNumber: string
  issueDate: string
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  deliveryFormat: InvoiceDeliveryFormat
  deliveryFormatLabel: string
  statusDisplay: PortalStatusDisplay<TaxInvoiceStatus>
}

export function serializePortalTaxInvoice(row: PortalTaxInvoiceSource): PortalTaxInvoiceDto {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    issueDate: dateOnly(row.invoiceDate),
    totalBeforeVatSatang: row.totalBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    deliveryFormat: row.deliveryFormat,
    deliveryFormatLabel: INVOICE_DELIVERY_FORMAT_LABEL[row.deliveryFormat],
    statusDisplay: portalTaxInvoiceStatusDisplay(row.status),
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
  condition: AssetCondition | null
  conditionNote: string | null
  photos: readonly string[]
}

export interface PortalLotAssetDto {
  id: string
  caseRef: string
  debtorName: string
  deviceDesc: string
  condition: AssetCondition | null
  conditionLabel: string | null
  conditionNote: string | null
  photoCount: number
}

export interface PortalLotDetailSource extends Omit<PortalLotSource, 'assetCount'> {
  assets: readonly PortalLotAssetSource[]
}

export interface PortalLotDetailDto extends PortalLotListItemDto {
  assets: PortalLotAssetDto[]
}

export function serializePortalLotAsset(row: PortalLotAssetSource): PortalLotAssetDto {
  return {
    id: row.id,
    caseRef: row.caseRef,
    debtorName: row.debtorName,
    deviceDesc: row.deviceDesc,
    condition: row.condition,
    conditionLabel: row.condition === null ? null : ASSET_CONDITION_LABEL[row.condition],
    conditionNote: row.conditionNote,
    photoCount: row.photos.length,
  }
}

export function serializePortalLotDetail(row: PortalLotDetailSource): PortalLotDetailDto {
  return {
    ...serializePortalLotListItem({ ...row, assetCount: row.assets.length }),
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
  address: string | null
  contactName: string | null
  contactPhone: string | null
  signerName: string | null
  serviceFeeTemplate: { templateName: string; model: ServiceFeeModel } | null
}

export interface PortalCompanyProfileDto {
  name: string
  taxId: string
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
    address: row.address,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    signerName: row.signerName,
    serviceFeeTemplate:
      template === null
        ? null
        : { name: template.templateName, model: template.model, modelLabel: SERVICE_FEE_MODEL_LABEL[template.model] },
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

/** ผลของ `buildRevenueSummary({ groupBy: 'month' })` → DTO พอร์ทัล (whitelist) */
export function serializePortalRevenueSummary(input: {
  report: ReportData
  months: readonly PortalRevenueSummaryMonth[]
  rangeStart: Date
  rangeEnd: Date
}): PortalRevenueSummaryDto {
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
      ...revenueFiguresOf(byKey.get(month.key)),
    })),
    total: revenueFiguresOf(input.report.totalRow),
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
  buckets: PortalArAgingBucketDto[]
}

const AGING_BUCKET_KEY = /^bucket\d+$/

/** ผลของ `buildArAgingReport()` (scope บริษัทเดียว) → DTO พอร์ทัล (whitelist) */
export function serializePortalArAging(report: ReportData, asOf: Date): PortalArAgingDto {
  const totalRow = report.totalRow ?? null
  return {
    asOf: dateOnly(asOf),
    totalOutstandingSatang: kpiNumber(report, 'outstanding'),
    over60Satang: kpiNumber(report, 'over60'),
    over90Satang: kpiNumber(report, 'over90'),
    batchCount: cellNumber(totalRow, 'batchCount'),
    buckets: report.columns
      .filter((column) => AGING_BUCKET_KEY.test(column.key))
      .map((column) => ({
        label: column.header,
        outstandingSatang: cellNumber(totalRow, column.key),
        tone: column.tone ?? 'default',
      })),
  }
}
