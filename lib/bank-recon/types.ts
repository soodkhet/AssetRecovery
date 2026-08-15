import type { MatchTargetKind } from '@/lib/bank-recon/matching'
import type { BankMatchStatus } from '@/lib/generated/prisma/enums'

/**
 * DTO ของกระทบยอดธนาคาร (ไฟล์ 35 §7–§8) — ใช้ร่วม FE/BE
 * instant/วันเป็น ISO UTC (หน้าจอแปลง Asia/Bangkok + พ.ศ. เอง — Rule 01)
 * เงินเป็น satang จำนวนเต็มเสมอ (หน้าจอหาร 100 ตอนแสดงผลเท่านั้น)
 */

export interface BankTransactionDto {
  id: string
  periodId: string
  periodLabel: string
  bankAccountId: string
  bankAccountLabel: string
  /** วันที่ในสมุดบัญชี (date-only, เที่ยงคืน UTC) */
  transactionDate: string
  description: string
  /** บวก = เงินเข้า · ลบ = เงินออก (`02` §9 — คอลัมน์เดียว) */
  amountSatang: number
  matchStatus: BankMatchStatus
  matchStatusLabel: string
  matchNote: string | null
  /** ชนิดของเอกสารที่จับคู่ไว้ — `null` = ยังไม่จับคู่/ปิดรายการแล้ว */
  matchedKind: MatchTargetKind | null
  matchedId: string | null
  /** เลขที่/ชื่อของเอกสารที่จับคู่ (แสดงในคอลัมน์ "จับคู่กับ") */
  matchedRef: string | null
  matchedByName: string | null
  matchedAt: string | null
  createdAt: string
}

export interface BankTransactionListDto {
  items: BankTransactionDto[]
  summary: {
    total: number
    unmatched: number
    autoMatched: number
    manualMatched: number
    unmatchedResolved: number
    /** ยอดรวมเงินเข้า/ออกตามตัวกรองปัจจุบัน (satang) */
    totalInSatang: number
    totalOutSatang: number
  }
}

/** ผลนำเข้า statement 1 ครั้ง (`35` §9) */
export interface StatementImportResultDto {
  bankAccountId: string
  fileName: string
  /** จำนวนแถวที่อ่านได้จากไฟล์ */
  parsedRows: number
  /** แถวที่บันทึกใหม่จริง */
  imported: number
  /** แถวที่มีอยู่แล้ว (นำเข้าซ้ำ) — ข้ามไป ไม่นับเงินซ้ำ */
  duplicates: number
  /** แถวที่อ่านไม่ออก เช่นบรรทัดยอดยกมา */
  skippedRows: { lineNumber: number; message: string }[]
  /** จับคู่อัตโนมัติได้กี่รายการจากที่นำเข้ารอบนี้ (`35` §6.2) */
  autoMatched: number
  /** ใช้ `column_mapping` ที่ตั้งไว้หรือเดาจากหัวตาราง */
  usedConfiguredMapping: boolean
  periods: { periodId: string; periodLabel: string }[]
}

/** ตัวเลือกใน dropdown ของ Modal "จับคู่ Manual" (`35` §8) */
export interface MatchCandidateDto {
  kind: MatchTargetKind
  id: string
  ref: string
  label: string
  amountSatang: number
  /** A1 — ยอดหลังลูกค้าหัก WHT (`total − wht`) ถ้ามี */
  altAmountSatang: number | null
  referenceDate: string | null
  /** ยอดตรงกับรายการเดินบัญชีที่กำลังจับคู่ไหม — FE ใช้เตือนว่าต้องกรอกหมายเหตุ */
  exactAmount: boolean
}

export interface MatchResultDto {
  transaction: BankTransactionDto
  /** ผลข้างเคียงที่เกิดจริงจากการจับคู่ (`35` §9) — โชว์ใน toast ให้คนตรวจได้ */
  effect:
    | { kind: 'billing'; cashReceiptId: string; billingStatus: string; outstandingSatang: number }
    | { kind: 'payout'; payoutStatus: string }
    | null
}
