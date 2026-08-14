import type { FieldGroup } from '@/lib/field/field-status'
import type { FieldAddressDto, FieldCaseListItemDto } from '@/lib/field/types'
import type { AssignmentStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ข้อความ / ปุ่ม / การจัดกลุ่มของหน้าจอ Field Tracker (`41` §7.2–§7.5, §7.7) — **pure ล้วน**
 *
 * ⚠️ หน้าจอ (mobile + desktop) **ห้าม if สถานะเอง** — ปุ่มบนการ์ดต้องมาจาก {@link fieldCardAction}
 * และแท็บต้องมาจาก `fieldGroupOf()` ของ `lib/field/field-status.ts` เท่านั้น
 * ⚠️ วันที่บนจอเป็น **พ.ศ.** เสมอผ่าน `fmtDate` (Rule 01) — ที่นี่จัดการแค่ข้อความ/ลำดับ ไม่ format วันที่เอง
 */

export const FIELD_STATUS_LABEL: Readonly<Record<AssignmentStatus, string>> = {
  pending_accept: 'รอรับงาน',
  accepted_unscheduled: 'รับงานแล้ว (ยังไม่จัดวัน)',
  scheduled: 'กำลังติดตาม',
  closed_success: 'ปิดงานสำเร็จ',
  closed_fail: 'ปิดงานไม่สำเร็จ',
  needs_revision: 'ต้องแก้ไขหลักฐาน',
  reassigned_away: 'ถูกโอนไปคนอื่น',
}

/** 10 กลุ่มสีตายตัวของ `04` §8.1 — ห้ามใส่คลาสสีเองในหน้าจอ */
const FIELD_STATUS_GROUP: Readonly<Record<AssignmentStatus, StatusBadgeGroup>> = {
  pending_accept: 'pending',
  accepted_unscheduled: 'sent',
  scheduled: 'info',
  closed_success: 'success',
  closed_fail: 'critical',
  needs_revision: 'warning',
  reassigned_away: 'superseded',
}

export function fieldStatusLabel(status: AssignmentStatus): string {
  return FIELD_STATUS_LABEL[status]
}

export function fieldStatusBadgeGroup(status: AssignmentStatus): StatusBadgeGroup {
  return FIELD_STATUS_GROUP[status]
}

/** ชื่อแท็บ 4 กลุ่ม (`41` §7.2/§7.3/§7.5/§7.11) */
export const FIELD_GROUP_LABEL: Readonly<Record<FieldGroup, string>> = {
  pending_accept: 'รอรับงาน',
  accepted: 'รับงานแล้ว',
  tracking: 'กำลังติดตาม',
  closed: 'จบงาน',
}

/** badge บนการ์ด (`41` §7.5) — Draft ส้ม · คำขอเปลี่ยนผู้รับผิดชอบม่วง */
export const DRAFT_BADGE_LABEL = 'Draft'
export const DRAFT_BADGE_GROUP: StatusBadgeGroup = 'warning'
export const REASSIGNMENT_BADGE_LABEL = 'รอตอบคำขอเปลี่ยน'
export const REASSIGNMENT_BADGE_GROUP: StatusBadgeGroup = 'cleared'

// ── ปุ่มหลักของการ์ด ────────────────────────────────────────────────────────

export const FIELD_CARD_ACTIONS = [
  'accept',
  'schedule',
  'start_work',
  'finish_work',
  'revise_evidence',
  'respond_reassignment',
] as const
export type FieldCardActionKind = (typeof FIELD_CARD_ACTIONS)[number]

export interface FieldCardAction {
  kind: FieldCardActionKind
  label: string
  /** โทนปุ่มของ UI Kit — `reassign` = ม่วง (`41` §7.5) · `revise` = ส้ม */
  tone: 'primary' | 'secondary' | 'reassign' | 'revise'
}

const CARD_ACTION: Readonly<Record<FieldCardActionKind, FieldCardAction>> = {
  accept: { kind: 'accept', label: 'รับงาน', tone: 'primary' },
  schedule: { kind: 'schedule', label: 'จัดวันที่', tone: 'secondary' },
  start_work: { kind: 'start_work', label: 'เริ่มงาน', tone: 'primary' },
  finish_work: { kind: 'finish_work', label: 'จบงาน', tone: 'primary' },
  revise_evidence: { kind: 'revise_evidence', label: 'แก้ไขหลักฐาน', tone: 'revise' },
  respond_reassignment: { kind: 'respond_reassignment', label: 'ตอบคำขอ', tone: 'reassign' },
}

export interface FieldCardInput {
  status: AssignmentStatus
  hasDraft: boolean
  hasPendingReassignment: boolean
  /** มุมมองทีม (`41` §7.3/§11) = อ่านอย่างเดียวเสมอ — ไม่มีปุ่มทำงานของเพื่อนร่วมทีม */
  readOnly?: boolean
}

/**
 * ปุ่มหลักของการ์ด 1 ใบ (`41` §7.2/§7.3/§7.5) — คืน `null` เมื่อไม่มีปุ่ม (จบงานแล้ว/มุมมองทีม)
 *
 * ลำดับความสำคัญ: คำขอเปลี่ยนผู้รับผิดชอบค้างตอบ **มาก่อนเสมอ** (§7.5 ปุ่มม่วงแทนที่ปุ่มเริ่มงาน/จบงาน)
 * แล้วจึงว่าตามสถานะ — `scheduled` ที่มี draft ค้าง = "จบงาน" ที่เหลือ = "เริ่มงาน"
 */
export function fieldCardAction(input: FieldCardInput): FieldCardAction | null {
  if (input.readOnly === true) return null
  if (input.hasPendingReassignment) return CARD_ACTION.respond_reassignment

  switch (input.status) {
    case 'pending_accept':
      return CARD_ACTION.accept
    case 'accepted_unscheduled':
      return CARD_ACTION.schedule
    case 'scheduled':
      return input.hasDraft ? CARD_ACTION.finish_work : CARD_ACTION.start_work
    case 'needs_revision':
      return CARD_ACTION.revise_evidence
    default:
      return null
  }
}

// ── การจัดกลุ่มรายการ ───────────────────────────────────────────────────────

export interface FieldDaySection {
  /** `YYYY-MM-DD` (คอลัมน์ `DATE`) — หน้าจอแปลงเป็น พ.ศ. ด้วย `fmtDate` */
  date: string
  items: FieldCaseListItemDto[]
}

/**
 * จัดกลุ่มเคสตามวันลงพื้นที่ เรียงวันจากใกล้ไปไกล และในวันเรียงตาม `scheduleOrder` (`41` §7.5)
 * เคสที่ยังไม่มี `scheduleDate` ถูกตัดออก (ยังไม่ถึงแท็บนี้)
 */
export function groupCasesByDate(items: readonly FieldCaseListItemDto[]): FieldDaySection[] {
  const byDate = new Map<string, FieldCaseListItemDto[]>()
  for (const item of items) {
    if (item.scheduleDate === null) continue
    const bucket = byDate.get(item.scheduleDate)
    if (bucket === undefined) byDate.set(item.scheduleDate, [item])
    else bucket.push(item)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      items: [...list].sort((a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0)),
    }))
}

export interface TrackingSplit {
  /** เคสที่ถูกตีกลับหลักฐาน — แสดงเป็นบล็อกส้มบนสุด (`41` §7.5 · §10.1) */
  needsRevision: FieldCaseListItemDto[]
  /** เคสที่จัดวันแล้ว จัดกลุ่มตามวัน */
  days: FieldDaySection[]
}

/** แท็บ "กำลังติดตาม" มี 2 ส่วน — `needs_revision` อยู่กลุ่มเดียวกันแต่แยกบล็อกบนสุด */
export function splitTrackingCases(items: readonly FieldCaseListItemDto[]): TrackingSplit {
  return {
    needsRevision: items.filter((item) => item.status === 'needs_revision'),
    days: groupCasesByDate(items.filter((item) => item.status === 'scheduled')),
  }
}

export interface FieldAgentColumn {
  agentId: string
  agentName: string
  items: FieldCaseListItemDto[]
}

/** มุมมองทีมของแท็บ "รับงานแล้ว" — 1 คอลัมน์ = 1 คน (`41` §7.3) เรียงชื่อไทย · ตัวเองมาก่อนเสมอ */
export function groupCasesByAgent(
  items: readonly FieldCaseListItemDto[],
  currentUserId: string,
): FieldAgentColumn[] {
  const byAgent = new Map<string, FieldAgentColumn>()
  for (const item of items) {
    const column = byAgent.get(item.agentId)
    if (column === undefined) {
      byAgent.set(item.agentId, { agentId: item.agentId, agentName: item.agentName, items: [item] })
    } else {
      column.items.push(item)
    }
  }

  return [...byAgent.values()].sort((a, b) => {
    if (a.agentId === currentUserId) return -1
    if (b.agentId === currentUserId) return 1
    return a.agentName.localeCompare(b.agentName, 'th')
  })
}

/**
 * ลำดับใหม่หลังลากการ์ด (`41` §7.5 `reorder_schedule`) — ย้าย `draggedId` ไปยังตำแหน่งของ `targetId`
 * คืน `null` เมื่อไม่มีอะไรเปลี่ยน (ลากทับตัวเอง/ไม่พบรหัส) เพื่อให้หน้าจอไม่ยิง API เปล่า
 *
 * ผลลัพธ์ = `orderedCaseIds` ของ `PATCH /api/field/cases/reorder` ทั้งวัน (BE recompute เอง)
 */
export function reorderCaseIds(
  orderedIds: readonly string[],
  draggedId: string,
  targetId: string,
): string[] | null {
  if (draggedId === targetId) return null
  const from = orderedIds.indexOf(draggedId)
  const to = orderedIds.indexOf(targetId)
  if (from === -1 || to === -1) return null

  const next = [...orderedIds]
  next.splice(from, 1)
  next.splice(to, 0, draggedId)
  return next
}

/**
 * เพื่อนร่วมทีมที่มีเคสในจังหวัดเดียวกัน (`41` §7.4 banner ม่วง) — **ข้อมูลแนะนำ ไม่บล็อกการเลือกวัน**
 * ใช้รายการจากมุมมองทีม (`view=team`) ซึ่งเป็นเคสที่ยังไม่ปิดของทั้งทีม
 */
export function teammatesInProvince(
  teamItems: readonly FieldCaseListItemDto[],
  province: string | null,
  currentUserId: string,
): string[] {
  if (province === null || province === '') return []
  const names = new Set<string>()
  for (const item of teamItems) {
    if (item.agentId === currentUserId) continue
    if (item.province !== province) continue
    names.add(item.agentName)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'th'))
}

// ── ที่อยู่ + ช่องทางติดต่อ (deep link — `41` §6.3 · §7.7) ────────────────────

/** ที่อยู่แบบบรรทัดเดียว — คืน `null` เมื่อไม่มีข้อมูลเลย (หน้าจอแสดง "— ไม่มีข้อมูล —") */
export function formatFieldAddress(address: FieldAddressDto | null | undefined): string | null {
  if (address === null || address === undefined) return null
  const parts = [
    address.detail,
    address.subdistrict === null || address.subdistrict === '' ? null : `ตำบล${address.subdistrict}`,
    address.district === null || address.district === '' ? null : `อำเภอ${address.district}`,
    address.province === null || address.province === '' ? null : `จังหวัด${address.province}`,
    address.postalCode,
  ].filter((part): part is string => part !== null && part !== '')
  return parts.length === 0 ? null : parts.join(' ')
}

/** ลิงก์เปิด Google Maps ของที่อยู่ (`41` §7.7 — ทุกที่อยู่มีปุ่มของตัวเองแยกอิสระ) */
export function mapsSearchHref(address: FieldAddressDto | null | undefined): string | null {
  const full = formatFieldAddress(address)
  return full === null ? null : `https://www.google.com/maps/search/${encodeURIComponent(full)}`
}

/** ลิงก์เปิดแผนที่ของพิกัด (จุดเช็คอิน/จุดเริ่มเดินทาง) */
export function mapsPointHref(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}

/** `tel:` — ตัดอักขระที่ไม่ใช่ตัวเลข/`+` ออก (เบอร์ในระบบเก็บแบบมีขีดได้) */
export function telHref(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) return null
  const digits = phone.replace(/[^\d+]/g, '')
  return digits === '' ? null : `tel:${digits}`
}

/** เปิดแชท LINE ด้วย LINE ID (`41` §6.3) */
export function lineHref(lineId: string | null | undefined): string | null {
  const value = lineId?.trim() ?? ''
  return value === '' ? null : `https://line.me/ti/p/~${encodeURIComponent(value)}`
}

/** ค้นหาโปรไฟล์ Facebook จากชื่อ/ลิงก์ที่บันทึกไว้ (`41` §6.3 — ค้นหา ไม่ใช่เปิดโปรไฟล์ตรง) */
export function facebookHref(facebook: string | null | undefined): string | null {
  const value = facebook?.trim() ?? ''
  if (value === '') return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `https://www.facebook.com/search/people/?q=${encodeURIComponent(value)}`
}

/** ทรัพย์ + IMEI/serial บรรทัดเดียว (`41` §7.7) */
export function assetSummary(input: {
  assetDescription: string | null
  imei?: string | null
  serialNo?: string | null
}): string {
  const base = input.assetDescription === null || input.assetDescription === '' ? '—' : input.assetDescription
  const imei = input.imei ?? ''
  const serialNo = input.serialNo ?? ''
  if (imei !== '') return `${base} (IMEI: ${imei})`
  if (serialNo !== '') return `${base} (S/N: ${serialNo})`
  return base
}
