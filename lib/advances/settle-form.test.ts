import { describe, expect, it } from 'vitest'
import {
  SETTLE_RECEIPT_REQUIRED_MESSAGE,
  settleApiIssues,
  settleFormIssues,
  settleLinesOverUsedMessage,
} from '@/lib/advances/settle-form'
import type { SubstituteLineDraft } from '@/lib/substitute-receipts/form'

const line = (key: string, amountBaht: string, description = 'ค่าวินมอเตอร์ไซค์'): SubstituteLineDraft => ({
  key,
  lineDate: '2026-10-15',
  description,
  amountBaht,
  note: '',
})

describe('settleFormIssues (SV5-J1-02/03)', () => {
  it('ยอดรวมรายการเกินยอดใช้จริง ⇒ ผูกช่องยอดที่ใช้จริง + ขึ้น footer (ไม่ใช่ข้อความลอยใต้ตาราง)', () => {
    const issues = settleFormIssues({ usedSatang: 100_025, hasReceipt: false, noReceipt: true, lines: [line('a', '2000')] })
    expect(issues.errors.usedSatang).toBe('ยอดรวมรายการที่ไม่มีใบเสร็จ (฿2,000.00) ต้องไม่เกินยอดที่ใช้จริง (฿1,000.25)')
    expect(issues.lines).toBeNull()
    expect(issues.first).toEqual({ field: 'usedSatang', message: issues.errors.usedSatang })
    expect(issues.payload).toBeNull()
  })

  it('มีรายจ่ายแต่ไม่แนบใบเสร็จและไม่ติ๊ก ⇒ ผูกช่องใบเสร็จ', () => {
    const issues = settleFormIssues({ usedSatang: 100_025, hasReceipt: false, noReceipt: false, lines: [line('a', '')] })
    expect(issues.errors).toEqual({ receiptFileUrl: SETTLE_RECEIPT_REQUIRED_MESSAGE })
    expect(issues.first?.field).toBe('receiptFileUrl')
  })

  it('แถวในตารางผิด ⇒ ชี้แถว+ช่อง และเป็นข้อแรกเมื่อช่องบนไม่ผิด', () => {
    const issues = settleFormIssues({ usedSatang: 100_025, hasReceipt: false, noReceipt: true, lines: [line('a', '100', '')] })
    expect(issues.lines?.at).toMatchObject({ lineKey: 'a', field: 'description' })
    expect(issues.first?.field).toBe('substituteReceipt')
  })

  it('ผ่าน ⇒ ไม่มีข้อผิด + payload ของรายการ', () => {
    const issues = settleFormIssues({ usedSatang: 100_025, hasReceipt: false, noReceipt: true, lines: [line('a', '500')] })
    expect(issues.first).toBeNull()
    expect(issues.payload?.lines[0]?.amountSatang).toBe(50_000)
  })

  it('แนบใบเสร็จ ไม่ติ๊ก ⇒ ผ่าน payload null · ยอด 0 ไม่ต้องแนบ', () => {
    expect(settleFormIssues({ usedSatang: 100, hasReceipt: true, noReceipt: false, lines: [] }).first).toBeNull()
    expect(settleFormIssues({ usedSatang: 0, hasReceipt: false, noReceipt: false, lines: [] }).first).toBeNull()
  })

  it('ยอดใช้จริง 0 + ติ๊กไม่มีใบเสร็จ มีรายการ ⇒ ผิดที่ช่องยอดที่ใช้จริง', () => {
    const issues = settleFormIssues({ usedSatang: 0, hasReceipt: false, noReceipt: true, lines: [line('a', '1')] })
    expect(issues.first?.field).toBe('usedSatang')
  })

  it('แนบใบเสร็จ + ติ๊กไม่มีใบเสร็จพร้อมกัน ⇒ ผ่าน ส่งรายการไปด้วย', () => {
    const issues = settleFormIssues({ usedSatang: 100_025, hasReceipt: true, noReceipt: true, lines: [line('a', '500')] })
    expect(issues.first).toBeNull()
    expect(issues.payload?.lines).toHaveLength(1)
  })

  it('ข้อความยอดเกินไม่มีตัวเลข ⇒ ข้อความกลาง', () => {
    expect(settleLinesOverUsedMessage(null, 1)).toBe('ยอดรวมรายการที่ไม่มีใบเสร็จต้องไม่เกินยอดที่ใช้จริง')
  })
})

describe('settleApiIssues (SV5-J1-03)', () => {
  const drafts = [line('a', '100'), line('b', '200')]

  it('substituteReceipt (ยอดรวมเกิน) ⇒ ช่องยอดที่ใช้จริง', () => {
    const issues = settleApiIssues({ substituteReceipt: 'ยอดรวมรายการที่ไม่มีใบเสร็จต้องไม่เกินยอดที่ใช้จริง' }, drafts)
    expect(issues.errors.usedSatang).toBeDefined()
    expect(issues.first?.field).toBe('usedSatang')
  })

  it('ช่องในแถว ⇒ แถว+ช่องจริง (ตัด prefix substituteReceipt.)', () => {
    const issues = settleApiIssues({ 'substituteReceipt.lines.1.amountSatang': 'จำนวนเงินต้องมากกว่า 0' }, drafts)
    expect(issues.lines?.at).toMatchObject({ lineIndex: 1, lineKey: 'b', field: 'amount' })
    expect(issues.first?.field).toBe('substituteReceipt')
  })

  it('เรียงข้อแรกตามลำดับบนจอ ไม่ใช่ลำดับ key', () => {
    const issues = settleApiIssues({ note: 'ยาวเกิน', receiptFileUrl: 'ไฟล์ไม่ถูกต้อง' }, drafts)
    expect(issues.first).toEqual({ field: 'receiptFileUrl', message: 'ไฟล์ไม่ถูกต้อง' })
    expect(issues.errors.note).toBe('ยาวเกิน')
  })

  it('ไม่มี fields / key ไม่รู้จัก ⇒ ไม่ผูกช่อง', () => {
    expect(settleApiIssues(undefined, drafts).first).toBeNull()
    expect(settleApiIssues({ _: 'x', foo: 'y' }, drafts).first).toBeNull()
  })

  it('ผิดระดับทั้งตาราง ⇒ lines.at = null', () => {
    const issues = settleApiIssues({ 'substituteReceipt.lines': 'ต้องมีอย่างน้อย 1 รายการ' }, drafts)
    expect(issues.lines).toEqual({ message: 'ต้องมีอย่างน้อย 1 รายการ', at: null })
  })
})
