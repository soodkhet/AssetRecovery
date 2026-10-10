import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * กล่อง "ทีมที่เสนอ" (staging E-026) — **pure** · ผู้ใช้เปลี่ยนทีมเอง ⇒ ป้ายเป็น "เลือกเอง" (ไม่ใช่ "ระบบเสนอ")
 * และคำบรรยายบอกว่าทีมที่เลือกอยู่ในพื้นที่หรือไม่ · หัวข้อรายการทีมอื่นนับหลังตัดทีมที่เลือกออกแล้ว
 */
export interface TeamSelectionView {
  badgeLabel: string
  badgeGroup: StatusBadgeGroup
  /** บรรทัดใต้ชื่อทีม */
  areaNote: string
  /** "ระบบเสนอ: X" เมื่อเลือกต่างจากที่เสนอ */
  suggestedNote: string | null
}

export function teamSelectionView(input: {
  province: string
  selectedId: string | null
  suggested: { id: string; name: string } | null
  matchedIds: ReadonlySet<string>
}): TeamSelectionView {
  const chosenManually = input.selectedId !== null && input.suggested !== null && input.selectedId !== input.suggested.id
  const inArea = input.selectedId === null || input.matchedIds.has(input.selectedId)
  return {
    badgeLabel: chosenManually ? 'เลือกเอง' : 'ระบบเสนอ',
    badgeGroup: chosenManually ? 'info' : 'success',
    areaNote: inArea
      ? `ดูแลจังหวัด${input.province}`
      : `นอกพื้นที่จังหวัด${input.province} — ตอนรับเคสต้องระบุเหตุผล`,
    suggestedNote: chosenManually && input.suggested !== null ? `ระบบเสนอ: ${input.suggested.name}` : null,
  }
}

/** หัวข้อรายการทีมอื่น — นับหลังตัดทีมที่เลือก · ไม่เหลือทีมในพื้นที่ ⇒ `null` (ไม่แสดงหัวข้อ "ทีมอื่นที่ดูแลจังหวัดนี้") */
export function otherMatchedHeading(remainingMatched: number): string | null {
  return remainingMatched > 0 ? `ทีมอื่นที่ดูแลจังหวัดนี้ (${remainingMatched})` : null
}
