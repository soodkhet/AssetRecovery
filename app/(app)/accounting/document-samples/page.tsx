import { DocumentSamplesView } from '@/components/accounting/document-samples-view'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * บัญชี → "ตัวอย่างเอกสารทั้งหมด" (มติ PO 06/10/2569 U104 · `06` §7.2/§8)
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — PDF/รายการตรวจสิทธิ์ `view_document_samples` ซ้ำที่ API (DEC-002)
 */
export default async function DocumentSamplesPage() {
  await requireMenuPage('accounting.document-samples')
  return <DocumentSamplesView />
}
