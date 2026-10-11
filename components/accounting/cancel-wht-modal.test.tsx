import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CancelWhtModal } from '@/components/accounting/cancel-wht-modal'
import { ToastProvider } from '@/components/ui'
import type { WhtCertificateDto } from '@/lib/wht/types'

/** mytester2 H2-01 — หน้าต่างยกเลิก 50 ทวิ ต้องแสดงชื่อแบบ (ภ.ง.ด.1) ไม่ใช่รหัสภายใน (PND1) */
describe('<CancelWhtModal>', () => {
  const cert = {
    id: 'c1',
    certificateNumber: 'WHT-2569-002',
    payeeName: 'อนันต์ ตามทรัพย์',
    paymentDate: '2026-10-12T03:00:00Z',
    grossSatang: 360000,
    whtSatang: 10800,
    filingForm: 'PND1',
    issueMode: 'per_payee_batch',
    periodClosed: false,
  } as WhtCertificateDto

  it('บรรทัด "วันที่จ่าย / แบบ" แสดง ภ.ง.ด.1', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <CancelWhtModal certificate={cert} onClose={() => undefined} onCancelled={() => undefined} />
      </ToastProvider>,
    )
    expect(html).toContain('ภ.ง.ด.1')
    expect(html).not.toContain('PND1')
  })
})
