import type { CaseStatusValue } from '@/lib/cases/state-machine'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ข้อความ + กลุ่มสีของสถานะ/ช่องทางเคส (`38` §7.2 · mockup `statusBadge()`/`sourceBadge()`)
 * — **pure ล้วน** ใช้ร่วมทุกหน้าที่แสดงเคส (38 · 40 · 41 · 97) ห้ามประกาศ label/สีซ้ำในหน้าจอตัวเอง
 *
 * สีมาจาก 10 กลุ่มของ `04` §8.1 เท่านั้น (ห้ามใส่คลาสสีเอง — Rule 05) ส่งเข้าทาง prop `group`
 * ของ `<StatusBadge>` เพราะสถานะฝั่งเคสหลายตัวยังไม่มีในตารางกลาง `lib/ui/status-badge.ts`
 */

export const CASE_STATUS_LABEL: Readonly<Record<CaseStatusValue, string>> = {
  draft: 'ร่าง',
  pending_review: 'รอพิจารณา',
  need_info: 'ขอข้อมูลเพิ่ม',
  approved: 'รับเคสแล้ว',
  rejected: 'ไม่รับเคส',
  active: 'กำลังติดตาม',
  closed_success: 'ปิดงานสำเร็จ',
  closed_fail: 'ปิดงานไม่สำเร็จ',
  pending_recycle_review: 'รออนุมัติรีไซเกิล',
}

/**
 * สถานะ → กลุ่มสีตาม `04` §8.1
 * - `need_info` = ม่วง (mockup `statusBadge()` ใช้ `bg-purple-100` = กลุ่ม `cleared`)
 * - `pending_recycle_review` = เหลืองเหมือนงานที่รอคนตัดสิน
 * - `closed_fail` = แดง (ผลลัพธ์ไม่สำเร็จ) ส่วน `closed_success` = เขียว
 */
const CASE_STATUS_GROUP: Readonly<Record<CaseStatusValue, StatusBadgeGroup>> = {
  draft: 'neutral',
  pending_review: 'pending',
  need_info: 'cleared',
  approved: 'success',
  rejected: 'critical',
  active: 'sent',
  closed_success: 'success',
  closed_fail: 'critical',
  pending_recycle_review: 'pending',
}

function isCaseStatus(value: string): value is CaseStatusValue {
  return value in CASE_STATUS_LABEL
}

/** ข้อความสถานะภาษาไทย — สถานะที่ไม่รู้จักคืนค่าดิบ (ไม่ซ่อนความผิดปกติ) */
export function caseStatusLabel(status: string | null | undefined): string {
  if (typeof status !== 'string' || status === '') return '—'
  return isCaseStatus(status) ? CASE_STATUS_LABEL[status] : status
}

/** กลุ่มสีของสถานะ — สถานะที่ไม่รู้จักตกกลุ่มเทากลาง (เหมือน mapper กลาง) */
export function caseStatusBadgeGroup(status: string | null | undefined): StatusBadgeGroup {
  if (typeof status !== 'string' || !isCaseStatus(status)) return 'neutral'
  return CASE_STATUS_GROUP[status]
}

export const CASE_SOURCE_CHANNELS = ['api', 'import', 'manual'] as const
export type CaseSourceChannel = (typeof CASE_SOURCE_CHANNELS)[number]

export const CASE_SOURCE_LABEL: Readonly<Record<CaseSourceChannel, string>> = {
  api: 'API',
  import: 'Import',
  manual: 'กรอกมือ',
}

/** สีป้ายช่องทาง — ป้ายบอก "ที่มา" ไม่ใช่สถานะ จึงใช้ `<Badge>` ทั่วไปตาม mockup `sourceBadge()` */
export const CASE_SOURCE_BADGE_CLASS: Readonly<Record<CaseSourceChannel, string>> = {
  api: 'border border-blue-200 bg-blue-50 text-blue-700',
  import: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
  manual: 'border border-slate-200 bg-slate-50 text-slate-600',
}

export function caseSourceLabel(source: string | null | undefined): string {
  if (typeof source !== 'string' || source === '') return '—'
  return source in CASE_SOURCE_LABEL ? CASE_SOURCE_LABEL[source as CaseSourceChannel] : source
}

export function caseSourceBadgeClass(source: string | null | undefined): string {
  if (typeof source !== 'string' || !(source in CASE_SOURCE_BADGE_CLASS)) {
    return CASE_SOURCE_BADGE_CLASS.manual
  }
  return CASE_SOURCE_BADGE_CLASS[source as CaseSourceChannel]
}

export const ASSET_TYPE_LABEL: Readonly<Record<string, string>> = {
  smartphone: 'สมาร์ทโฟน',
  tablet: 'Tablet / iPad',
}

export function assetTypeLabel(assetType: string | null | undefined): string {
  if (typeof assetType !== 'string' || assetType === '') return '—'
  return ASSET_TYPE_LABEL[assetType] ?? assetType
}
