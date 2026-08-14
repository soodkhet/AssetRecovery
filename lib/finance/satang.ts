/**
 * เครื่องคิดเลขสตางค์ของสูตรใน `docs/22` — **pure ล้วน ไม่มี I/O** (Rule 01)
 *
 * กติกาการปัดเศษของทั้งระบบอยู่ที่นี่ที่เดียว: ทุกสูตรที่มี `%` (VAT / WHT / service fee rate)
 * คิดบนจำนวนเต็มสตางค์แล้ว **ปัดครึ่งขึ้น (`Math.round`) ครั้งเดียวที่ปลายสูตร** — ห้ามปัดกลางทาง
 * ไม่งั้นยอดที่ auditor คิดซ้ำจากฐาน × อัตรา จะไม่ตรงกับที่บันทึกไว้ (บทเรียนเดียวกับ `distance_km`)
 */

/** ยามกันเงินที่ไม่ใช่สตางค์จำนวนเต็มหลุดเข้าสูตร (float = บั๊กเงิน ไม่ใช่ค่าที่ยอมรับได้) */
export function assertSatang(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${label}: เงินต้องเป็นสตางค์จำนวนเต็ม (ได้ ${value})`)
}

/** ยามเพิ่มเติมสำหรับยอดที่ติดลบไม่ได้ (ยอดเบิก/ยอดรายได้/ฐานคำนวณ) */
export function assertNonNegativeSatang(value: number, label: string): void {
  assertSatang(value, label)
  if (value < 0) throw new RangeError(`${label}: เงินติดลบไม่ได้ (ได้ ${value})`)
}

/** อัตราร้อยละต้องอยู่ในช่วง 0–100 และเป็นตัวเลขจริง (`rate_pct`/`wht_pct` = NUMERIC(5,2)) */
export function assertPct(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label}: อัตราต้องอยู่ระหว่าง 0-100 (ได้ ${value})`)
  }
}

/**
 * `ฐาน (สตางค์) × pct%` → สตางค์จำนวนเต็ม — ตัวคูณเปอร์เซ็นต์ตัวเดียวของระบบ
 * ใช้กับ service fee rate (`22` §6.5/§6.7), VAT แบบ exclude (§6.8) และ WHT (§6.9)
 *
 * ⚠️ ล้างเศษ binary ของอัตราก่อนปัด: อัตราเป็น `NUMERIC(5,2)` ⇒ `ฐาน × อัตรา × 100` เป็นจำนวนเต็ม
 * เสมอในทางคณิตศาสตร์ แต่ float ให้ค่าต่ำกว่าจริงนิดเดียวได้ (เช่น `1000 × 2.05` = `2049.9999…`)
 * ทำให้ยอดที่ควรลงตัวที่ `.5` พอดีถูกปัด**ลง** ผิดไป 1 สตางค์ — ปัดชั้นแรกที่สเกล ×100 จึงตัดปัญหานี้
 */
export function pctOfSatang(baseSatang: number, pct: number): number {
  assertSatang(baseSatang, 'ฐานคำนวณ')
  assertPct(pct, 'อัตรา')
  return Math.round(Math.round(baseSatang * pct * 100) / 10_000)
}

/**
 * VAT ที่ถอดออกจากยอดที่ **รวม VAT แล้ว** (`22` §6.8 โหมด `include_vat`)
 * `vat = ยอดรวม × rate / (100 + rate)`
 */
export function vatIncludedInSatang(totalSatang: number, ratePct: number): number {
  assertSatang(totalSatang, 'ยอดรวม VAT')
  assertPct(ratePct, 'อัตรา VAT')
  if (ratePct === 0) return 0
  return Math.round((totalSatang * ratePct) / (100 + ratePct))
}

/** ผลรวมสตางค์ที่ยามค่าไม่ใช่จำนวนเต็มให้ด้วย */
export function sumSatang(values: readonly number[], label = 'ยอดรวม'): number {
  let total = 0
  for (const value of values) {
    assertSatang(value, label)
    total += value
  }
  return total
}
