import { Document, renderToBuffer } from '@react-pdf/renderer'
import { ReceiptStylePage } from '@/components/pdf/receipt-style-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { ReceiptStyleDoc } from '@/lib/documents/receipt-style-doc'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * **ใบรับรองแทนใบเสร็จรับเงิน (มติ PO U103 · mockup ข้อ 8) — รวมคำรับรองของผู้จ่ายเงิน**
 * โครงหน้าใช้ร่วม `receipt-style-doc.tsx` · ค่าทุกช่องประกอบจาก builder ที่เป็น pure — ห้าม format ซ้ำที่นี่
 */
export function SubstituteReceiptPdf({ doc, letterhead }: { doc: ReceiptStyleDoc; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.number}`} author={letterhead.nameTh}>
      <ReceiptStylePage doc={doc} letterhead={letterhead} />
    </Document>
  )
}

export async function renderSubstituteReceiptPdf(doc: ReceiptStyleDoc, letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<SubstituteReceiptPdf doc={doc} letterhead={letterhead} />)
}
