import { Document, renderToBuffer } from '@react-pdf/renderer'
import { ReceiptStylePage } from '@/components/pdf/receipt-style-doc'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { ReceiptStyleDoc } from '@/lib/documents/receipt-style-doc'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * **ใบเบิกเงินทดรอง (มติ PO U100/U101 · mockup ข้อ 6)**
 * โครงหน้าใช้ร่วม `receipt-style-doc.tsx` · ค่าทุกช่องประกอบจาก builder ที่เป็น pure — ห้าม format ซ้ำที่นี่
 */
export function AdvanceRequestPdf({ doc, letterhead }: { doc: ReceiptStyleDoc; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.number}`} author={letterhead.nameTh}>
      <ReceiptStylePage doc={doc} letterhead={letterhead} />
    </Document>
  )
}

export async function renderAdvanceRequestPdf(doc: ReceiptStyleDoc, letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<AdvanceRequestPdf doc={doc} letterhead={letterhead} />)
}
