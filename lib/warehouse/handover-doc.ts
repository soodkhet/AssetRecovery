import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { assetConditionLabel, HANDOVER_TYPE_LABEL } from '@/lib/warehouse/warehouse-ui'
import type { LotDetailDto } from '@/lib/warehouse/types'

/**
 * แบบข้อมูลของ **ใบส่งมอบ** (`44` §6.4) — **pure ล้วน**
 * ใช้ร่วมกันทั้ง PDF (`components/pdf/handover-note.tsx`) และ Excel (`handover-excel.ts`)
 * เพื่อให้เอกสารสองชนิดพูดตรงกันเสมอ (เลขที่/รายการ/ลำดับคอลัมน์ชุดเดียว)
 *
 * ⚠️ วันที่ในเอกสารเป็น **พ.ศ.** ทั้งหมด ผ่าน `fmtDate`/`fmtDateTime` (Rule 01) — ห้าม format เอง
 * ⚠️ IMEI/serial แสดงค่า **ตามสัญญา** เป็นหลัก (เอกสารส่งมอบอ้างอิงสัญญา) และกำกับค่าที่ตรวจจริง
 *    ไว้ด้วยเมื่อไม่ตรงกัน — ผู้รับต้องเห็นทั้งสองค่าโดยไม่ต้องเปิดระบบ (`44` §6.5)
 */

export const HANDOVER_DOC_TITLE = 'ใบส่งมอบสินทรัพย์คืน'

export const EMPTY_DOC_VALUE = '—'

/** ผู้ส่งมอบ = องค์กรเจ้าของระบบ (`organizations`) */
export interface HandoverParty {
  name: string
  address: string | null
  taxId: string | null
  phone: string | null
}

export interface HandoverDocRow {
  no: number
  caseRef: string
  debtorName: string
  deviceDesc: string
  /** IMEI ตามสัญญา (ไม่มี = serial ตามสัญญา) */
  identifier: string
  /** ค่าที่ตรวจจริงตอนรับเข้าคลัง เมื่อ**ไม่ตรง**กับสัญญา — `null` = ตรงหรือยังไม่ได้ตรวจ */
  identifierActual: string | null
  condition: string
  conditionNote: string | null
}

export interface HandoverDocModel {
  title: string
  /** เลขใบส่งมอบ `DLV-YYYY-XXX` (พ.ศ.) */
  docRef: string
  lotNumber: string
  typeLabel: string
  /** วันที่บนหัวเอกสาร — วันส่งมอบจริงถ้ามี ไม่งั้นวันนัด ไม่งั้นวันที่สร้างล็อต */
  issuedAtLabel: string
  scheduledAtLabel: string
  deliveredAtLabel: string
  confirmedAtLabel: string
  trackingNo: string
  note: string
  issuer: HandoverParty
  recipient: HandoverParty & { contactPerson: string; deliveryAddr: string }
  rows: readonly HandoverDocRow[]
  totalCount: number
}

function orDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? EMPTY_DOC_VALUE : trimmed
}

/** ตัวระบุเครื่องที่พิมพ์ลงเอกสาร — IMEI มาก่อน serial (เครื่องไม่มี IMEI คือ A6) */
export function documentIdentifier(row: {
  imeiContract: string | null
  serialContract: string | null
}): string {
  return orDash(row.imeiContract ?? row.serialContract)
}

/** ค่าที่ตรวจจริงเมื่อไม่ตรงกับสัญญา — เอกสารต้องแสดงส่วนต่างให้ผู้รับเห็น ไม่ใช่ซ่อนไว้ */
export function documentIdentifierActual(row: {
  imeiContract: string | null
  imeiActual: string | null
  serialContract: string | null
  serialActual: string | null
}): string | null {
  const contract = row.imeiContract ?? row.serialContract
  const actual = row.imeiContract === null ? row.serialActual : row.imeiActual
  if (actual === null || contract === null) return actual
  return actual === contract ? null : actual
}

export function buildHandoverDoc(lot: LotDetailDto, issuer: HandoverParty, recipient: HandoverParty): HandoverDocModel {
  const issuedAt = lot.deliveredAt ?? lot.scheduledAt ?? lot.createdAt
  return {
    title: HANDOVER_DOC_TITLE,
    docRef: lot.docRef,
    lotNumber: lot.lotNumber,
    typeLabel: HANDOVER_TYPE_LABEL[lot.type],
    issuedAtLabel: fmtDate(issuedAt),
    scheduledAtLabel: fmtDateTime(lot.scheduledAt),
    deliveredAtLabel: fmtDate(lot.deliveredAt),
    confirmedAtLabel: fmtDateTime(lot.confirmedAt),
    trackingNo: orDash(lot.trackingNo),
    note: orDash(lot.note),
    issuer,
    recipient: {
      ...recipient,
      contactPerson: orDash(lot.contactPerson),
      deliveryAddr: orDash(lot.deliveryAddr),
    },
    rows: lot.assets.map((asset, index) => ({
      no: index + 1,
      caseRef: asset.caseRef,
      debtorName: asset.debtorName,
      deviceDesc: asset.deviceDesc,
      identifier: documentIdentifier(asset),
      identifierActual: documentIdentifierActual(asset),
      condition: assetConditionLabel(asset.condition),
      conditionNote: asset.conditionNote,
    })),
    totalCount: lot.assets.length,
  }
}

/** ชื่อไฟล์ดาวน์โหลด — ตั้งจาก **เลขล็อต** เพื่อให้เรียงตรงกับที่ผู้ใช้เห็นบนหน้าจอ */
export function handoverFileName(lot: { lotNumber: string }, extension: 'pdf' | 'xlsx'): string {
  return `${lot.lotNumber}.${extension}`
}

/** header ของ Content-Disposition ที่รองรับชื่อไฟล์ภาษาไทย (RFC 5987) */
export function attachmentHeader(fileName: string): string {
  return `attachment; filename="${fileName.replace(/[^\w.\-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
