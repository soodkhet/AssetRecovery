import type { SessionUser } from '@/lib/auth/types'
import { advanceReturnOutstandingSatang, payeeRecoveryOutstandingSatang } from '@/lib/finance/advance-offset-calc'
import type { PayeeType } from '@/lib/generated/prisma/enums'
import { maskAccountNumber, maskNationalId, payeeLegalName, WHT_CONDITION_LABEL } from '@/lib/payees/payee'
import { prisma } from '@/lib/prisma'

/**
 * `GET /api/field/me/payee` (staging E-035 · มติ PO 10/10/2569) — ข้อมูลรับเงินของ**ผู้เรียกเอง**อ่านอย่างเดียว
 * scope = `payee_profiles.user_id = ผู้เรียก` เสมอ (ไม่มีพารามิเตอร์ id ให้ขอของคนอื่น) · เลขบัญชี/เลขผู้เสียภาษีปิดบัง
 * แก้ไขไม่ได้จากหน้านี้ — ต้องแจ้งการเงิน (ข้อมูลธนาคาร/ภาษีต้องผ่านการยืนยันของการเงิน — `18` §9)
 */
export interface OwnPayeeSummaryDto {
  exists: boolean
  payeeType: PayeeType | null
  /** ชื่อที่ใช้บนเอกสารภาษี/ไฟล์โอน (นิติบุคคล = ชื่อตามหนังสือรับรอง) */
  displayName: string
  bankName: string | null
  accountName: string | null
  accountNumberMasked: string | null
  nationalIdMasked: string | null
  isVerified: boolean
  whtConditionLabel: string | null
  /** ยอดคืนเงินทดรองค้าง (หักในรอบจ่ายถัดไป) */
  advanceReturnOutstandingSatang: number
  /** ยอดเรียกคืนค่าตอบแทนที่จ่ายเกิน (staging E-014) */
  recoveryOutstandingSatang: number
}

export async function getOwnPayeeSummary(user: SessionUser): Promise<OwnPayeeSummaryDto> {
  const row = await prisma.payeeProfile.findFirst({
    where: { organizationId: user.organizationId, userId: user.id, deletedAt: null },
    select: {
      payeeType: true,
      legalName: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      nationalId: true,
      isVerified: true,
      whtCondition: true,
      advances: {
        where: { status: 'cleared', returnMethod: { not: null }, deletedAt: null },
        select: { returnSatang: true, returns: { where: { reversedAt: null }, select: { amountSatang: true } } },
      },
      recoveries: {
        where: { deletedAt: null },
        select: { amountSatang: true, collections: { where: { reversedAt: null }, select: { amountSatang: true } } },
      },
    },
  })
  if (row === null) {
    return {
      exists: false,
      payeeType: null,
      displayName: user.fullName,
      bankName: null,
      accountName: null,
      accountNumberMasked: null,
      nationalIdMasked: null,
      isVerified: false,
      whtConditionLabel: null,
      advanceReturnOutstandingSatang: 0,
      recoveryOutstandingSatang: 0,
    }
  }
  return {
    exists: true,
    payeeType: row.payeeType,
    displayName: payeeLegalName({ payeeType: row.payeeType, legalName: row.legalName, userFullName: user.fullName }),
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    nationalIdMasked: maskNationalId(row.nationalId),
    isVerified: row.isVerified,
    whtConditionLabel: WHT_CONDITION_LABEL[row.whtCondition],
    advanceReturnOutstandingSatang: row.advances.reduce(
      (total, advance) =>
        total +
        advanceReturnOutstandingSatang({
          returnSatang: advance.returnSatang,
          collectedSatang: advance.returns.map((entry) => entry.amountSatang),
        }),
      0,
    ),
    recoveryOutstandingSatang: row.recoveries.reduce(
      (total, recovery) =>
        total +
        payeeRecoveryOutstandingSatang({
          amountSatang: recovery.amountSatang,
          collectedSatang: recovery.collections.map((entry) => entry.amountSatang),
        }),
      0,
    ),
  }
}
