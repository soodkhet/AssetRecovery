import type { PayeeIncomeCategoryOverride } from '@/lib/payees/payee'
import type { AddressDtoLike } from '@/lib/address/address-value'
import type { PayeeType, PayoutBatchSide, WhtCondition } from '@/lib/generated/prisma/enums'

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
  /**
   * ฝั่งของผู้รับสำหรับกติกาภาษี (ทีม → กลุ่ม role — `resolvePayoutSide()` ตัวเดียวกับรอบจ่าย)
   * · `null` = ไม่มีฝั่ง (เช่น role ระบบ) ⇒ ไม่มีค่าเริ่มต้นตามประเภทให้ใช้ (มติ PO U164)
   */
  payoutSide: PayoutBatchSide | null
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
  /** path เอกสารยืนยันตัวตนใน bucket (มติ PO U150 — อัปโหลดผ่าน server) · เปิดดูผ่าน signed URL */
  idDocumentUrl: string | null
  /** ผ่านการตรวจของ server แล้ว (มี SHA-256) · `false` + มี path = URL เก่าที่พิมพ์เอง (ไม่ผ่านการตรวจ) */
  idDocumentVerified: boolean
  /** อัตราหัก 40(2) ต่อคน (%) — ใช้เมื่อค่าตั้งภาษีจัดผู้รับเป็นเงินได้ 40(2) · `null` = ยังไม่กรอก */
  wht402Pct: number | null
  /** คำนำหน้าชื่อ (บุคคลธรรมดา) — มติ PO U94 ข้อ 1 */
  nameTitle: string | null
  /** ที่อยู่ผู้ถูกหักภาษี 5 ช่อง (ค่าที่ยังไม่กรอก = `null`) */
  address: AddressDtoLike
  /** ที่อยู่ประกอบเป็นบรรทัดเดียวแล้ว — `null` = ยังไม่กรอก */
  addressLine: string | null
  /** `00000` = สำนักงานใหญ่ (มีความหมายเฉพาะนิติบุคคล) */
  branchCode: string
  /** เงื่อนไขการหัก (1)/(2)/(3) — พิมพ์บนใบ 50 ทวิ */
  whtCondition: WhtCondition
  /** ชื่อนิติบุคคลตามหนังสือรับรอง (staging E-002) — บุคคลธรรมดา = `null` */
  legalName: string | null
  /** ประเภทเงินได้รายคน (staging E-021) — `null` = ตามค่าตั้งองค์กร */
  incomeCategoryOverride: PayeeIncomeCategoryOverride | null
  isVerified: boolean
  verifiedAt: string | null
  verifiedByName: string | null
  /** ผลเทียบชื่อบัญชีกับชื่อผู้รับเงิน — `false` = ควรเตือน `BANK_ACCOUNT_NAME_MISMATCH` (`18` §11) */
  bankAccountNameMatches: boolean
  /** ฟิลด์ที่ยังขาดก่อนกดยืนยันได้ (`18` §9) — ว่าง = พร้อมยืนยัน */
  missingForVerification: readonly string[]
  /** ยอดคืนเงินทดรองค้างของผู้รับ (มติ PO U30 — เคลียร์แล้วแต่ยังไม่หัก/รับคืน · `22` §6.14) */
  advanceReturnOutstandingSatang: number
  /** staging E-014 — ยอดเรียกคืน (ค่าตอบแทนที่จ่ายเกิน) ที่ยังหักไม่หมด — หักในรอบจ่ายถัดไป · ไม่ระบุ = 0 */
  recoveryOutstandingSatang?: number
  updatedAt: string
}

/** ตัวเลือกผู้รับเงินของช่อง "บันทึกแทน" (มติ PO U153) — ข้อมูลน้อยที่สุด (ไม่มีบัญชี/ภาษี) */
export interface PayeeOptionDto {
  id: string
  userId: string
  name: string
  teamName: string | null
}

/** ผู้ใช้ที่ยังไม่มี Payee Profile — ตัวเลือกของฟอร์ม "เพิ่มผู้รับเงิน" (`GET /api/payees/candidates`) */
export interface PayeeCandidateDto {
  id: string
  fullName: string
  teamName: string | null
  roleName: string
  /** ฝั่งสำหรับกติกาภาษี (มติ PO U164) — `null` = ไม่มีฝั่ง */
  payoutSide: PayoutBatchSide | null
}
