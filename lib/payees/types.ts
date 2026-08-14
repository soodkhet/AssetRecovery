import type { PayeeType } from '@/lib/generated/prisma/enums'

/**
 * DTO ของผู้รับเงินที่ส่งออก API (ไฟล์ 18 §8/§14)
 *
 * ⚠️ **ไม่มีฟิลด์เงิน** — อัตรา WHT ที่แสดงในตารางเป็นค่าจาก Tax Profile ที่ผูกไว้ (`13` §6.4)
 * ส่วนยอดจ่ายจริงคำนวณตอนสร้างรอบจ่าย (`22` §6.9–6.10) ไม่ใช่ที่นี่
 */
export interface PayeeDto {
  id: string
  userId: string
  /** ชื่อ "ตามหน้าสมุดบัญชี" มาจาก `users.full_name` (`18` §7.1 — ไม่มีคอลัมน์ชื่อของตัวเอง) */
  name: string
  teamName: string | null
  roleName: string
  payeeType: PayeeType
  taxProfileId: string | null
  taxProfileName: string | null
  /** อัตรา WHT ของ Tax Profile ที่ผูกไว้ — `null` = ยังไม่ผูก ⇒ ตกไปใช้ Plan-level พร้อม warning (`18` §6.3) */
  whtPct: number | null
  nationalId: string | null
  bankName: string | null
  accountName: string | null
  /** เลขบัญชีเต็มสำหรับผู้มีสิทธิ์ `manage` · ผู้มีสิทธิ์แค่ `view` ได้ค่าที่ปิดบังแล้ว */
  accountNumber: string | null
  accountNumberMasked: string | null
  idDocumentUrl: string | null
  isVerified: boolean
  verifiedAt: string | null
  verifiedByName: string | null
  /** ผลเทียบชื่อบัญชีกับชื่อผู้รับเงิน — `false` = ควรเตือน `BANK_ACCOUNT_NAME_MISMATCH` (`18` §11) */
  bankAccountNameMatches: boolean
  /** ฟิลด์ที่ยังขาดก่อนกดยืนยันได้ (`18` §9) — ว่าง = พร้อมยืนยัน */
  missingForVerification: readonly string[]
  updatedAt: string
}
