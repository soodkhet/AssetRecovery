import type { BankAccountUsage, BankFileTestStatus } from '@/lib/generated/prisma/enums'
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

/** สถานะใช้งาน/ปิดใช้งานของตารางตั้งค่า — กลุ่มสีมาจาก mapper กลางเท่านั้น */
export const ACTIVE_BADGE_GROUP: Readonly<Record<'active' | 'inactive', StatusBadgeGroup>> = {
  active: 'success',
  inactive: 'neutral',
}
