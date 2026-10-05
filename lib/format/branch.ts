import { z } from 'zod'

/**
 * สำนักงานใหญ่ / สาขา ตามแบบกรมสรรพากร (ประมวลรัษฎากร ม.86/4) — util กลางใช้ทั้งฝั่งผู้ซื้อ
 * (บริษัทไฟแนนซ์ — มติ PO U77) และฝั่งผู้ขาย (องค์กรเรา — มติ PO U82) · pure ห้ามแตะ DB
 *
 * รหัสสาขา 5 หลัก: `00000` = สำนักงานใหญ่ · `00001`… = สาขาที่ (DB มี CHECK `^[0-9]{5}$` ทุกคอลัมน์)
 */

export const HEAD_OFFICE_BRANCH_CODE = '00000'
export const BRANCH_CODE_PATTERN = /^\d{5}$/

export function isHeadOfficeBranch(code: string): boolean {
  return code === HEAD_OFFICE_BRANCH_CODE
}

/**
 * ข้อความบนใบกำกับภาษี/หน้าจอ — "สำนักงานใหญ่" หรือ "สาขาที่ 00001" (display เท่านั้น)
 * รหัสผิดรูปแบบ (ไม่ควรเกิด — มี CHECK ที่ DB) แสดงตามจริงแทนการเดา
 */
export function formatBranch(code: string): string {
  if (isHeadOfficeBranch(code)) return 'สำนักงานใหญ่'
  return `สาขาที่ ${code}`
}

/** ตัวเลือกบนฟอร์ม — "สำนักงานใหญ่" หรือ "สาขาที่ …" (กรอกเลข 5 หลัก) */
export type BranchKind = 'head_office' | 'branch'

export function branchKindOf(code: string): BranchKind {
  return isHeadOfficeBranch(code) ? 'head_office' : 'branch'
}

/**
 * ค่าฟอร์ม → รหัสสาขาที่ส่งให้ API — สำนักงานใหญ่ = `00000` · สาขา = ตัวเลขที่กรอก (ตัดช่องว่าง)
 * ไม่เติม 0 นำหน้าให้เอง — ผู้ใช้ต้องกรอกครบ 5 หลักตามใบทะเบียน (Zod ตรวจรูปแบบอีกชั้น)
 */
export function branchCodeFromForm(kind: BranchKind, branchNumber: string): string {
  return kind === 'head_office' ? HEAD_OFFICE_BRANCH_CODE : branchNumber.replace(/\s/g, '')
}

/**
 * Zod — ตัวเลข 5 หลัก · `00000` = สำนักงานใหญ่ · ไม่ส่งมาเลย = สำนักงานใหญ่ (ไม่เปลี่ยนพฤติกรรมของผู้เรียกเดิม)
 */
export const branchCodeSchema = z
  .string()
  .trim()
  .refine((value) => BRANCH_CODE_PATTERN.test(value), 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)')
  .default(HEAD_OFFICE_BRANCH_CODE)
