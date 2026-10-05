import { describe, expect, it } from 'vitest'
import { Document, Page, Text as RawText, renderToBuffer } from '@react-pdf/renderer'
import { extractPdfText } from '@/components/pdf/extract-text'
import { pdfSafeThai, Text } from '@/components/pdf/text'
import { ensureThaiFont, THAI_FONT } from '@/components/pdf/thai-font'
import { renderWhtCertificate } from '@/components/pdf/wht-certificate'
import { buildWhtCertificateDoc } from '@/lib/wht/wht'

/**
 * UAT R7cv3-B06 — วงเล็บปิด/อักษรท้ายหายในเอกสาร PDF ("จำนวนเงินที่จ่าย (บาท", "มาตรา 40(8")
 * ต้นเหตุ: react-pdf ตัดอักษรท้ายของทุกข้อความที่มี "ำ" ออกเท่าจำนวน "ำ" (ฟอนต์แตกเป็น 2 glyph)
 * — ไม่ใช่แค่ Quick Look · ข้อความในโค้ดครบ
 */

async function render(node: React.JSX.Element): Promise<string> {
  ensureThaiFont()
  const pdf = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ fontFamily: THAI_FONT, padding: 40 }}>
        {node}
      </Page>
    </Document>,
  )
  return extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
}

describe('สระอำในเอกสาร PDF (UAT R7cv3-B06)', () => {
  it('ยืนยันต้นเหตุ — Text ดิบของ react-pdf ทำอักษรท้ายหาย', async () => {
    expect(await render(<RawText>จำนวนเงินที่จ่าย (บาท)</RawText>)).not.toContain('(บาท)')
  })

  it('Text ของระบบพิมพ์ข้อความครบ ทั้งลูกเดี่ยว ลูกหลายชิ้น และ render prop', async () => {
    expect(await render(<Text>จำนวนเงินที่จ่าย (บาท)</Text>)).toContain('จำนวนเงินที่จ่าย (บาท)')
    const amount = 'มาตรา 40(8)'
    expect(await render(<Text>ค่าจ้างทำของ {amount}</Text>)).toContain('ค่าจ้างทำของ มาตรา 40(8)')
    expect(await render(<Text render={() => 'ผู้มีอำนาจลงนาม (ผู้จ่ายเงิน)'} />)).toContain(
      'ผู้มีอำนาจลงนาม (ผู้จ่ายเงิน)',
    )
  })

  it('pdfSafeThai แยกเฉพาะสระอำ ไม่แตะอักษรอื่น', () => {
    expect(pdfSafeThai('ทำ (บาท)')).toBe('ท\u0E4D\u0E32 (บาท)')
    expect(pdfSafeThai('ภาษีที่หักไว้ (บาท)')).toBe('ภาษีที่หักไว้ (บาท)')
  })

  it('หนังสือรับรอง 50 ทวิ พิมพ์วงเล็บครบทุกจุดที่ UAT พบ', async () => {
    ensureThaiFont()
    const pdf = await renderWhtCertificate(
      buildWhtCertificateDoc({
        certificateNumber: 'WHT-2569-009',
        status: 'active',
        cancelReason: null,
        cancelledAt: null,
        replacesCertificateNumber: null,
        deliveryFormat: 'paper',
        filingForm: 'PND3',
        incomeType: 'ค่าจ้างทำของ มาตรา 40(8)',
        paymentDate: new Date('2026-10-04T03:00:00Z'),
        grossSatang: 7_500,
        whtSatang: 225,
        issuedAt: new Date('2026-10-04T03:00:00Z'),
        payeeType: 'individual',
        incomeCategory: 'sec_40_8',
        whtCondition: 'withhold',
        filingSequence: 1,
        payer: { name: 'AssetRecovery', taxId: '0105560000000', address: 'กรุงเทพฯ', branchLabel: 'สำนักงานใหญ่' },
        payee: { name: 'ผู้รับเงิน ทดสอบ', taxId: '3100000001234', address: 'กรุงเทพฯ', branchLabel: null },
      }),
    )
    const text = extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
    expect(text).toContain('รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)')
    expect(text).toContain('ค่าจ้างทำของ มาตรา 40(8)')
    expect(text).toContain('ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส')
    expect(text).toContain('(ผู้มีหน้าที่หักภาษี ณ ที่จ่าย)')
  })
})
