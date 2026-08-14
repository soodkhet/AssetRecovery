/**
 * ศูนย์ต้นทุน (`13` §6.6) — **pure ล้วน**
 *
 * `code` เป็น **running number อัตโนมัติ** (`CC-001`) ผู้ใช้กรอกเองไม่ได้ — ป้องกันรหัสชนกัน
 * และให้เรียงลำดับได้ตรงกับที่บัญชีคุ้นเคย · UNIQUE(organization_id, code) เป็นด่านสุดท้ายที่ DB
 *
 * ⚠️ `mapping_rule` ที่ `13` §6.6 เขียนไว้ **ไม่มีในตาราง `cost_centers` ของ `02` §5** —
 * ยึด `02` ตามลำดับความสำคัญเอกสาร (`02` → spec module) การ map อัตโนมัติจากทีมจึงอยู่ที่
 * ฝั่งรายการค่าใช้จ่าย (`32` — `COST_CENTER_AUTO_EDIT`) ไม่ใช่คุณสมบัติของตัวศูนย์ต้นทุนเอง
 */

export const COST_CENTER_CODE_PREFIX = 'CC'
export const COST_CENTER_CODE_DIGITS = 3

const CODE_PATTERN = /^CC-(\d+)$/

/** เลขลำดับจากรหัส — `null` = รหัสไม่ตรงรูปแบบ (ข้อมูลนำเข้าเก่า) จึงไม่นับรวมตอนหาเลขถัดไป */
export function costCenterCodeSequence(code: string): number | null {
  const match = CODE_PATTERN.exec(code.trim().toUpperCase())
  if (!match?.[1]) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isSafeInteger(value) ? value : null
}

export function formatCostCenterCode(sequence: number): string {
  return `${COST_CENTER_CODE_PREFIX}-${String(sequence).padStart(COST_CENTER_CODE_DIGITS, '0')}`
}

/**
 * รหัสถัดไปจากรหัสที่มีอยู่ทั้งหมด — นับต่อจาก**เลขสูงสุดที่เคยใช้** ไม่ใช่จำนวนแถว
 * (ลบแล้วสร้างใหม่ต้องไม่ได้รหัสซ้ำกับของเดิมที่ถูก soft delete ไว้)
 */
export function nextCostCenterCode(existingCodes: readonly string[]): string {
  const max = existingCodes.reduce((highest, code) => {
    const sequence = costCenterCodeSequence(code)
    return sequence !== null && sequence > highest ? sequence : highest
  }, 0)
  return formatCostCenterCode(max + 1)
}
