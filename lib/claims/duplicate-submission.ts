import { ModuleError } from '@/lib/api/errors'

/**
 * กันส่งใบเบิกเดียวกันซ้ำ (เบิกมือ / ค่าที่พัก) — preship audit PS-003
 *
 * ใบเบิกที่ไม่ผูกเคสไม่มี unique key ใดกันซ้ำได้ ⇒ เน็ตหลุดหลัง commit แล้วผู้ใช้กด "ลองใหม่"
 * หรือเปิดฟอร์มใหม่ส่งอีกรอบ ได้ใบเบิกซ้ำเข้าคิวอนุมัติ (เสี่ยงจ่ายซ้ำ)
 * นิยาม "ส่งซ้ำ" = ค่าทุกช่องของฟอร์มตรงกัน (ผู้รับเงิน + ประเภท + ยอด + วันที่ของรายจ่าย + ใบเสร็จ SHA-256 — ไม่มีใบเสร็จ
 * ทั้งคู่ก็นับว่าตรง + หมายเหตุ + จำนวนคืน/ผู้พักร่วม/ใบเสร็จในนามบริษัทของค่าที่พัก) กับใบที่ยังไม่ถูกตีกลับ/แทนที่
 * ซึ่งสร้างไว้ภายใน {@link DUPLICATE_CLAIM_WINDOW_MS} — retry ส่ง payload เดิมทุกช่อง ส่วนใบที่ต่างแม้ช่องเดียวคือคนละใบ
 * — จำกัดช่วงเวลาไว้เพราะเจตนาคือกันการส่งซ้ำ ไม่ได้ห้ามเบิกรายการหน้าตาเหมือนกันในวันอื่น/ภายหลัง
 * code `CLAIM_DUPLICATE_SUBMISSION` อยู่ที่ `docs/24` §6.4
 *
 * preship R3-004 — ใบเสร็จไฟล์เดียวกัน (SHA-256 ตรงกัน) ใช้ได้กับใบเบิก**ใบเดียว**เท่านั้น ไม่จำกัดเวลา และไม่จำกัด
 * ผู้รับเงิน (ใบเสร็จคือเอกสารจริงชิ้นเดียว — คนอื่นเอาไปเบิกซ้ำก็คือเบิกซ้ำ · พักร่วมก็เบิกต่อห้องโดยคนเดียว) ⇒
 * {@link findReceiptReuse} ใช้ทั้งตอนเบิกใหม่และตอนส่งใหม่หลังตีกลับ (code เดียวกัน คนละข้อความ)
 */

export const DUPLICATE_CLAIM_WINDOW_MS = 10 * 60 * 1000

/** สถานะที่ถือว่าใบเบิกเดิม "ไม่นับแล้ว" — ส่งใหม่หลังตีกลับ/ถูกแทนที่ได้ตามปกติ */
export const DUPLICATE_CLAIM_IGNORED_STATUSES = ['rejected', 'superseded'] as const

export interface ClaimSubmissionKey {
  payeeId: string
  expenseType: string
  grossSatang: number
  /** วันที่ของรายจ่าย (เทียบระดับเวลาเต็ม — ค่าจากฟอร์มเดียวกันเท่ากันพอดี) */
  expenseDate: Date
  receiptFileHash: string | null
  /** หมายเหตุจากฟอร์ม (`revision_note`) */
  revisionNote: string | null
  /**
   * ช่องเฉพาะค่าที่พัก — เทียบเฉพาะ `expenseType = 'hotel'` (ใบเบิกชนิดอื่นใน DB มีค่า default เช่น
   * `hotel_nights = 1` ซึ่งไม่ได้มาจากฟอร์ม) · เบิกมือส่ง `null`/`null`/`false`
   */
  hotelNights: number | null
  sharedWithUserId: string | null
  receiptInCompanyName: boolean
}

export interface ExistingClaim extends ClaimSubmissionKey {
  status: string
  createdAt: Date
}

export function isDuplicateClaimSubmission(
  candidate: ClaimSubmissionKey,
  existing: ExistingClaim,
  now: Date,
): boolean {
  if ((DUPLICATE_CLAIM_IGNORED_STATUSES as readonly string[]).includes(existing.status)) return false
  if (now.getTime() - existing.createdAt.getTime() > DUPLICATE_CLAIM_WINDOW_MS) return false
  return (
    existing.payeeId === candidate.payeeId &&
    existing.expenseType === candidate.expenseType &&
    existing.grossSatang === candidate.grossSatang &&
    existing.expenseDate.getTime() === candidate.expenseDate.getTime() &&
    existing.receiptFileHash === candidate.receiptFileHash &&
    existing.revisionNote === candidate.revisionNote &&
    (candidate.expenseType !== 'hotel' ||
      (existing.hotelNights === candidate.hotelNights &&
        existing.sharedWithUserId === candidate.sharedWithUserId &&
        existing.receiptInCompanyName === candidate.receiptInCompanyName))
  )
}

export interface ReceiptHolder {
  id: string
  status: string
  receiptFileHash: string | null
}

/**
 * หาใบเบิกอื่นที่ใช้ใบเสร็จไฟล์เดียวกันอยู่ (ยังไม่ถูกตีกลับ/แทนที่) — ไม่มีใบเสร็จ (`null`) ไม่นับ
 * (ใบรับรองแทนใบเสร็จแยกกันอยู่แล้ว) · `selfId` = ใบที่กำลังส่งใหม่ (ไม่นับตัวเอง)
 */
export function findReceiptReuse<T extends ReceiptHolder>(
  receiptFileHash: string | null,
  existing: readonly T[],
  selfId: string | null = null,
): T | undefined {
  if (receiptFileHash === null || receiptFileHash === '') return undefined
  return existing.find(
    (row) =>
      row.id !== selfId &&
      row.receiptFileHash === receiptFileHash &&
      !(DUPLICATE_CLAIM_IGNORED_STATUSES as readonly string[]).includes(row.status),
  )
}

/** ผู้ถือใบเสร็จเดิม — ใบเบิก (`expenses`) หรือการเคลียร์เงินทดรอง (audit การเคลียร์ · preship R5-001) */
export type ReceiptHolderKind = 'expense' | 'advance'

/**
 * ข้อความตามผู้ถือใบเสร็จเดิม — ใบของคนอื่นไม่บอกว่าเป็นรายการชนิดใด (ไม่ leak) · `onBehalf` = การเงินบันทึกแทน
 * ผู้รับเงิน ⇒ "ของผู้รับเงินรายนี้" ไม่ใช่ "ของคุณ" (preship R8-012) · pure
 */
export function receiptReusedMessage(samePayee: boolean, holder: ReceiptHolderKind, onBehalf = false): string {
  if (!samePayee) return 'ใบเสร็จไฟล์นี้ถูกใช้ในรายการอื่นแล้ว — ใบเสร็จหนึ่งใบใช้ได้ครั้งเดียว กรุณาแนบใบเสร็จของรายการนี้'
  const owner = onBehalf ? 'ของผู้รับเงินรายนี้' : 'ของคุณ'
  // preship R6-009/R7-008 — เดิมบอกว่า "ใบเบิกอื่น" ทั้งที่ใช้เคลียร์เงินทดรองไป ผู้ใช้หาในรายการเบิกไม่เจอ
  return holder === 'advance'
    ? `ใบเสร็จไฟล์นี้ใช้เคลียร์เงินทดรอง${owner}ไปแล้ว — ใบเสร็จหนึ่งใบใช้ได้ครั้งเดียว ตรวจในรายการเงินทดรองก่อน หรือแนบใบเสร็จของรายการนี้`
    : `ใบเสร็จไฟล์นี้ถูกใช้ในใบเบิกอื่น${owner}แล้ว — ใบเสร็จหนึ่งใบเบิกได้ครั้งเดียว ตรวจในรายการเบิกก่อน หรือแนบใบเสร็จของรายการนี้`
}

export class ClaimReceiptReusedError extends ModuleError<'CLAIM_DUPLICATE_SUBMISSION'> {
  constructor(existingId: string, samePayee: boolean, holder: ReceiptHolderKind = 'expense', onBehalf = false) {
    super(
      'CLAIM_DUPLICATE_SUBMISSION',
      { title: 'ใบเสร็จนี้ใช้ไปแล้ว', message: receiptReusedMessage(samePayee, holder, onBehalf) },
      409,
      // ใบของคนอื่นไม่ส่ง id ออกไปให้ FE (ไม่ leak) — เก็บไว้ใน detail สำหรับ log เท่านั้น
      {
        detail: `receipt hash already used by ${holder} ${existingId}`,
        context: !samePayee
          ? { reason: 'receipt_reused' }
          : holder === 'advance'
            ? { reason: 'receipt_reused', existingAdvanceId: existingId }
            : { reason: 'receipt_reused', existingExpenseId: existingId },
      },
    )
    this.name = 'ClaimReceiptReusedError'
  }
}

export class ClaimDuplicateError extends ModuleError<'CLAIM_DUPLICATE_SUBMISSION'> {
  constructor(existingId: string) {
    super(
      'CLAIM_DUPLICATE_SUBMISSION',
      {
        title: 'ส่งใบเบิกนี้ไปแล้ว',
        message:
          'มีใบเบิกรายการเดียวกัน (ยอด วันที่ และใบเสร็จตรงกัน) เพิ่งส่งเข้าคิวอนุมัติเมื่อสักครู่ — ตรวจในรายการเบิกก่อน ถ้าตั้งใจเบิกซ้ำจริงให้ส่งใหม่หลัง 10 นาที',
      },
      409,
      { detail: `duplicate of expense ${existingId}`, context: { existingExpenseId: existingId } },
    )
    this.name = 'ClaimDuplicateError'
  }
}
