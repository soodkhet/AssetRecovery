import { DOCUMENT_SLOT_LABEL } from '@/lib/cases/case'
import { STATEMENT_COLUMN_LABEL } from '@/lib/bank-recon/statement'
import { FIELD_MEDIA_LABEL } from '@/lib/field/media-upload'
import { COMPANY_DOCUMENT_LABEL, COMPANY_DOCUMENT_PATH_SEGMENT } from '@/lib/finance-companies/documents'
import { PAYMENT_FILE_COLUMN_LABEL } from '@/lib/settings/bank-file'
import { LOT_DOCUMENT_BASENAME, LOT_DOCUMENT_LABEL } from '@/lib/warehouse/lot-documents'

/**
 * ตรวจซ้ำ staging SV6-R3-01 — ข้อความ/ค่าที่ **ระบบสร้าง** ในบันทึกการใช้งาน — **pure ล้วน**
 *
 * Rule 05: ข้อความที่ผู้ใช้เห็นห้ามมีศัพท์ระบบ/รหัสภายใน · Rule 03: งานเบื้องหลังต้อง trace กลับได้
 * ⇒ ต้นทางใหม่เขียนข้อความไทยที่ยังมี id เต็ม (`jobTraceTag()`) · แถวเก่า (audit immutable) แปลงตอนแสดงเท่านั้น
 * (`auditSystemReasonText()`) — ข้อมูลใน DB ไม่ถูกแตะ
 */

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_ONLY = new RegExp(`^${UUID_SOURCE}$`, 'i')

// ── ต้นทาง (ข้อความใหม่) ─────────────────────────────────────────────────────

/** ป้ายอ้างอิงงานเบื้องหลังในเหตุผลของ audit — **id เต็ม** (หน้าจอย่อเหลือ 8 ตัวเอง) */
export function jobTraceTag(jobId: string): string {
  return `(งานเบื้องหลัง #${jobId})`
}

/** เลขงานเบื้องหลังเมื่อข้อความบอกอยู่แล้วว่าเป็นงานเบื้องหลัง (ไม่ต้องพูดซ้ำ) */
export function jobRefText(jobId: string): string {
  return `#${jobId}`
}

export const SERVICE_FEE_SNAPSHOT_HEADLINE = 'บันทึกค่าบริการอัตโนมัติตอนอนุมัติเคส'

/**
 * เหตุผลเชิงระบบของการบันทึกค่าบริการตอนอนุมัติเคส — ระบุเทมเพลต/เวอร์ชันที่ใช้ (trace ได้ว่าใช้เงื่อนไขไหน)
 */
export function serviceFeeSnapshotReason(templateName: string, version: number): string {
  return `${SERVICE_FEE_SNAPSHOT_HEADLINE} — เทมเพลต "${templateName}" เวอร์ชัน ${version}`
}

// ── ชั้นแสดงผล (แถวเก่า + ย่อ id) ───────────────────────────────────────────────

/** id ของงานที่แสดงบนจอ — UUID ย่อ 8 ตัว (id เต็มยังอยู่ใน DB) · id อื่น (ทดสอบ/ชนิดงาน) แสดงตามเดิม */
function shortJobId(jobId: string): string {
  return UUID_ONLY.test(jobId) ? jobId.slice(0, 8).toLowerCase() : jobId
}

function displayTag(jobId: string): string {
  return `(งานเบื้องหลัง #${shortJobId(jobId)})`
}

const LEGACY_SNAPSHOT_HEADLINE = 'snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส'
const LEGACY_TEMPLATE_VERSION = /(เทมเพลต ".*?") v(\d+)(?=$|\s|·)/g
const LEGACY_LEADING_JOB = /^\[job:([^\]\s]*)\]\s*/
const LEGACY_JOB_BRACKET = /\[job:([^\]\s]*)\]/g
const LEGACY_JOB_ID = /(?:งานเบื้องหลัง\s*)?job id ([^\s)·]+)/g
const LEGACY_TAC_JOB = /^งานเบื้องหลัง device_tac_sync \(([^)\s]+)\) อัปเดตฐาน TAC/
const LEGACY_TAC_ACTOR = new RegExp(`(ผู้ดูแลสั่งอัปเดตฐาน TAC|นำเข้าไฟล์ TAC เอง) \\((${UUID_SOURCE})\\)`, 'gi')
/** วลีอังกฤษในเหตุผลเดิมของงานเบื้องหลัง ⇒ ข้อความเดียวกับต้นทางใหม่ */
const LEGACY_PHRASES: readonly (readonly [string, string])[] = [
  ['มาร์คเป็น overdue อัตโนมัติ', 'เปลี่ยนเป็นเลยกำหนดเคลียร์อัตโนมัติ'],
  ['คีย์กันซ้ำ ', 'คีย์กันทำซ้ำ '],
]
const FULL_JOB_REF = new RegExp(`#(${UUID_SOURCE})`, 'gi')

/**
 * เหตุผลที่ระบบสร้าง ⇒ ข้อความไทยที่อ่านรู้เรื่อง (ใช้กับทุกแถว — แถวใหม่ผ่านได้โดยไม่เปลี่ยนนอกจากย่อ id)
 * - "snapshot ค่าบริการอัตโนมัติ… v1" ⇒ "บันทึกค่าบริการอัตโนมัติ… เวอร์ชัน 1"
 * - "[job:<id>] ข้อความ" ⇒ "ข้อความ (งานเบื้องหลัง #<8 ตัว>)" · "(job id <id>)" ⇒ "(งานเบื้องหลัง #<8 ตัว>)"
 * - "#<uuid เต็ม>" ⇒ "#<8 ตัว>"
 */
export function auditSystemReasonText(reason: string): string {
  let text = reason
  if (text.includes(LEGACY_SNAPSHOT_HEADLINE)) {
    text = text.replaceAll(LEGACY_SNAPSHOT_HEADLINE, SERVICE_FEE_SNAPSHOT_HEADLINE).replace(LEGACY_TEMPLATE_VERSION, '$1 เวอร์ชัน $2')
  }
  for (const [legacy, current] of LEGACY_PHRASES) text = text.replaceAll(legacy, current)
  const tac = LEGACY_TAC_JOB.exec(text)
  if (tac !== null) {
    const ref = tac[1] ?? ''
    const tag = UUID_ONLY.test(ref) ? ` ${displayTag(ref)}` : ''
    text = `อัปเดตฐาน TAC อัตโนมัติ${tag}${text.slice(tac[0].length)}`
  }
  text = text.replace(LEGACY_TAC_ACTOR, (_whole: string, headline: string, id: string) => `${headline} ${displayTag(id)}`)
  const leading = LEGACY_LEADING_JOB.exec(text)
  if (leading !== null) {
    const id = leading[1] ?? ''
    const rest = text.slice(leading[0].length)
    text = id === '' ? rest : `${rest} ${displayTag(id)}`
  }
  text = text.replace(LEGACY_JOB_BRACKET, (_whole: string, id: string) => (id === '' ? '' : displayTag(id)))
  text = text.replace(LEGACY_JOB_ID, (_whole: string, id: string) => `งานเบื้องหลัง #${shortJobId(id)}`)
  return text.replace(FULL_JOB_REF, (_whole: string, id: string) => `#${shortJobId(id)}`)
}

// ── ค่าในตาราง "ค่าก่อน / หลัง" ───────────────────────────────────────────────

function invert(map: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(Object.entries(map).map(([key, value]) => [value, key]))
}

const COMPANY_DOCUMENT_BY_SEGMENT = invert(COMPANY_DOCUMENT_PATH_SEGMENT)
const LOT_DOCUMENT_BY_BASENAME = invert(LOT_DOCUMENT_BASENAME)

function own(map: Readonly<Record<string, string>>, key: string | undefined): string | undefined {
  return key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined
}

interface StoragePathRule {
  pattern: RegExp
  label: (match: RegExpExecArray) => string
}

/** prefix ของ path ไฟล์ในที่เก็บ (ตัวสร้าง path อยู่ในโมดูลของแต่ละไฟล์ — `lib/uploads/references.ts` รวมคอลัมน์) */
const STORAGE_PATH_RULES: readonly StoragePathRule[] = [
  {
    pattern: /^cases\/[^/]+\/field_evidence\/([a-z_]+)\/[^/]+$/,
    label: (m) => `หลักฐานปิดงาน — ${own(FIELD_MEDIA_LABEL, m[1]) ?? 'ไฟล์'}`,
  },
  { pattern: /^cases\/[^/]+\/([a-z_]+)\/[^/]+$/, label: (m) => own(DOCUMENT_SLOT_LABEL, m[1]) ?? 'เอกสารเคส' },
  {
    pattern: /^finance-companies\/[^/]+\/documents\/([a-z-]+)\/[^/]+$/,
    label: (m) => {
      const type = m[1] === undefined ? undefined : COMPANY_DOCUMENT_BY_SEGMENT.get(m[1])
      return own(COMPANY_DOCUMENT_LABEL, type) ?? 'เอกสารบริษัทไฟแนนซ์'
    },
  },
  {
    pattern: /^handover-lots\/[^/]+\/([a-z-]+)\/[^/]+$/,
    label: (m) => {
      const document = m[1] === undefined ? undefined : LOT_DOCUMENT_BY_BASENAME.get(m[1])
      return own(LOT_DOCUMENT_LABEL, document) ?? 'เอกสารล็อตส่งมอบ'
    },
  },
  { pattern: /^assets\/[^/]+\/intake\/[^/]+$/, label: () => 'รูปทรัพย์ตอนรับเข้าคลัง' },
  { pattern: /^expenses\/[^/]+\/receipts\/[^/]+$/, label: () => 'ใบเสร็จของรายการเบิก' },
  { pattern: /^advances\/[^/]+\/returns\/[^/]+$/, label: () => 'หลักฐานการคืนเงินทดรอง' },
  { pattern: /^customer-wht\/[^/]+\/[^/]+$/, label: () => 'หนังสือรับรองหัก ณ ที่จ่ายจากลูกค้า' },
  { pattern: /^bank-transactions\/[^/]+\/refund\/[^/]+$/, label: () => 'หลักฐานการคืนเงิน' },
  { pattern: /^substitute-receipts\/[^/]+\/signed\/[^/]+$/, label: () => 'ใบรับรองแทนใบเสร็จที่ลงนามแล้ว' },
  { pattern: /^tax-invoices\/[^/]+\/credit-notes\/[^/]+$/, label: () => 'ไฟล์ใบลดหนี้/ใบเพิ่มหนี้' },
  { pattern: /^payout-batches\/[^/]+\/[^/]+$/, label: () => 'ไฟล์โอนเงิน' },
  { pattern: /^payees\/[^/]+\/id-documents\/[^/]+$/, label: () => 'เอกสารยืนยันตัวตนผู้รับเงิน' },
  { pattern: /^organization\/[^/]+\/logo\/[^/]+$/, label: () => 'โลโก้บริษัท' },
  { pattern: /^organization\/[^/]+\/signature\/[^/]+$/, label: () => 'ลายเซ็นผู้มีอำนาจ' },
  { pattern: /^organization\/[^/]+\/device-tac\/[^/]+$/, label: () => 'ไฟล์ฐาน TAC' },
  { pattern: new RegExp(`^${UUID_SOURCE}/[^/]+/[^/]+$`, 'i'), label: () => 'ไฟล์รายงาน' },
]

const LEADING_UUID = new RegExp(`^${UUID_SOURCE}-`, 'i')
const UUID_FILE = new RegExp(`^${UUID_SOURCE}(\\.[A-Za-z0-9]+)?$`, 'i')

/** ชื่อไฟล์ที่แสดง — ตัด UUID นำหน้า (กันชื่อซ้ำ) · ไม่มีชื่อเดิมเหลือ ⇒ "ไฟล์ PDF" */
function storageFileName(segment: string): string {
  const unique = UUID_FILE.exec(segment)
  if (unique !== null) {
    const extension = unique[1]?.slice(1).toUpperCase()
    return extension === undefined ? 'ไฟล์' : `ไฟล์ ${extension}`
  }
  const name = segment.replace(LEADING_UUID, '')
  return name === '' ? 'ไฟล์' : name
}

/**
 * ช่องชื่อไฟล์ที่เก็บชื่อพร้อม UUID นำหน้า (`<uuid>-idcard8.jpg`) ⇒ ชื่อเดิม `idcard8.jpg`
 * ให้ตรงกับช่อง "ไฟล์" ในหน้าต่างเดียวกัน (ตรวจซ้ำ staging SV6-R4-01) · ไม่มี UUID นำหน้า ⇒ `null` (แสดงค่าเดิม)
 */
export function auditStoredFileNameText(value: string): string | null {
  if (!LEADING_UUID.test(value) && !UUID_FILE.test(value)) return null
  return storageFileName(value)
}

/**
 * path ไฟล์ในที่เก็บ (`cases/<id>/national_id_doc/<uuid>-idcard.jpg`) ⇒ "ชนิดเอกสาร · ชื่อไฟล์"
 * ไม่ใช่ path ที่รู้จัก ⇒ `null` (ผู้เรียกแสดงค่าเดิม) · path เต็มยังอยู่ใน DB/tooltip
 */
export function auditStoragePathText(value: string): string | null {
  if (/\s/.test(value) || value.includes('://') || value.includes('..')) return null
  for (const rule of STORAGE_PATH_RULES) {
    const match = rule.pattern.exec(value)
    if (match === null) continue
    const segment = value.slice(value.lastIndexOf('/') + 1)
    return `${rule.label(match)} · ${storageFileName(segment)}`
  }
  return null
}

/**
 * กุญแจนับครั้งที่ใส่รหัสผิด (`login-throttle.ts` — ค่าที่เก็บใช้ค้นต่อ ห้ามเปลี่ยนรูปแบบ) ⇒ ข้อความไทย
 * `identifier:<ชื่อ>` ⇒ "ชื่อผู้ใช้ <ชื่อ>" · `user:<id>` ⇒ "บัญชีผู้ใช้ #<8 ตัว>"
 */
export function auditThrottleKeyText(value: string): string | null {
  const match = /^(identifier|user):(.+)$/.exec(value)
  if (match === null) return null
  const kind = match[1]
  const subject = match[2] ?? ''
  return kind === 'identifier' ? `ชื่อผู้ใช้ ${subject}` : `บัญชีผู้ใช้ #${shortJobId(subject)}`
}

/** ชื่อคอลัมน์ของรูปแบบไฟล์ (โอนเงิน + รายการเดินบัญชี) — ป้ายชุดเดียวกับหน้าตั้งค่ารูปแบบไฟล์ */
const BANK_FILE_COLUMN_LABEL: Readonly<Record<string, string>> = { ...STATEMENT_COLUMN_LABEL, ...PAYMENT_FILE_COLUMN_LABEL }

/** `column_mapping` "receiving_bank_code,amount" ⇒ "รหัสธนาคารผู้รับ, จำนวนเงิน" · ไม่รู้จักสักคอลัมน์ ⇒ `null` */
export function auditColumnMappingText(value: string): string | null {
  const columns = value
    .split(/[\n,]/)
    .map((column) => column.trim())
    .filter((column) => column !== '')
  if (columns.length === 0) return null
  const labels = columns.map((column) => own(BANK_FILE_COLUMN_LABEL, column.toLowerCase()))
  if (labels.every((label) => label === undefined)) return null
  return columns.map((column, index) => labels[index] ?? column).join(', ')
}
