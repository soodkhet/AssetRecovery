import type {
  BankAccountUsage,
  BankFileTestStatus,
  WhtFilingForm,
} from '@/lib/generated/prisma/enums'
import type { WhtBasis } from '@/lib/settings/tax-profile'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ค่าคงที่ที่ใช้ร่วมทุกแท็บของ "ตั้งค่าบัญชี/การเงิน" (ไฟล์ 13)
 *
 * ⚠️ ไฟล์นี้ต้อง **pure** (import ได้เฉพาะ type + ค่าคงที่) เพราะถูก import จาก component
 * ฝั่ง client — ห้ามลาก Prisma/`lib/api/http` เข้ามา (ดูกับดัก 2026-08-14 ใน `REUSE_INDEX`)
 */

/** capability ที่ API ของไฟล์ 13 ใช้กับทุก mutation ทั่วไป (`13` §11 · `25` §7.1) */
export const MANAGE_SETTINGS = 'manage_settings'
/** capability สำหรับอ่าน — แท็บทั้งหมดใช้ตัวเดียวกัน */
export const VIEW_MASTER_DATA = 'view_master_data'

/**
 * ⚠️ 3 แท็บนี้ **ไม่ได้ใช้ `manage_settings`** — API ตรวจด้วย capability เฉพาะของตัวเอง
 * (`25` §16.1 ล็อกไว้ให้ Superadmin เท่านั้น) ⇒ `<Can>` ต้องส่งตัวเดียวกับที่ route ใช้
 * ไม่งั้นปุ่มโผล่ให้กดแล้วโดน 403 (UI hide เป็นแค่ UX — API ปฏิเสธซ้ำเสมอ ตาม DEC-002)
 */
export const MANAGE_TAX_PROFILES = 'manage_tax_profiles'
/** ระยะเก็บเอกสารลูกหนี้ (PDPA — มติ PO 06/10/2569 U97) — Superadmin/บริหาร */
export const MANAGE_DATA_RETENTION = 'manage_data_retention'
/** ค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 UAT U8) — Superadmin/บริหาร */
export const MANAGE_WHT_POLICY = 'manage_wht_policy'
export const MANAGE_INVOICE_NUMBERING = 'manage_invoice_numbering'
/** ปฏิทินวันหยุด (มติ PO 06/10/2569 UAT U93) — ธุรการ/บัญชี/การเงิน manage · บริหาร view */
export const MANAGE_HOLIDAYS = 'manage_holidays'
export const MANAGE_ROLES = 'manage_roles'
/** แคตตาล็อกแบรนด์/รุ่นเครื่อง (มติ PO U155) — ธุรการ manage · บริหาร view */
export const MANAGE_DEVICE_CATALOG = 'manage_device_catalog'

export type StatusFilter = 'active' | 'inactive' | 'all'

export const STATUS_FILTER_LABEL: Readonly<Record<StatusFilter, string>> = {
  active: 'สถานะ: ใช้งาน',
  inactive: 'สถานะ: ปิดใช้งาน',
  all: 'สถานะ: ทั้งหมด',
}

export const BANK_ACCOUNT_USAGE_OPTION: Readonly<Record<BankAccountUsage, string>> = {
  receive: 'รับเงิน (Receive)',
  pay: 'จ่ายเงิน (Pay)',
  both: 'รับและจ่าย (Both)',
}

export const ACCOUNT_TYPE_LABEL: Readonly<Record<'savings' | 'current', string>> = {
  savings: 'ออมทรัพย์',
  current: 'กระแสรายวัน',
}

/**
 * สถานะทดสอบไฟล์ธนาคาร (`13` §8 — `pending → passed|failed`)
 *
 * สีมาจาก **กลุ่มสีกลาง 10 กลุ่ม** (`04` §8.1) ไม่ใช่คลาสที่เขียนเอง — `passed`/`failed` ยังไม่อยู่
 * ในตาราง `STATUS_GROUP` จึงระบุ `group` ตรง ๆ ตามที่ `<StatusBadge>` เปิดทางไว้
 */
export const BANK_FILE_TEST_BADGE: Readonly<Record<BankFileTestStatus, { label: string; group: StatusBadgeGroup }>> = {
  pending: { label: 'ยังไม่ทดสอบ', group: 'pending' },
  passed: { label: 'ทดสอบผ่าน', group: 'success' },
  failed: { label: 'ทดสอบไม่ผ่าน', group: 'critical' },
}

/** ฐานที่ใช้คำนวณ WHT (`13` §6.4 · Rule 01 — มาตรฐานคือหักจากยอด **ก่อน VAT** เสมอ) */
export const WHT_BASIS_LABEL: Readonly<Record<WhtBasis, string>> = {
  before_vat: 'ยอดก่อน VAT (มาตรฐาน)',
  gross_amount: 'ยอดรวมทั้งสิ้น',
}

/** แบบนำส่ง WHT ตามชนิดผู้รับเงิน (`33` §6.1) */
export const WHT_FILING_FORM_LABEL: Readonly<Record<WhtFilingForm, string>> = {
  PND3: 'ภ.ง.ด.3 (บุคคลธรรมดา)',
  PND53: 'ภ.ง.ด.53 (นิติบุคคล)',
  PND1: 'ภ.ง.ด.1 (เงินได้ 40(1)/40(2))',
}

/** สถานะใช้งาน/ปิดใช้งานของตารางตั้งค่า — กลุ่มสีมาจาก mapper กลางเท่านั้น */
export const ACTIVE_BADGE_GROUP: Readonly<Record<'active' | 'inactive', StatusBadgeGroup>> = {
  active: 'success',
  inactive: 'neutral',
}
