import { describe, expect, it } from 'vitest'
import {
  assertBatchItemsEditable,
  assertHasItemsToPay,
  assertPayeesVerified,
  assertSingleSide,
  buildIdempotencyKey,
  buildPayoutBatchName,
  duplicatePaymentFileWarning,
  nextPaymentFileVersion,
  nextPayoutBatchStatus,
  paymentFileName,
  paymentFileStoragePath,
  resolvePayoutSide,
} from '@/lib/payout/payout'

/** `17` §6.1/§6.3/§9/§10/§11 · `23` §6.6 — ยามทั้งหมดก่อนเงินออกจริง */

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code ?? 'NO_CODE'
  }
  return 'NO_THROW'
}

describe('state machine (`23` §6.6)', () => {
  it('draft → checking เมื่อดึงรายการครบ (ระบบเปลี่ยนเอง — `17` §9 v2.1)', () => {
    expect(nextPayoutBatchStatus('draft', 'collect')).toBe('checking')
  })

  it('checking → file_generated ตอนสร้างไฟล์โอน', () => {
    expect(nextPayoutBatchStatus('checking', 'generate_file')).toBe('file_generated')
  })

  it('สร้างไฟล์ซ้ำจาก file_generated ได้ (เตือน ไม่บล็อก — `17` §11)', () => {
    expect(nextPayoutBatchStatus('file_generated', 'generate_file')).toBe('file_generated')
  })

  it('file_generated → completed', () => {
    expect(nextPayoutBatchStatus('file_generated', 'complete')).toBe('completed')
  })

  it.each([
    ['draft', 'generate_file'],
    ['checking', 'complete'],
    ['completed', 'generate_file'],
    ['completed', 'complete'],
    ['checking', 'collect'],
  ] as const)('%s --%s--> ผิดขั้น = PAYOUT_BATCH_INVALID_STATUS', (status, action) => {
    expect(codeOf(() => nextPayoutBatchStatus(status, action))).toBe('PAYOUT_BATCH_INVALID_STATUS')
  })

  it('แก้รายการได้เฉพาะก่อนสร้างไฟล์โอน (`17` §10)', () => {
    expect(() => assertBatchItemsEditable('draft')).not.toThrow()
    expect(() => assertBatchItemsEditable('checking')).not.toThrow()
    expect(codeOf(() => assertBatchItemsEditable('file_generated'))).toBe('PAYOUT_BATCH_INVALID_STATUS')
    expect(codeOf(() => assertBatchItemsEditable('completed'))).toBe('PAYOUT_BATCH_INVALID_STATUS')
  })
})

describe('ฝั่งของรายการ (`17` §6.1)', () => {
  it('มีทีม = ใช้ฝั่งของทีมเสมอ', () => {
    expect(resolvePayoutSide({ teamSide: 'outsource', roleGroup: 'inhouse' })).toBe('outsource')
  })

  it('ไม่มีทีม = ตกไปใช้กลุ่มของ role', () => {
    expect(resolvePayoutSide({ teamSide: null, roleGroup: 'inhouse' })).toBe('inhouse')
    expect(resolvePayoutSide({ teamSide: null, roleGroup: 'outsource' })).toBe('outsource')
  })

  it('กลุ่มที่ไม่มีฝั่ง (system/บริษัทไฟแนนซ์) = null', () => {
    expect(resolvePayoutSide({ teamSide: null, roleGroup: 'system' })).toBeNull()
    expect(resolvePayoutSide({ teamSide: null, roleGroup: 'finance_company' })).toBeNull()
  })
})

const verified = { payeeId: 'p1', payeeName: 'สมชาย ใจดี', isVerified: true, side: 'outsource' } as const
const unverified = { payeeId: 'p2', payeeName: 'สมหญิง รักงาน', isVerified: false, side: 'outsource' } as const

describe('ยามก่อนสร้างรอบ (`17` §10/§11)', () => {
  it('payee ยังไม่ยืนยันแม้รายเดียว = reject ทั้งรอบ พร้อมบอกชื่อ', () => {
    let context: Record<string, unknown> = {}
    try {
      assertPayeesVerified([verified, unverified])
    } catch (error) {
      context = (error as { context: Record<string, unknown> }).context
      expect((error as { code: string }).code).toBe('UNVERIFIED_PAYEE_IN_PAYOUT')
    }
    expect(context.payees).toEqual(['สมหญิง รักงาน'])
  })

  it('ยืนยันครบ = ผ่าน', () => {
    expect(() => assertPayeesVerified([verified])).not.toThrow()
  })

  it('รายการต่างฝั่งหลุดเข้ามา = MIXED_SIDE_BATCH', () => {
    expect(codeOf(() => assertSingleSide('outsource', [verified, { ...verified, side: 'inhouse' }]))).toBe(
      'MIXED_SIDE_BATCH',
    )
  })

  it('ฝั่งเดียวกันทั้งหมด = ผ่าน', () => {
    expect(() => assertSingleSide('outsource', [verified])).not.toThrow()
  })

  it('ไม่มีรายการให้จ่าย = NO_ITEMS_TO_PAY', () => {
    expect(codeOf(() => assertHasItemsToPay(0))).toBe('NO_ITEMS_TO_PAY')
    expect(() => assertHasItemsToPay(1)).not.toThrow()
  })
})

describe('ชื่อรอบ / idempotency key (`17` §6.3 · Rule 01 พ.ศ.)', () => {
  // 15/08/2026 ค.ศ. = 15/08/2569 พ.ศ. (Asia/Bangkok)
  const cutoff = new Date('2026-08-15T03:00:00Z')

  it('ชื่อรอบมีฝั่ง + วันตัดรอบเป็น พ.ศ.', () => {
    expect(buildPayoutBatchName('outsource', cutoff)).toBe('รอบจ่าย Outsource ตัดรอบ 15/08/2569')
  })

  it('key ขึ้นต้นด้วยฝั่ง + วันที่ พ.ศ. + สุ่มท้าย (ตัดอักขระพิเศษออก)', () => {
    expect(buildIdempotencyKey({ side: 'outsource', generatedAt: cutoff, uniqueSuffix: 'ab12cd34-ef56' })).toBe(
      'PB-OUT-25690815-AB12CD34EF56',
    )
    expect(buildIdempotencyKey({ side: 'inhouse', generatedAt: cutoff, uniqueSuffix: 'zz' })).toBe(
      'PB-IN-25690815-ZZ',
    )
  })

  it('คำเตือนสร้างไฟล์ซ้ำต้องมีวันที่ครั้งก่อน (`17` §6.3 — เตือน ไม่ block)', () => {
    const warning = duplicatePaymentFileWarning(new Date('2026-08-14T09:30:00Z'))
    expect(warning.code).toBe('DUPLICATE_PAYMENT_FILE')
    expect(warning.message).toContain('14/08/2569 16:30')
  })
})

describe('ชื่อ/เวอร์ชันไฟล์โอน (ห้าม overwrite ของเดิม)', () => {
  it('เดินเวอร์ชันจากไฟล์ล่าสุด', () => {
    expect(nextPaymentFileVersion(null)).toBe(1)
    expect(nextPaymentFileVersion('payout-batches/b1/PB-OUT-25690815-AAA-v1.csv')).toBe(2)
    expect(nextPaymentFileVersion('payout-batches/b1/PB-OUT-25690815-AAA-v7.txt')).toBe(8)
    expect(nextPaymentFileVersion('ไฟล์เก่ารูปแบบอื่น')).toBe(1)
  })

  it('ชื่อไฟล์และ path ผูกกับ key + เวอร์ชัน', () => {
    expect(paymentFileName({ idempotencyKey: 'PB-OUT-25690815-AAA', version: 2, extension: 'csv' })).toBe(
      'PB-OUT-25690815-AAA-v2.csv',
    )
    expect(
      paymentFileStoragePath({
        batchId: 'batch-1',
        idempotencyKey: 'PB-OUT-25690815-AAA',
        version: 2,
        extension: 'csv',
      }),
    ).toBe('payout-batches/batch-1/PB-OUT-25690815-AAA-v2.csv')
  })
})
