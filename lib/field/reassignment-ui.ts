import type { FieldCaseListItemDto } from '@/lib/field/types'

/**
 * ตรรกะของ **Pending Reassignment Flow** ฝั่งพนักงานภาคสนาม (`41` §7.8) — **pure ล้วน**
 *
 * - auto-popup เด้ง**ทีละเคส** เมื่อมีคำขอที่ยังไม่ตอบและยังไม่กด "ดูทีหลัง" ในเซสชันนี้
 * - "ดูทีหลัง" ปิด popup ได้ แต่ **badge ม่วงยังค้าง** ที่เมนู/การ์ดจนกว่าจะตอบจริง
 *   (badge นับจาก `hasPendingReassignment` ที่ `field-cases-provider` ⇒ ไม่เกี่ยวกับรายการที่ dismiss)
 * - เคสที่ระบบ auto-resolve ไปแล้ว (ตอบไม่ทัน) **ไม่ใช้ popup** — แจ้งด้วย toast เบา ๆ ครั้งเดียว
 */

export const DECLINE_REASON_MIN_LENGTH = 1

/** เคสที่มีคำขอค้างตอบ (`41` §6.7) — เรียงตามหมดเขตใกล้สุดก่อน เพื่อให้ตอบอันที่จวนแล้วก่อน */
export function pendingReassignmentCases(items: readonly FieldCaseListItemDto[]): FieldCaseListItemDto[] {
  return items.filter((item) => item.hasPendingReassignment)
}

/** เคสถัดไปที่ควรเด้ง auto-popup — คืน `null` เมื่อไม่มี/ถูกกด "ดูทีหลัง" ไปหมดแล้ว */
export function nextReassignmentPopup(
  items: readonly FieldCaseListItemDto[],
  dismissedCaseIds: readonly string[],
): FieldCaseListItemDto | null {
  return pendingReassignmentCases(items).find((item) => !dismissedCaseIds.includes(item.caseId)) ?? null
}

/** ข้อความบนปุ่ม "ไม่ยินยอม" — คืน `null` เมื่อเหตุผลใช้ได้ (`40` §8 `DECLINE_REASON_REQUIRED`) */
export function declineReasonError(reason: string): string | null {
  return reason.trim().length >= DECLINE_REASON_MIN_LENGTH ? null : 'ต้องระบุเหตุผลก่อนยืนยันไม่ยินยอม'
}

export interface ReassignmentCountdown {
  expired: boolean
  /** นาทีที่เหลือ (ปัดลง) — 0 เมื่อหมดเขตแล้ว */
  minutesLeft: number
  label: string
}

/**
 * เวลาที่เหลือก่อนคำขอหมดเขต (`41` §7.8) — **รับ `now` เข้ามา ไม่อ่านนาฬิกาเอง** (เทสต์ได้)
 * หมดเขตแล้ว = job ของไฟล์ 40 จะ auto-resolve ⇒ หน้าจอต้องบอกว่าตอบไม่ได้แล้ว
 */
export function reassignmentCountdown(expiresAt: string, now: Date): ReassignmentCountdown {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return { expired: true, minutesLeft: 0, label: 'หมดเขตตอบแล้ว' }
  }

  const minutesLeft = Math.floor(remainingMs / 60_000)
  const hours = Math.floor(minutesLeft / 60)
  const minutes = minutesLeft % 60
  const label =
    hours > 0 ? `เหลือเวลาตอบอีก ${hours} ชม. ${minutes} นาที` : `เหลือเวลาตอบอีก ${minutes} นาที`
  return { expired: false, minutesLeft, label }
}

// ── toast ของเคสที่ถูกโอนไปเพราะตอบไม่ทัน (`41` §7.8 กล่องท้ายหัวข้อ) ────────

export interface ReassignmentWatchState {
  /** `caseId` → ชื่อลูกหนี้ ของคำขอที่เห็นค้างอยู่ในรอบโหลดก่อนหน้า */
  pending: Readonly<Record<string, string>>
  /** เคสที่ผู้ใช้ตอบเอง (ยินยอม/ไม่ยินยอม) ในเซสชันนี้ — หายจากรายการเพราะเราสั่งเอง ไม่ต้อง toast */
  answered: readonly string[]
  /** เคสที่แจ้ง toast ไปแล้ว — §7.8 บังคับว่าเด้ง**ครั้งเดียว** */
  notified: readonly string[]
}

export const EMPTY_REASSIGNMENT_WATCH: ReassignmentWatchState = { pending: {}, answered: [], notified: [] }

export interface AutoResolvedCase {
  caseId: string
  debtorName: string
}

/**
 * เทียบรายการเคสรอบล่าสุดกับรอบก่อนหน้า แล้วบอกว่าเคสไหน "ถูกโอนไปเพราะตอบไม่ทัน"
 *
 * เคสที่ auto-resolve แล้วจะ**หายจากรายการที่ยังทำงานอยู่** (สถานะกลายเป็น `reassigned_away`
 * ซึ่งอยู่แท็บ "จบงาน" — §7.11) ⇒ ตรวจจากคำขอที่เคยเห็นค้างแล้วหายไปโดยที่ผู้ใช้ไม่ได้ตอบเอง
 */
export function trackReassignments(
  items: readonly FieldCaseListItemDto[],
  watch: ReassignmentWatchState,
): { next: ReassignmentWatchState; autoResolved: AutoResolvedCase[] } {
  const currentIds = new Set(items.map((item) => item.caseId))

  const autoResolved = Object.entries(watch.pending)
    .filter(
      ([caseId]) =>
        !currentIds.has(caseId) && !watch.answered.includes(caseId) && !watch.notified.includes(caseId),
    )
    .map(([caseId, debtorName]) => ({ caseId, debtorName }))

  const pending: Record<string, string> = {}
  for (const item of pendingReassignmentCases(items)) {
    pending[item.caseId] = item.debtorName ?? '—'
  }

  return {
    next: {
      pending,
      answered: watch.answered,
      notified: [...watch.notified, ...autoResolved.map((entry) => entry.caseId)],
    },
    autoResolved,
  }
}

export function reassignedAwayMessage(entry: AutoResolvedCase): string {
  return `เคส "${entry.debtorName}" ถูกโอนไปแล้วเพราะไม่ได้ตอบทันเวลา`
}
