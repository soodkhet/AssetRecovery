import { fmtDate, toBangkokParts } from '@/lib/format/datetime'

/**
 * อัตรา VAT แบบ effective-dated (`13` §6.5 · `19` §6.3) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * กติกาเหล็ก (Rule 01): **ห้าม hardcode 7%** ทุกจุดที่ต้องใช้อัตรา VAT ต้อง resolve จาก
 * `vat_rate_history` ตามวันที่ของรายการ แล้ว snapshot ค่าที่ได้ลง record (`revenues.vat_rate_used`)
 *
 * ช่วงเวลาเป็นแบบ **inclusive ทั้งสองด้าน** (`effective_from` ≤ วันที่ ≤ `effective_to`)
 * และ `effective_to = null` แปลว่า "ยังใช้อยู่จนกว่าจะปิดช่วง" — ห้ามมีช่วงทับกัน (`VAT_RATE_OVERLAP`)
 *
 * เทียบวันที่แบบ **date-only** เสมอ: คอลัมน์เป็น `DATE` ไม่ใช่ `TIMESTAMPTZ` จึงต้องตัดเวลาทิ้ง
 * ก่อนเทียบ ไม่งั้นรายการที่เกิดตอนเย็นตามเวลาไทยจะหลุดช่วงเพราะ UTC offset
 */

export interface VatRatePeriod {
  id: string
  /** % เช่น 7.00 — ส่งเป็น string ได้ (Prisma `Decimal` แปลงเป็น string ตอนออก API) */
  ratePct: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

/** จำนวนวันนับจาก epoch ตามปฏิทิน UTC — ใช้กับ **ค่าที่มาจากคอลัมน์ `DATE`** (เที่ยงคืน UTC) */
export function toDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
}

/**
 * ค่า `<input type="date">` (`YYYY-MM-DD` ค.ศ.) → เที่ยงคืน UTC แบบคอลัมน์ `DATE` — รูปเดียวกับที่ API แปลงด้วย
 * `dateOnlySchema` · ฟอร์มต้องใช้ตัวนี้ก่อนส่งเข้า pure module (เทียบด้วย `toDayNumber()`) — ถ้าใช้เที่ยงคืนเวลาไทย
 * (17:00Z ของวันก่อน) คำเตือนบนจอจะเพี้ยนไป 1 วัน (mytester7 SV7-V2-01) · ค่าว่าง/ผิดรูป/วันไม่มีจริง ⇒ `null`
 */
export function vatDateFromInput(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

/**
 * จำนวนวันของ **วันตามปฏิทินกรุงเทพ** — ใช้กับ "วันที่ของรายการ" ที่อาจเป็น instant (`TIMESTAMPTZ`)
 *
 * ⚠️ จุดพลาดที่ทำให้ VAT ผิดวัน: `revenue_date` ที่เป็น instant ตอน 20:00Z คือวันถัดไปตามเวลาไทย
 * ถ้าเทียบด้วยปฏิทิน UTC จะได้อัตราของวันก่อนหน้า — รอยต่อ 30/09 → 01/10 (7% → 10%) จึงเพี้ยน
 * ส่วนขอบของช่วง (`effective_from`/`effective_to`) เป็นคอลัมน์ `DATE` ต้องใช้ `toDayNumber()` เสมอ
 */
export function toBangkokDayNumber(date: Date): number {
  const parts = toBangkokParts(date)
  if (parts === null) throw new Error('toBangkokDayNumber: วันที่ไม่ถูกต้อง')
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000)
}

/** ช่วง `[from, to]` เป็นวัน — `to = null` → `Infinity` (เปิดปลาย) */
function rangeOf(period: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>): { from: number; to: number } {
  return {
    from: toDayNumber(period.effectiveFrom),
    to: period.effectiveTo === null ? Number.POSITIVE_INFINITY : toDayNumber(period.effectiveTo),
  }
}

/** ช่วงเวลาถูกต้องหรือไม่ (`effective_to` ต้องไม่มาก่อน `effective_from`) */
export function isPeriodRangeValid(period: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>): boolean {
  const range = rangeOf(period)
  return range.to >= range.from
}

/** ช่วงสองช่วงทับกันหรือไม่ (inclusive ทั้งสองด้าน) */
export function periodsOverlap(
  a: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>,
  b: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>,
): boolean {
  const first = rangeOf(a)
  const second = rangeOf(b)
  return first.from <= second.to && second.from <= first.to
}

/**
 * หารายการที่ช่วงทับกับช่วงใหม่ (`VAT_RATE_OVERLAP` — `13` §10)
 * `exceptId` ใช้ตอน PATCH ปิดช่วงของตัวเอง (ไม่นับตัวเองเป็นคู่ทับ)
 */
export function findOverlappingPeriods(
  candidate: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>,
  existing: readonly VatRatePeriod[],
  exceptId?: string,
): VatRatePeriod[] {
  return existing.filter((period) => period.id !== exceptId && periodsOverlap(candidate, period))
}

/**
 * อัตราที่มีผล ณ วันที่หนึ่ง — `null` = ไม่มีช่วงครอบคลุม (`VAT_RATE_NOT_FOUND`)
 * ถ้ามีหลายช่วงครอบคลุม (ไม่ควรเกิดเพราะกันทับไว้แล้ว) เลือกช่วงที่ `effective_from` ใหม่สุด
 */
export function resolveVatRateAt(date: Date, periods: readonly VatRatePeriod[]): VatRatePeriod | null {
  const day = toDayNumber(date)
  const matches = periods.filter((period) => {
    const range = rangeOf(period)
    return range.from <= day && day <= range.to
  })
  if (matches.length === 0) return null
  return matches.reduce((latest, period) =>
    toDayNumber(period.effectiveFrom) > toDayNumber(latest.effectiveFrom) ? period : latest,
  )
}

/** เรียงจากช่วงใหม่สุดไปเก่าสุด — ใช้ทั้ง timeline บน UI และผลลัพธ์ API */
export function sortPeriodsDesc<T extends Pick<VatRatePeriod, 'effectiveFrom'>>(periods: readonly T[]): T[] {
  return [...periods].sort((a, b) => toDayNumber(b.effectiveFrom) - toDayNumber(a.effectiveFrom))
}

/** ช่วงที่ยังเปิดปลาย (ยังใช้อยู่) — เพิ่มอัตราใหม่ที่เริ่มหลังช่วงนี้ ⇒ ระบบปิดช่วงนี้ให้ (`planVatRateAutoClose`) */
export function openEndedPeriod(periods: readonly VatRatePeriod[]): VatRatePeriod | null {
  return periods.find((period) => period.effectiveTo === null) ?? null
}

/**
 * ป้ายช่วงอัตราที่ผู้ใช้เห็น — "7% (01/10/2568–31/10/2569)" หรือ "7% (01/10/2568 เป็นต้นไป)" ตามวันสิ้นสุดจริง
 * (mytester7 S7-AG2-04 — เดิมแสดง "เป็นต้นไป" เสมอแม้ช่วงปิดแล้ว) · ใช้ทั้งข้อความ `VAT_RATE_OVERLAP` และหน้าจอ
 */
export function formatVatPeriodLabel(period: Pick<VatRatePeriod, 'ratePct' | 'effectiveFrom' | 'effectiveTo'>): string {
  const range =
    period.effectiveTo === null
      ? `${fmtDate(period.effectiveFrom)} เป็นต้นไป`
      : `${fmtDate(period.effectiveFrom)}–${fmtDate(period.effectiveTo)}`
  return `${period.ratePct}% (${range})`
}

// ── กติกาแก้ช่วงอัตรา (มติ D7-01 · mytester7 S7-AG2-01/02/03) ─────────────────────────

/**
 * ช่องว่าง (วันแรก/วันสุดท้ายที่ไม่มีอัตรา — date-only เที่ยงคืน UTC)
 * `to = null` = ไม่มีอัตราตั้งแต่ `from` เป็นต้นไป (ช่วงล่าสุดถูกปิด — mytester7 review)
 */
export interface VatRateGap {
  from: Date
  to: Date | null
}

function fromDayNumber(day: number): Date {
  return new Date(day * 86_400_000)
}

/**
 * ช่องว่างระหว่างช่วงแรกถึงช่วงล่าสุด — วันที่ไม่มีอัตราใดครอบคลุม ⇒ รายได้วันนั้นสร้างไม่ได้ (`VAT_RATE_NOT_FOUND`)
 * ไม่นับก่อนช่วงแรก/หลังช่วงสุดท้าย (นอกประวัติ ไม่ใช่ "ช่องว่าง")
 */
export function findVatRateGaps(
  periods: readonly Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>[],
): VatRateGap[] {
  const ranges = periods.map(rangeOf).sort((a, b) => a.from - b.from)
  const gaps: VatRateGap[] = []
  let coveredTo: number | null = null
  for (const range of ranges) {
    if (coveredTo !== null && range.from > coveredTo + 1) {
      gaps.push({ from: fromDayNumber(coveredTo + 1), to: fromDayNumber(range.from - 1) })
    }
    coveredTo = coveredTo === null ? range.to : Math.max(coveredTo, range.to)
  }
  return gaps
}

/**
 * วันที่ตั้งแต่วันนี้ (เวลาไทย) เป็นต้นไปที่ไม่มีอัตราใดครอบคลุม (mytester7 review — D7-01 เข้มกว่า):
 * วันนี้ยังไม่มีอัตรา (เช่น เลื่อนวันเริ่มช่วงแรกไปอนาคต) / ช่องว่างในอนาคต / ช่วงล่าสุดถูกปิด (`to = null`)
 * ไม่มีช่วงเลย ⇒ ทั้งหมดตั้งแต่วันนี้ว่าง
 */
export function findVatRateGapsFromToday(
  periods: readonly Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>[],
  todayDay: number,
): VatRateGap[] {
  const ranges = periods.map(rangeOf).sort((a, b) => a.from - b.from)
  const gaps: VatRateGap[] = []
  let cursor = todayDay
  for (const range of ranges) {
    if (range.to < cursor) continue
    if (range.from > cursor) gaps.push({ from: fromDayNumber(cursor), to: fromDayNumber(range.from - 1) })
    cursor = Math.max(cursor, range.to + 1)
    if (cursor === Number.POSITIVE_INFINITY) return gaps
  }
  gaps.push({ from: fromDayNumber(cursor), to: null })
  return gaps
}

/** วันที่ของรายได้ที่อ้างช่วงอัตราหนึ่ง (`revenues.revenue_date` แรกสุด/ล่าสุดที่ตกในช่วง) */
export interface VatRevenueSpan {
  first: Date
  last: Date
}

export type VatRateChangeViolation =
  /** ปิดช่วง (วันสิ้นสุด) ก่อนวันนี้ตามเวลาไทย */
  | { code: 'VAT_RATE_END_DATE_PAST'; today: Date }
  /** เปลี่ยนอัตรา หรือย่น/เลื่อนช่วงจนรายได้ที่อ้างอยู่หลุดช่วง */
  | { code: 'VAT_RATE_IN_USE'; reason: 'rate_changed' | 'range_excludes_revenue'; span: VatRevenueSpan }
  /** การบันทึกทำให้เกิดวันที่ไม่มีอัตราระหว่างช่วง */
  | { code: 'VAT_RATE_GAP'; gap: VatRateGap }

export interface VatRateChangeInput {
  /** ค่าที่จะบันทึก */
  candidate: Pick<VatRatePeriod, 'ratePct' | 'effectiveFrom' | 'effectiveTo'>
  /** ช่วงเดิมที่กำลังแก้ — `null` = เพิ่มช่วงใหม่ */
  current: VatRatePeriod | null
  /** ทุกช่วงในองค์กร (รวมช่วงที่กำลังแก้ — จะถูกแทนด้วย candidate) */
  existing: readonly VatRatePeriod[]
  /** รายได้ที่ `revenue_date` ตกในช่วงเดิม (เฉพาะตอนแก้) — `null` = ไม่มีรายได้อ้าง */
  revenueSpan: VatRevenueSpan | null
  /** เวลาปัจจุบัน (instant) — ตัดสิน "วันนี้" ตามปฏิทินกรุงเทพ */
  now: Date
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b
  return toDayNumber(a) === toDayNumber(b)
}

function gapEndDay(gap: VatRateGap): number {
  return gap.to === null ? Number.POSITIVE_INFINITY : toDayNumber(gap.to)
}

/**
 * ช่องว่างหลังบันทึกเป็นของเดิมไหม — ช่องว่างปลายเปิดเดิม (ช่วงล่าสุดถูกปิดอยู่ก่อน) นับครอบเฉพาะช่องว่างปลายเปิด
 * ⇒ เติมช่วงต่อแล้วยังเหลือวันว่าง (เช่น ปิด 30/10 แล้วเพิ่มช่วงเริ่ม 01/11) ยังถูกปฏิเสธ
 */
function gapCoveredBy(gap: VatRateGap, gaps: readonly VatRateGap[]): boolean {
  const from = toDayNumber(gap.from)
  const to = gapEndDay(gap)
  return gaps.some(
    (other) =>
      (other.to !== null || gap.to === null) && toDayNumber(other.from) <= from && to <= gapEndDay(other),
  )
}

/**
 * กติกาแก้/เพิ่มช่วงอัตรา VAT (มติ D7-01) — **pure** ใช้ทั้ง service (ตัวบังคับ) และหน้าจอ (เตือนก่อนบันทึก)
 * เรียกหลังตรวจ `VAT_RATE_OVERLAP` แล้ว (ช่วงไม่ทับกัน) ตรวจตามลำดับ:
 * 1. แก้วันสิ้นสุดเป็นก่อนวันนี้ (เวลาไทย) ⇒ `VAT_RATE_END_DATE_PAST` — ปิดช่วงได้เฉพาะวันนี้/อนาคต
 *    (ใช้กับการแก้เท่านั้น: เพิ่มช่วงในอดีตไม่ทำให้วันใดเสียอัตรา · แก้หมายเหตุของช่วงที่ปิดไปแล้วไม่โดน)
 * 2. ช่วงที่มีรายได้อ้าง: เปลี่ยนอัตรา หรือขอบช่วงใหม่ไม่ครอบวันที่ของรายได้ทุกรายการ ⇒ `VAT_RATE_IN_USE`
 * 3. ทำให้เกิดช่องว่างใหม่ระหว่างช่วง หรือทำให้วันนี้/อนาคตไม่มีอัตราครอบ (ปิดช่วงล่าสุดโดยไม่มีช่วงต่อ ·
 *    เลื่อนวันเริ่มไปหลังวันนี้) ⇒ `VAT_RATE_GAP` (ช่องว่างที่มีอยู่ก่อนแล้วไม่ถือเป็นผลของการบันทึกนี้)
 *    — ช่วงล่าสุดต้องไม่มีวันสิ้นสุดเสมอ · เปลี่ยนอัตรา = เพิ่มช่วงใหม่ ระบบปิดช่วงเดิมให้ (`planVatRateAutoClose`)
 */
export function validateVatRateChange(input: VatRateChangeInput): VatRateChangeViolation | null {
  const { candidate, current, existing, revenueSpan, now } = input

  if (current !== null) {
    const todayDay = toBangkokDayNumber(now)
    const endChanged = !sameDay(candidate.effectiveTo, current.effectiveTo)
    if (endChanged && candidate.effectiveTo !== null && toDayNumber(candidate.effectiveTo) < todayDay) {
      return { code: 'VAT_RATE_END_DATE_PAST', today: fromDayNumber(todayDay) }
    }

    if (revenueSpan !== null) {
      if (Math.round(candidate.ratePct * 100) !== Math.round(current.ratePct * 100)) {
        return { code: 'VAT_RATE_IN_USE', reason: 'rate_changed', span: revenueSpan }
      }
      const range = rangeOf(candidate)
      if (range.from > toDayNumber(revenueSpan.first) || range.to < toDayNumber(revenueSpan.last)) {
        return { code: 'VAT_RATE_IN_USE', reason: 'range_excludes_revenue', span: revenueSpan }
      }
    }
  }

  // ยังไม่มีช่วงเลย ⇒ ช่วงแรกไม่ทำให้วันใดเสียอัตรา (ทุกวันว่างอยู่แล้ว)
  if (existing.length === 0) return null
  const todayDay = toBangkokDayNumber(now)
  const gapsOf = (periods: readonly Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>[]): VatRateGap[] => [
    ...findVatRateGaps(periods),
    ...findVatRateGapsFromToday(periods, todayDay),
  ]
  const before = gapsOf(existing)
  const others = current === null ? existing : existing.filter((period) => period.id !== current.id)
  const after = gapsOf([...others, candidate])
  const introduced = after.find((gap) => !gapCoveredBy(gap, before))
  if (introduced !== undefined) return { code: 'VAT_RATE_GAP', gap: introduced }

  return null
}

/** ผลการวางแผนปิดช่วงเปิดปลายอัตโนมัติตอนเพิ่มช่วงใหม่ */
export interface VatRateAutoClose {
  /** ช่วงเปิดปลายเดิมที่จะถูกปิด */
  period: VatRatePeriod
  /** วันสิ้นสุดใหม่ = วันก่อนวันเริ่มของช่วงใหม่ */
  closedTo: Date
}

/**
 * เพิ่มช่วงใหม่ที่เริ่ม **หลัง** วันเริ่มของช่วงเปิดปลาย ⇒ ปิดช่วงนั้นถึงวันก่อนวันเริ่มใหม่ในธุรกรรมเดียวกัน
 * (มติ D7-01 "ปิดช่วงเดิม + เพิ่มช่วงใหม่" แบบ atomic — ช่วงล่าสุดต้องเปิดปลายเสมอ จึงปิดแยกก่อนไม่ได้)
 * `null` = ไม่มีช่วงเปิดปลาย หรือช่วงใหม่ไม่ได้เริ่มหลังช่วงนั้น (ตรวจทับกันตามปกติ)
 */
export function planVatRateAutoClose(
  candidate: Pick<VatRatePeriod, 'effectiveFrom'>,
  existing: readonly VatRatePeriod[],
): VatRateAutoClose | null {
  const open = openEndedPeriod(existing)
  if (open === null) return null
  const startDay = toDayNumber(candidate.effectiveFrom)
  if (startDay <= toDayNumber(open.effectiveFrom)) return null
  return { period: open, closedTo: fromDayNumber(startDay - 1) }
}

export interface VatRateCreateInput {
  candidate: Pick<VatRatePeriod, 'ratePct' | 'effectiveFrom' | 'effectiveTo'>
  existing: readonly VatRatePeriod[]
  /** แผนปิดช่วงเปิดปลาย (`planVatRateAutoClose`) */
  autoClose: VatRateAutoClose | null
  /** รายได้ที่อ้างช่วงเปิดปลายที่จะถูกปิด — `null` = ไม่มี/ไม่มีแผนปิด */
  revenueSpan: VatRevenueSpan | null
  now: Date
}

/**
 * กติกาเพิ่มช่วงใหม่ (มติ D7-01) — ถ้ามีแผนปิดช่วงเปิดปลาย ตรวจการปิดนั้นเหมือนแก้วันสิ้นสุด (ปิดย้อนหลัง/
 * รายได้หลุดช่วง) พร้อมตรวจช่องว่างของผลรวมหลังบันทึกทั้งสองแถว · ไม่มีแผน = ตรวจเหมือนเพิ่มช่วงปกติ
 */
export function validateVatRateCreate(input: VatRateCreateInput): VatRateChangeViolation | null {
  const { candidate, existing, autoClose, revenueSpan, now } = input
  if (autoClose === null) {
    return validateVatRateChange({ candidate, current: null, existing, revenueSpan: null, now })
  }
  return validateVatRateChange({
    candidate: { ...autoClose.period, effectiveTo: autoClose.closedTo },
    current: autoClose.period,
    existing: [...existing, { id: '', ...candidate }],
    revenueSpan,
    now,
  })
}

/** ข้อความไทยของการละเมิด (title/message) — ใช้ทั้ง service (ข้อความ error) และหน้าจอ (เตือนก่อนบันทึก) */
export function vatRateViolationMessage(violation: VatRateChangeViolation): { title: string; message: string } {
  switch (violation.code) {
    case 'VAT_RATE_END_DATE_PAST':
      return {
        title: 'ปิดช่วงย้อนหลังไม่ได้',
        message: `วันสิ้นสุดต้องเป็นวันนี้ (${fmtDate(violation.today)}) หรือหลังจากนี้ — ปิดช่วงย้อนหลังจะทำให้วันที่ผ่านมาไม่มีอัตรา VAT`,
      }
    case 'VAT_RATE_IN_USE': {
      const span =
        toDayNumber(violation.span.first) === toDayNumber(violation.span.last)
          ? fmtDate(violation.span.first)
          : `${fmtDate(violation.span.first)}–${fmtDate(violation.span.last)}`
      return violation.reason === 'rate_changed'
        ? {
            title: 'อัตรานี้มีรายได้ใช้อยู่แล้ว',
            message: `มีรายได้วันที่ ${span} ใช้อัตรานี้แล้ว จึงเปลี่ยนอัตราไม่ได้ — ต้องการเปลี่ยนอัตราให้เพิ่มอัตราใหม่ที่เริ่มหลังจากนี้ ระบบจะปิดช่วงเดิมให้`,
          }
        : {
            title: 'ช่วงนี้มีรายได้อ้างอยู่',
            message: `ช่วงวันที่ใหม่ต้องครอบคลุมรายได้วันที่ ${span} ที่ใช้อัตรานี้อยู่ — ย่นวันสิ้นสุดหรือเลื่อนวันเริ่มเกินวันดังกล่าวไม่ได้`,
          }
    }
    case 'VAT_RATE_GAP': {
      if (violation.gap.to === null) {
        return {
          title: 'ช่วงอัตรา VAT ล่าสุดต้องไม่มีวันสิ้นสุด',
          message: `ตั้งแต่วันที่ ${fmtDate(violation.gap.from)} เป็นต้นไปจะไม่มีอัตรา VAT (รายได้สร้างไม่ได้) — ต้องการเปลี่ยนอัตราให้เพิ่มอัตราใหม่ ระบบจะปิดช่วงเดิมให้ถึงวันก่อนวันเริ่มใหม่`,
        }
      }
      const gap =
        toDayNumber(violation.gap.from) === toDayNumber(violation.gap.to)
          ? fmtDate(violation.gap.from)
          : `${fmtDate(violation.gap.from)}–${fmtDate(violation.gap.to)}`
      return {
        title: 'ช่วงอัตรา VAT ไม่ต่อเนื่อง',
        message: `วันที่ ${gap} จะไม่มีอัตรา VAT (รายได้วันนั้นสร้างไม่ได้) — ให้ช่วงใหม่เริ่มวันถัดจากวันสิ้นสุดของช่วงเดิมพอดี`,
      }
    }
  }
}
