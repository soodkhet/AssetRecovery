import { describe, expect, it } from 'vitest'
import { evaluateReadiness } from '@/lib/accounting/period'
import {
  BANK_MATCH_STATUS_GROUP,
  BANK_MATCH_STATUS_LABEL,
  canMoveToSuspense,
  isReconciled,
  isTerminalBankStatus,
  nextBankMatchStatus,
  suspenseMatchRequiresNote,
} from '@/lib/bank-recon/matching'
import {
  canReceiveCustomerWht,
  customerWhtAgeBucket,
  customerWhtAgeDays,
  customerWhtAmountWarning,
  CUSTOMER_WHT_STATUS_GROUP,
  CUSTOMER_WHT_STATUS_LABEL,
  withheldDateRangeOf,
} from '@/lib/customer-wht/customer-wht'
import { customerWhtReceiveSchema } from '@/lib/customer-wht/schemas'
import { fmtSatangSymbol } from '@/lib/format/money'
import { parseStoragePath, uploadTargetPath, uploadTargetSchema } from '@/lib/uploads/targets'

/** pure logic ของมติ PO 05/10/2569 U40 (50 ทวิ ที่ลูกค้าหักเรา) + U41 (เงินรับรอตรวจสอบ) */

const CERT_ID = '00000000-0000-4000-8000-0000000040c1'
const TX_ID = '00000000-0000-4000-8000-0000000041c1'

describe('U40 — สถานะ 50 ทวิ ที่ลูกค้าหักเรา', () => {
  it('pending → received ทางเดียว · received เป็นสถานะสุดท้าย', () => {
    expect(canReceiveCustomerWht('pending')).toBe(true)
    expect(canReceiveCustomerWht('received')).toBe(false)
  })

  it('ป้าย/สีของสถานะ', () => {
    expect(CUSTOMER_WHT_STATUS_LABEL).toEqual({ pending: 'รอ 50 ทวิ จากลูกค้า', received: 'ได้รับแล้ว' })
    expect(CUSTOMER_WHT_STATUS_GROUP).toEqual({ pending: 'pending', received: 'success' })
  })

  it('อายุค้างนับตามปฏิทินไทย ไม่ติดลบ + ช่วงอายุ', () => {
    const withheld = new Date('2026-08-05T00:00:00Z')
    // 01/09/2569 00:30 น. ไทย = 31/08 17:30Z ⇒ 27 วัน (ไม่ใช่ 26 ตามวัน UTC)
    expect(customerWhtAgeDays(withheld, new Date('2026-08-31T17:30:00Z'))).toBe(27)
    expect(customerWhtAgeDays(withheld, new Date('2026-08-01T00:00:00Z'))).toBe(0)
    expect(customerWhtAgeBucket(30)).toBe('0_30')
    expect(customerWhtAgeBucket(31)).toBe('31_60')
    expect(customerWhtAgeBucket(90)).toBe('61_90')
    expect(customerWhtAgeBucket(91)).toBe('over_90')
  })

  it('ช่วงวันที่ของตัวกรองอายุตรงกับการจัดกลุ่ม', () => {
    const now = new Date('2026-12-01T03:00:00Z')
    const over = withheldDateRangeOf('over_90', now)
    expect(over.gte).toBeUndefined()
    expect(customerWhtAgeDays(over.lte ?? new Date(), now)).toBe(91)
    const mid = withheldDateRangeOf('31_60', now)
    expect(customerWhtAgeDays(mid.gte ?? new Date(), now)).toBe(60)
    expect(customerWhtAgeDays(mid.lte ?? new Date(), now)).toBe(31)
  })

  it('ยอดในหนังสือไม่ตรงยอดที่ถูกหัก ⇒ ข้อความเตือน (ไม่มีเลขอ้างอิงสเปค) · ตรง ⇒ null', () => {
    const formatSatang = (satang: number) => fmtSatangSymbol(satang)
    expect(customerWhtAmountWarning({ withheldSatang: 11190, certificateWhtSatang: 11190, formatSatang })).toBeNull()
    const warning = customerWhtAmountWarning({ withheldSatang: 11190, certificateWhtSatang: 11000, formatSatang })
    expect(warning).toContain('ไม่ตรง')
    expect(warning).not.toMatch(/§|ไฟล์ \d/)
  })

  it('schema รับหนังสือ: ไฟล์/เลขที่/ยอดบังคับ · ยอดเป็นสตางค์จำนวนเต็ม', () => {
    const base = {
      certificateNumber: 'สฟ-1',
      certificateDate: '2026-08-10',
      whtSatang: 11190,
      filePath: `customer-wht/${CERT_ID}/a.pdf`,
    }
    expect(customerWhtReceiveSchema.safeParse(base).success).toBe(true)
    expect(customerWhtReceiveSchema.safeParse({ ...base, filePath: '' }).success).toBe(false)
    expect(customerWhtReceiveSchema.safeParse({ ...base, certificateNumber: ' ' }).success).toBe(false)
    expect(customerWhtReceiveSchema.safeParse({ ...base, whtSatang: 111.9 }).success).toBe(false)
    expect(customerWhtReceiveSchema.safeParse({ ...base, whtSatang: 0 }).success).toBe(false)
  })
})

describe('U41 — state machine เงินรับรอตรวจสอบ', () => {
  it('unmatched → suspense (เงินเข้าเท่านั้น) · สถานะอื่นย้ายไม่ได้', () => {
    expect(canMoveToSuspense('unmatched', 12345)).toBe(true)
    expect(canMoveToSuspense('unmatched', -3500)).toBe(false)
    expect(canMoveToSuspense('manual_matched', 12345)).toBe(false)
    expect(canMoveToSuspense('suspense', 12345)).toBe(false)
    expect(nextBankMatchStatus('unmatched', 'move_to_suspense')).toBe('suspense')
  })

  it('suspense → manual_matched (เหตุผลบังคับ) หรือ suspense_refunded · ไม่มี auto-match', () => {
    expect(nextBankMatchStatus('suspense', 'manual_match')).toBe('manual_matched')
    expect(nextBankMatchStatus('suspense', 'auto_match')).toBeNull()
    expect(nextBankMatchStatus('suspense', 'refund_suspense')).toBe('suspense_refunded')
    expect(nextBankMatchStatus('unmatched', 'refund_suspense')).toBeNull()
    expect(nextBankMatchStatus('suspense', 'resolve_unmatched')).toBeNull()
    expect(suspenseMatchRequiresNote('suspense')).toBe(true)
    expect(suspenseMatchRequiresNote('unmatched')).toBe(false)
  })

  it('suspense_refunded เป็น terminal · suspense ไม่นับเป็นค้างจับคู่', () => {
    expect(isTerminalBankStatus('suspense_refunded')).toBe(true)
    expect(isTerminalBankStatus('suspense')).toBe(false)
    for (const action of ['auto_match', 'manual_match', 'resolve_unmatched', 'move_to_suspense', 'refund_suspense'] as const) {
      expect(nextBankMatchStatus('suspense_refunded', action)).toBeNull()
    }
    expect(isReconciled('suspense')).toBe(true)
  })

  it('ป้าย/สีครบทุกสถานะ (mapper กลาง)', () => {
    expect(BANK_MATCH_STATUS_LABEL.suspense).toBe('เงินรับรอตรวจสอบ')
    expect(BANK_MATCH_STATUS_LABEL.suspense_refunded).toBe('คืนเงินผู้โอนแล้ว')
    expect(BANK_MATCH_STATUS_GROUP.suspense).toBe('pending')
    expect(BANK_MATCH_STATUS_GROUP.suspense_refunded).toBe('cleared')
  })
})

describe('U40/U41 — ความพร้อมปิดงวด: เตือน ไม่บล็อก', () => {
  const base = { criticalOpen: [], warningOpenCount: 0, unmatchedBankCount: 0, billingMismatches: [] }

  it('มีเงินรับรอตรวจสอบ/50 ทวิ ค้าง ⇒ ยังพร้อมปิดงวด แต่มีคำเตือน', () => {
    const result = evaluateReadiness({
      ...base,
      suspenseOutstanding: { count: 1, amountSatang: 12345 },
      pendingCustomerWht: { count: 2, withheldSatang: 11190 },
    })
    expect(result.ready).toBe(true)
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain('เงินรับรอตรวจสอบคงค้าง 1 รายการ')
    expect(result.warnings[0]).toContain('123.45')
    expect(result.warnings[1]).toContain('50 ทวิ จากลูกค้า 2 รายการ')
  })

  it('ไม่มียอดค้าง ⇒ ไม่มีคำเตือน', () => {
    const result = evaluateReadiness({
      ...base,
      suspenseOutstanding: { count: 0, amountSatang: 0 },
      pendingCustomerWht: { count: 0, withheldSatang: 0 },
    })
    expect(result.warnings).toEqual([])
  })
})

describe('U40/U41 — ปลายทางอัปโหลด (server ประกอบ path เอง)', () => {
  it('path ของ target + อ่านเจ้าของจาก path ได้', () => {
    const cert = uploadTargetSchema.parse({ kind: 'customer_wht', certificateId: CERT_ID })
    const certPath = uploadTargetPath(cert, 'user', 'scan.PDF', 'k1')
    expect(certPath).toBe(`customer-wht/${CERT_ID}/k1.pdf`)
    expect(parseStoragePath(certPath)).toEqual({ kind: 'customer_wht', certificateId: CERT_ID })

    const refund = uploadTargetSchema.parse({ kind: 'bank_refund', transactionId: TX_ID })
    const refundPath = uploadTargetPath(refund, 'user', 'slip.jpg', 'k2')
    expect(refundPath).toBe(`bank-transactions/${TX_ID}/refund/k2.jpg`)
    expect(parseStoragePath(refundPath)).toEqual({ kind: 'bank_transaction', transactionId: TX_ID })
  })

  it('path นอกโครง/traversal ⇒ null', () => {
    expect(parseStoragePath(`bank-transactions/${TX_ID}/other/x.pdf`)).toBeNull()
    expect(parseStoragePath(`customer-wht/${CERT_ID}/../x.pdf`)).toBeNull()
  })
})
