import { deviceAttributesText } from '@/lib/device-catalog/device-attributes'
import { formatBranch } from '@/lib/format/branch'
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
  /** รหัสสาขา 5 หลัก (มติ PO U100 — พิมพ์ต่อจากเลขผู้เสียภาษี) · ไม่ส่ง = ไม่พิมพ์สาขา */
  branchCode?: string | null
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
  /** หัวข้อของวันนัด — รับเอง = "วันนัดรับ" · เราจัดส่ง = "กำหนดจัดส่ง" (ตรงกับหน้าดูตัวอย่างใบส่งมอบ) */
  scheduledAtCaption: string
  scheduledAtLabel: string
  deliveredAtLabel: string
  confirmedAtLabel: string
  trackingNo: string
  note: string
  issuer: HandoverParty
  recipient: HandoverParty & { contactPerson: string; deliveryAddr: string; branchLabel: string | null }
  rows: readonly HandoverDocRow[]
  totalCount: number
}

function orDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? EMPTY_DOC_VALUE : trimmed
}

/**
 * ชื่อเครื่อง + ความจุ/สีตามสัญญา (มติ PO U166) — "iPhone 15 · 128GB · ดำ"
 * ใช้ทั้งเอกสาร (PDF/Excel) และตารางหน้าคลัง · เครื่องก่อนมติ (ไม่มีค่า) = ชื่อเครื่องอย่างเดียว
 */
export function documentDeviceText(row: {
  deviceDesc: string
  deviceCapacity: string | null
  deviceColor: string | null
}): string {
  const attributes = deviceAttributesText(row.deviceCapacity, row.deviceColor)
  return attributes === EMPTY_DOC_VALUE ? row.deviceDesc : `${row.deviceDesc} · ${attributes}`
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

/** หัวข้อวันนัดตามรูปแบบการส่งมอบ (UAT BUG-080 — ใบส่งมอบต้องแสดงวันนัดเหมือนหน้าดูตัวอย่าง) */
export function scheduledAtCaption(type: LotDetailDto['type']): string {
  return type === 'finance_pickup' ? 'วันนัดรับ' : 'กำหนดจัดส่ง'
}

export function buildHandoverDoc(lot: LotDetailDto, issuer: HandoverParty, recipient: HandoverParty): HandoverDocModel {
  const issuedAt = lot.deliveredAt ?? lot.scheduledAt ?? lot.createdAt
  return {
    title: HANDOVER_DOC_TITLE,
    docRef: lot.docRef,
    lotNumber: lot.lotNumber,
    typeLabel: HANDOVER_TYPE_LABEL[lot.type],
    issuedAtLabel: fmtDate(issuedAt),
    scheduledAtCaption: scheduledAtCaption(lot.type),
    scheduledAtLabel: fmtDateTime(lot.scheduledAt),
    deliveredAtLabel: fmtDate(lot.deliveredAt),
    confirmedAtLabel: fmtDateTime(lot.confirmedAt),
    trackingNo: orDash(lot.trackingNo),
    note: orDash(lot.note),
    issuer,
    recipient: {
      ...recipient,
      branchLabel:
        recipient.branchCode === undefined || recipient.branchCode === null ? null : formatBranch(recipient.branchCode),
      contactPerson: orDash(lot.contactPerson),
      deliveryAddr: orDash(lot.deliveryAddr),
    },
    rows: lot.assets.map((asset, index) => ({
      no: index + 1,
      caseRef: asset.caseRef,
      debtorName: asset.debtorName,
      deviceDesc: documentDeviceText(asset),
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
