import { CASE_STATUS_RULES, isCaseStatusAction } from '@/lib/cases/state-machine'
import { caseStatusLabel } from '@/lib/cases/status-display'

/**
 * ประวัติสถานะเคส (staging E-004) — สร้างจาก audit ของเคสฝั่ง server (`audit_logs` target `cases`)
 * ธุรการไม่ต้องเปิดเมนู Audit Log · **pure** ไม่มี I/O
 *
 * - เรียงเก่า → ใหม่ · แถว `create` = "สร้างเคส" · แถวที่สถานะไม่เปลี่ยนถูกตัดทิ้ง
 * - หมายเหตุแสดงเฉพาะ action ที่ผู้ใช้ต้องกรอกเหตุผล (`reasonRequired` — ไม่รับเคส/ขอข้อมูลเพิ่ม/รีไซเคิล)
 *   เหตุผลที่ระบบเขียนเอง (เช่น snapshot ค่าบริการตอนรับเคส) ไม่แสดง
 */

export interface CaseStatusAuditRow {
  action: string
  beforeStatus: string | null
  afterStatus: string | null
  /** `after_data.action` — ชื่อ transition ของ state machine */
  transition: string | null
  reason: string | null
  actorName: string | null
  createdAt: Date
}

export interface CaseStatusTimelineEntry {
  at: string
  label: string
  fromStatus: string | null
  toStatus: string
  toStatusLabel: string
  note: string | null
  actorName: string | null
}

export function buildCaseStatusTimeline(rows: readonly CaseStatusAuditRow[]): CaseStatusTimelineEntry[] {
  return [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .flatMap((row): CaseStatusTimelineEntry[] => {
      if (row.action === 'create') {
        const status = row.afterStatus ?? 'draft'
        return [
          {
            at: row.createdAt.toISOString(),
            label: 'สร้างเคส',
            fromStatus: null,
            toStatus: status,
            toStatusLabel: caseStatusLabel(status),
            note: null,
            actorName: row.actorName,
          },
        ]
      }
      if (row.afterStatus === null || row.afterStatus === row.beforeStatus) return []
      const rule = row.transition !== null && isCaseStatusAction(row.transition) ? CASE_STATUS_RULES[row.transition] : null
      const note = rule?.reasonRequired === true ? (row.reason?.trim() || null) : null
      return [
        {
          at: row.createdAt.toISOString(),
          label: rule?.label ?? `เปลี่ยนสถานะเป็น ${caseStatusLabel(row.afterStatus)}`,
          fromStatus: row.beforeStatus,
          toStatus: row.afterStatus,
          toStatusLabel: caseStatusLabel(row.afterStatus),
          note,
          actorName: row.actorName,
        },
      ]
    })
}

/** ผู้ใช้ฝั่งบริษัทไฟแนนซ์ (พอร์ทัล) — เห็นลำดับสถานะ แต่ไม่เห็นชื่อพนักงานหลังบ้านและบันทึกภายใน */
export function redactCaseStatusTimelineForCompany(
  entries: readonly CaseStatusTimelineEntry[],
): CaseStatusTimelineEntry[] {
  return entries.map((entry) => ({ ...entry, actorName: null, note: null }))
}

/** ชื่อฟิลด์ของ `case_edit_history.changed_fields` บนหน้าจอ (staging E-004) — ชุดเดียวกับ payload ของ `updateCase` */
const CASE_EDIT_FIELD_LABEL: Readonly<Record<string, string>> = {
  caseRef: 'เลขที่สัญญา',
  financeCompanyId: 'บริษัทไฟแนนซ์',
  debtorName: 'ชื่อลูกหนี้',
  debtorNationality: 'สัญชาติ',
  debtorNationalityOther: 'สัญชาติ (อื่น ๆ)',
  debtorNationalId: 'เลขบัตรประชาชน',
  debtorPassportNo: 'เลขหนังสือเดินทาง',
  debtorPhoneMobile: 'เบอร์มือถือ',
  debtorPhoneWork: 'เบอร์ที่ทำงาน',
  debtorLineId: 'LINE ID',
  debtorFacebook: 'Facebook',
  assetType: 'ประเภททรัพย์',
  assetBrandModel: 'ยี่ห้อ/รุ่น',
  deviceModelId: 'รุ่นอุปกรณ์',
  assetImeiSerial: 'IMEI / Serial',
  assetCapacity: 'ความจุ',
  assetColor: 'สี',
  outstandingDebtSatang: 'มูลหนี้คงเหลือ',
  documentMode: 'รูปแบบเอกสาร',
  productPhotoInContract: 'รูปสินค้าในไฟล์สัญญา',
  addressCurrent: 'ที่อยู่ปัจจุบัน',
  addressWork: 'ที่อยู่ที่ทำงาน',
  addressIdCard: 'ที่อยู่ตามบัตร',
  contactCount: 'ผู้ติดต่อ',
}

/** รายชื่อฟิลด์ที่แก้ไข (ภาษาไทย ไม่ซ้ำ) — ฟิลด์ที่ไม่รู้จักรวมเป็น "ข้อมูลอื่น" ไม่โชว์ชื่อคอลัมน์ดิบ */
export function caseEditedFieldsText(changedFields: readonly string[]): string {
  const labels = changedFields.map((field) => CASE_EDIT_FIELD_LABEL[field] ?? 'ข้อมูลอื่น')
  const unique = [...new Set(labels)]
  return unique.length === 0 ? '—' : unique.join(', ')
}
