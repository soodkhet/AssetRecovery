import { startOfBangkokDay } from '@/lib/format/datetime'
import type { HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { isLotConfirmed } from '@/lib/warehouse/lot-status'
import type { LotCompanyGroupDto, LotCompanySummaryDto } from '@/lib/warehouse/types'

/**
 * แท็บ "ส่งมอบแล้ว" แบบตารางจัดกลุ่มตามบริษัท (มติ PO U142 · `44` §8.5) — **pure ล้วน**
 *
 * - ช่วงวันส่งมอบ: รับวันตามปฏิทิน**ไทย** `YYYY-MM-DD` (ค.ศ. — ค่าของ `<input type="date">`)
 *   แล้วแปลงเป็นขอบ instant UTC แบบ `[gte, lt)` — เที่ยงคืนไทย = 17:00Z ของวันก่อนหน้า
 * - ยอดหัวกลุ่มประกอบจากผล `groupBy` ของ DB (ไม่ใช่นับจากหน้าที่โหลด) — ฟังก์ชันนี้แค่รวมแถวเข้ากลุ่ม
 */

const DAY_MS = 86_400_000

export interface InstantRange {
  gte?: Date
  lt?: Date
}

/** `YYYY-MM-DD` → เที่ยงคืน UTC ของวันนั้น (date-only) */
function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/**
 * ช่วงวันตามปฏิทินไทย (รวมทั้งสองขอบ) → ขอบ instant `[gte, lt)` สำหรับเทียบคอลัมน์ `TIMESTAMPTZ`
 * ไม่ระบุทั้งสองขอบ = `null` (ไม่กรอง)
 */
export function bangkokDayRange(from: string | undefined, to: string | undefined): InstantRange | null {
  if (from === undefined && to === undefined) return null
  return {
    ...(from === undefined ? {} : { gte: startOfBangkokDay(dateOnly(from)) }),
    ...(to === undefined ? {} : { lt: startOfBangkokDay(new Date(dateOnly(to).getTime() + DAY_MS)) }),
  }
}

/** แถวจาก `handoverLot.groupBy({ by: ['companyId', 'status'] })` */
export interface LotCountRow {
  companyId: string
  status: HandoverLotStatus
  lots: number
}

/** แถวจาก `asset.groupBy({ by: ['companyId'] })` — เฉพาะเครื่องที่ผู้ใช้มองเห็น */
export interface AssetCountRow {
  companyId: string
  assets: number
}

/**
 * รวมผล `groupBy` เป็นแถวหัวกลุ่มต่อบริษัท — เรียงตามชื่อบริษัท (ภาษาไทย) ให้ลำดับคงที่
 * บริษัทที่ไม่มีล็อตในเงื่อนไขไม่ถูกสร้างกลุ่ม · ชื่อหาไม่เจอ = แสดง "—" (ไม่ทิ้งยอด)
 */
export function buildLotCompanyGroups(
  lotRows: readonly LotCountRow[],
  assetRows: readonly AssetCountRow[],
  companyNames: ReadonlyMap<string, string>,
): LotCompanySummaryDto {
  const groups = new Map<string, LotCompanyGroupDto>()

  for (const row of lotRows) {
    const current = groups.get(row.companyId) ?? {
      companyId: row.companyId,
      companyName: companyNames.get(row.companyId) ?? '—',
      lotCount: 0,
      assetCount: 0,
      pendingLotCount: 0,
    }
    current.lotCount += row.lots
    if (!isLotConfirmed(row.status)) current.pendingLotCount += row.lots
    groups.set(row.companyId, current)
  }

  for (const row of assetRows) {
    const current = groups.get(row.companyId)
    // เครื่องที่ไม่มีล็อตอยู่ในกลุ่ม = ไม่ควรเกิด (query กรองด้วยเงื่อนไขล็อตชุดเดียวกัน) — ข้ามไว้ไม่สร้างกลุ่มผี
    if (current !== undefined) current.assetCount += row.assets
  }

  const sorted = [...groups.values()].sort((left, right) => left.companyName.localeCompare(right.companyName, 'th'))
  return {
    groups: sorted,
    totalLots: sorted.reduce((sum, group) => sum + group.lotCount, 0),
    totalAssets: sorted.reduce((sum, group) => sum + group.assetCount, 0),
    totalPendingLots: sorted.reduce((sum, group) => sum + group.pendingLotCount, 0),
  }
}
