import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExpenseDetailModal } from '@/components/finance/expense-detail-modal'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'

/** mytester2 F2-03 — modal รายละเอียดรายการเบิกของรายการที่ส่งใหม่ ต้องแสดงเหตุผลที่ตีกลับล่าสุด */
describe('<ExpenseDetailModal>', () => {
  const base = {
    id: 'e1',
    caseRef: null,
    payeeName: 'สมหญิง ในบ้าน',
    expenseType: 'hotel',
    expenseDate: '2026-10-10',
    grossSatang: 60_000,
    basisText: 'ตามใบเสร็จ',
    status: 'pending',
    recordedByName: null,
    sharedWithName: null,
    note: null,
    resubmitNote: 'แนบใบเสร็จใหม่แล้ว',
    receiptFilePath: null,
    substituteReceipt: null,
    receiptUnverified: false,
    rejectReason: null,
    previousRejectReason: 'ใบเสร็จไม่ชัด',
    createdAt: '2026-10-10T03:00:00Z',
  } as unknown as CompensationApprovalDto

  it('ส่งใหม่แล้ว (rejectReason ถูกล้าง) ⇒ แสดงเหตุผลครั้งก่อน', () => {
    const html = renderToStaticMarkup(<ExpenseDetailModal item={base} onClose={() => undefined} />)
    expect(html).toContain('เหตุผลที่ตีกลับล่าสุด')
    expect(html).toContain('ใบเสร็จไม่ชัด')
    expect(html).toContain('แนบใบเสร็จใหม่แล้ว')
  })

  it('ยังตีกลับอยู่ ⇒ แสดงเหตุผลปัจจุบัน · ไม่เคยตีกลับ ⇒ ไม่มีแถว', () => {
    const rejected = { ...base, status: 'rejected', rejectReason: 'ยอดไม่ตรง', previousRejectReason: null } as CompensationApprovalDto
    expect(renderToStaticMarkup(<ExpenseDetailModal item={rejected} onClose={() => undefined} />)).toContain('ยอดไม่ตรง')
    const fresh = { ...base, previousRejectReason: null } as CompensationApprovalDto
    expect(renderToStaticMarkup(<ExpenseDetailModal item={fresh} onClose={() => undefined} />)).not.toContain('เหตุผลที่ตีกลับล่าสุด')
  })
})
