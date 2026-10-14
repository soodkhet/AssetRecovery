import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CancelWhtModal } from '@/components/accounting/cancel-wht-modal'
import { HotelClaimModal } from '@/components/field/hotel-claim-modal'
import { CancelPayoutModal } from '@/components/finance/cancel-payout-modal'
import { RecordSeparateReturnModal } from '@/components/finance/advance-return-modals'
import { ToastProvider } from '@/components/ui'
import type { AdvanceDto } from '@/lib/advances/types'
import type { PayoutBatchDto } from '@/lib/payout/types'
import type { WhtCertificateDto } from '@/lib/wht/types'

/**
 * ตรวจซ้ำ staging SV5-R9-01 — ฟอร์มตัวแทน: ทุก `<label for>` ชี้ช่องที่มีอยู่จริง และทุกช่องกรอกที่มองเห็นมี label ผูก
 * (render ทั้งฟอร์มแล้วตรวจ markup — กันฟอร์มที่ส่ง id ให้ `<Field>` แต่ลืมส่งให้ช่อง หรือกลับกัน)
 */
function labelFors(html: string): string[] {
  return Array.from(html.matchAll(/<label[^>]*\sfor="([^"]+)"/g), (match) => match[1] ?? '')
}

function controlIds(html: string): string[] {
  return Array.from(html.matchAll(/<(?:input|select|textarea|button)\b[^>]*\sid="([^"]+)"/g), (match) => match[1] ?? '')
}

function expectBound(html: string, minLabels: number): void {
  const fors = labelFors(html)
  expect(fors.length).toBeGreaterThanOrEqual(minLabels)
  const ids = controlIds(html)
  for (const id of fors) expect(ids, `label for="${id}" ต้องชี้ช่องกรอก`).toContain(id)
  // id จาก useId ไม่ซ้ำกันในฟอร์มเดียว
  expect(new Set(fors).size).toBe(fors.length)
}

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>)
}

describe('ฟอร์มตัวแทน — label ผูกช่อง', () => {
  it('เบิกค่าที่พัก (ภาคสนาม): วันที่/จำนวนคืน/จำนวนเงิน/พักร่วม/แนบใบเสร็จ/หมายเหตุ ผูก label ครบ', () => {
    const html = render(<HotelClaimModal onClose={() => undefined} onCreated={() => undefined} />)
    expectBound(html, 6)
    // ช่องแนบใบเสร็จ = ปุ่มเลือกไฟล์ (label ชี้ปุ่ม · ชื่อไฟล์เป็นคำอธิบาย)
    expect(html).toMatch(/<button[^>]*id="[^"]*-receipt"[^>]*aria-describedby="[^"]*-receipt-file-name"/)
  })

  it('บันทึกรับคืนเงินทดรอง: ช่องแนบหลักฐาน (StagedFileInput) ผูก label', () => {
    const advance = {
      id: 'a1',
      ref: 'ADV-2569-001',
      payeeName: 'อนันต์ ตามทรัพย์',
      returnOutstandingSatang: 50000,
    } as AdvanceDto
    const html = render(<RecordSeparateReturnModal advance={advance} onClose={() => undefined} onDone={() => undefined} />)
    expectBound(html, 4)
    expect(html).toMatch(/<button[^>]*id="[^"]*-file"/)
  })

  it('ยกเลิกรอบจ่าย / ยกเลิก 50 ทวิ: ช่องเหตุผลผูก label', () => {
    const batch = {
      id: 'b1',
      name: 'รอบ 1',
      paymentFileGeneratedAt: null,
      itemCount: 1,
      netSatang: 100,
      transferSatang: 100,
      advanceOffsetSatang: 0,
    } as PayoutBatchDto
    expectBound(render(<CancelPayoutModal batch={batch} onClose={() => undefined} onCancelled={() => undefined} />), 1)
    const cert = {
      id: 'c1',
      certificateNumber: 'WHT-2569-002',
      payeeName: 'อนันต์',
      paymentDate: '2026-10-12T03:00:00Z',
      grossSatang: 360000,
      whtSatang: 10800,
      filingForm: 'PND1',
      issueMode: 'per_payee_batch',
      periodClosed: false,
    } as WhtCertificateDto
    expectBound(render(<CancelWhtModal certificate={cert} onClose={() => undefined} onCancelled={() => undefined} />), 1)
  })
})
