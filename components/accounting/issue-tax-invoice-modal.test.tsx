import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { alreadyIssuedMessage, TaxInvoicePreviewSummary } from '@/components/accounting/issue-tax-invoice-modal'
import type { TaxInvoicePreviewDto } from '@/lib/sales/types'

/** mytester3 LR3-02 — พรีวิวแสดงยอด/ป้ายตามผลจาก server (สูตรเดียวกับตอนออก) ไม่คิดเงินเอง */
describe('<TaxInvoicePreviewSummary>', () => {
  const base: TaxInvoicePreviewDto = {
    docTitle: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
    totalBeforeVatSatang: 326_168,
    vatSatang: 22_832,
    totalSatang: 349_000,
    vatRatePct: 7,
    description: 'ค่าบริการติดตามทรัพย์',
    breakdown: {
      transferSatang: 145_700,
      customerWhtSatang: 0,
      creditAppliedSatang: 203_300,
      bankFeeSatang: 0,
      uninvoicedReductionTotalSatang: 0,
      coversRemainder: true,
      excessSatang: 0,
    },
  }

  it('เงินรับ 1,457 + เครดิตใบลดหนี้ 2,033 ⇒ ยอดบนเอกสาร 3,490 + "ครบยอด" (ไม่ใช่ "รับชำระบางส่วน")', () => {
    const html = renderToStaticMarkup(<TaxInvoicePreviewSummary preview={{ status: 'ready', data: base }} />)
    expect(html).toContain('ครบยอด')
    expect(html).not.toContain('รับชำระบางส่วน')
    expect(html).toContain('เครดิตจากใบลดหนี้')
    expect(html).toContain('฿2,033.00')
    expect(html).toContain('฿1,457.00')
    expect(html).toContain('฿3,490.00')
    expect(html).toContain('ภาษีมูลค่าเพิ่ม 7%')
    expect(html).not.toContain('ค่าธรรมเนียมธนาคาร')
  })

  it('รับบางส่วน + ค่าธรรมเนียม/ส่วนที่ลดก่อนออกใบ ⇒ ป้ายและบรรทัดตาม breakdown', () => {
    const partial = renderToStaticMarkup(
      <TaxInvoicePreviewSummary
        preview={{
          status: 'ready',
          data: {
            ...base,
            totalSatang: 100_000,
            breakdown: {
              ...base.breakdown!,
              transferSatang: 100_000,
              creditAppliedSatang: 0,
              uninvoicedReductionTotalSatang: 107_000,
              coversRemainder: false,
            },
          },
        }}
      />,
    )
    expect(partial).toContain('รับชำระบางส่วน')
    expect(partial).not.toContain('เครดิตจากใบลดหนี้')
    expect(partial).toContain('ปรับลดยอด ฿1,070.00')
    expect(partial).toContain('ไม่ต้องออกใบลดหนี้')

    const fee = renderToStaticMarkup(
      <TaxInvoicePreviewSummary
        preview={{ status: 'ready', data: { ...base, breakdown: { ...base.breakdown!, creditAppliedSatang: 0, bankFeeSatang: 2_500 } } }}
      />,
    )
    expect(fee).toContain('ค่าธรรมเนียมธนาคาร')
    expect(fee).toContain('฿25.00')
  })

  it('ใบแทนแบบเดิม (ไม่มี breakdown) ⇒ แสดงยอดตามใบเดิม ไม่มีป้ายครบยอด/บางส่วน', () => {
    const html = renderToStaticMarkup(
      <TaxInvoicePreviewSummary preview={{ status: 'ready', data: { ...base, docTitle: 'ใบกำกับภาษี', breakdown: null } }} />,
    )
    expect(html).toContain('รวมทั้งสิ้น')
    expect(html).not.toContain('ครบยอด')
    expect(html).not.toContain('เงินโอนเข้า')
  })

  it('กำลังคำนวณ / ผิดพลาด ⇒ แสดงสถานะ ไม่มีตัวเลข', () => {
    expect(renderToStaticMarkup(<TaxInvoicePreviewSummary preview={{ status: 'loading' }} />)).toContain('กำลังคำนวณยอด')
    const error = renderToStaticMarkup(
      <TaxInvoicePreviewSummary
        preview={{ status: 'error', error: { title: 'ออกใบไปแล้ว', message: 'เงินรับนี้มีใบใช้งานอยู่' } }}
      />,
    )
    expect(error).toContain('ออกใบไปแล้ว')
    expect(error).not.toContain('฿')
  })
})

/** mytester6 T-021 — แท็บที่แพ้การออกพร้อมกันบอกว่าออกไปแล้ว + เลขใบ ไม่ชวนยกเลิกใบเดิม */
describe('alreadyIssuedMessage()', () => {
  it('TAX_INVOICE_ALREADY_ISSUED + invoiceNumber ⇒ ข้อความมีเลขใบ ไม่บอกให้ยกเลิก', () => {
    const text = alreadyIssuedMessage({
      code: 'TAX_INVOICE_ALREADY_ISSUED',
      payload: { code: 'TAX_INVOICE_ALREADY_ISSUED', title: 'ออกเอกสารนี้ไปแล้ว', message: 'x', invoiceNumber: 'IV-2569-0003' },
    })
    expect(text).toContain('IV-2569-0003')
    expect(text).toContain('ไม่ต้องออกซ้ำ')
    expect(text).not.toContain('ต้องยกเลิกใบเดิม')
  })

  it('ไม่มีเลขใบ (แข่งที่ DB) ⇒ ยังบอกว่าออกไปแล้ว · code อื่น ⇒ null', () => {
    expect(alreadyIssuedMessage({ code: 'TAX_INVOICE_ALREADY_ISSUED' })).toContain('ออกเอกสารไปแล้ว')
    expect(alreadyIssuedMessage({ code: 'TAX_INVOICE_ALREADY_ISSUED' })).not.toContain('เลขที่')
    expect(alreadyIssuedMessage({ code: 'PERIOD_LOCKED_DIRECT_EDIT' })).toBeNull()
  })
})
