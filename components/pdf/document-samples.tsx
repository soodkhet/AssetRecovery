import type { ReactElement } from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { AdvanceRequestPdf } from '@/components/pdf/advance-request'
import { AdvanceReturnPdf } from '@/components/pdf/advance-return'
import { BillingInvoicePDF } from '@/components/pdf/billing-invoice'
import { HandoverNote } from '@/components/pdf/handover-note'
import { PackCover } from '@/components/pdf/pack-cover'
import { PaymentVouchers } from '@/components/pdf/payment-voucher'
import { PayoutBatchSummary } from '@/components/pdf/payout-batch-summary'
import { Payslips } from '@/components/pdf/payslip'
import { runInSampleMode } from '@/components/pdf/sample-stamp'
import { SubstituteReceiptPdf } from '@/components/pdf/substitute-receipt'
import { TaxInvoicePDF } from '@/components/pdf/tax-invoice'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import { WhtCertificatePDF } from '@/components/pdf/wht-certificate'
import { buildAdvanceRequestDoc, buildAdvanceReturnDoc } from '@/lib/advances/advance-doc'
import type { DocumentSampleType } from '@/lib/documents/samples/catalog'
import {
  sampleAdvanceReturnSource,
  sampleAdvanceSource,
  sampleBillingSource,
  sampleHandoverLot,
  sampleHandoverRecipient,
  sampleIssuer,
  samplePackCoverInput,
  samplePayoutBatch,
  samplePayoutPayees,
  sampleSubstituteReceiptSource,
  sampleTaxInvoiceSource,
  sampleWhtCertificateSource,
  type DocumentSampleContext,
} from '@/lib/documents/samples/fixtures'
import { buildPackCoverDoc } from '@/lib/exports/pack'
import { buildPaymentVoucherDocs, buildPayoutSummaryDoc, buildPayslipDocs } from '@/lib/payout/payout-doc'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { buildTaxInvoiceDoc } from '@/lib/sales/sales'
import { buildSubstituteReceiptDoc } from '@/lib/substitute-receipts/substitute-receipt-doc'
import { buildHandoverDoc } from '@/lib/warehouse/handover-doc'
import { buildWhtCertificateDoc } from '@/lib/wht/wht'
import { NO_DOC_TEMPLATE } from '@/lib/settings/tax-doc-template'

/**
 * เรนเดอร์ **ตัวอย่างเอกสาร** (มติ PO U104) ด้วย component + builder **ตัวเดียวกับเอกสารจริงทุกใบ**
 * ⇒ หน้าตาตัวอย่างตรงกับที่ระบบออกจริงเสมอ (แก้แบบเอกสาร = ตัวอย่างเปลี่ยนตามเอง)
 *
 * ต่างจากของจริง 2 อย่าง: ข้อมูลสมมติจาก `lib/documents/samples/fixtures.ts` และเรนเดอร์ภายใน `runInSampleMode`
 * ⇒ ทุกหน้าพิมพ์ลายน้ำ + แถบ "ตัวอย่าง — ไม่ใช่เอกสารจริง" (`components/pdf/sample-stamp.tsx`)
 */

function documentOf(type: DocumentSampleType, context: DocumentSampleContext): ReactElement<DocumentProps> {
  const { letterhead } = context
  // มติ PO U122 — ข้อความท้าย + รูปลายเซ็นตามค่าตั้งปัจจุบันของแท็บ "เทมเพลตเอกสาร"
  const billingTemplate = context.templates?.billing_invoice ?? NO_DOC_TEMPLATE
  const taxTemplate = context.templates?.tax_invoice ?? NO_DOC_TEMPLATE
  const handoverTemplate = context.templates?.handover_note ?? NO_DOC_TEMPLATE
  switch (type) {
    case 'billing-invoice':
      return (
        <BillingInvoicePDF
          doc={buildBillingInvoiceDoc(sampleBillingSource(context))}
          letterhead={letterhead}
          template={billingTemplate}
        />
      )
    case 'receipt-tax-invoice':
      return (
        <TaxInvoicePDF
          doc={buildTaxInvoiceDoc(sampleTaxInvoiceSource(context))}
          letterhead={letterhead}
          template={taxTemplate}
        />
      )
    case 'receipt-tax-invoice-replacement':
      return (
        <TaxInvoicePDF
          doc={buildTaxInvoiceDoc(sampleTaxInvoiceSource(context, 'replacement'))}
          letterhead={letterhead}
          template={taxTemplate}
        />
      )
    case 'receipt-tax-invoice-partial':
      return (
        <TaxInvoicePDF
          doc={buildTaxInvoiceDoc(sampleTaxInvoiceSource(context, 'partial'))}
          letterhead={letterhead}
          template={taxTemplate}
        />
      )
    case 'handover-note':
      return (
        <HandoverNote
          doc={buildHandoverDoc(sampleHandoverLot(context), sampleIssuer(context), sampleHandoverRecipient())}
          letterhead={letterhead}
          template={handoverTemplate}
        />
      )
    case 'payment-voucher':
      return (
        <PaymentVouchers
          docs={buildPaymentVoucherDocs(samplePayoutBatch(context), sampleIssuer(context), samplePayoutPayees())}
          letterhead={letterhead}
        />
      )
    case 'payslip':
      return (
        <Payslips
          docs={buildPayslipDocs(samplePayoutBatch(context), sampleIssuer(context), samplePayoutPayees())}
          letterhead={letterhead}
        />
      )
    case 'payout-summary':
      return (
        <PayoutBatchSummary
          doc={buildPayoutSummaryDoc(samplePayoutBatch(context), sampleIssuer(context), context.asOf)}
          letterhead={letterhead}
        />
      )
    case 'advance-request':
      return (
        <AdvanceRequestPdf doc={buildAdvanceRequestDoc(sampleAdvanceSource(context), letterhead)} letterhead={letterhead} />
      )
    case 'advance-return':
      return (
        <AdvanceReturnPdf
          doc={buildAdvanceReturnDoc(sampleAdvanceReturnSource(context), letterhead)}
          letterhead={letterhead}
        />
      )
    case 'substitute-receipt':
      return (
        <SubstituteReceiptPdf
          doc={buildSubstituteReceiptDoc(sampleSubstituteReceiptSource(context), letterhead)}
          letterhead={letterhead}
        />
      )
    case 'wht-certificate':
      return <WhtCertificatePDF doc={buildWhtCertificateDoc(sampleWhtCertificateSource(context))} />
    case 'pack-cover':
      return <PackCover doc={buildPackCoverDoc(samplePackCoverInput(context))} letterhead={letterhead} />
  }
}

export async function renderDocumentSample(type: DocumentSampleType, context: DocumentSampleContext): Promise<Buffer> {
  ensureThaiFont()
  const document = documentOf(type, context)
  // ไม่ใช้ React context (BUG-172) — สถานะโหมดตัวอย่างไหลผ่าน AsyncLocalStorage ตลอดการเรนเดอร์ (sync + async)
  return runInSampleMode(() => renderToBuffer(document))
}
