// R15a: เรนเดอร์ตัวอย่างเอกสาร 13 ชนิดนอก Next (เลี่ยง BUG-172) ด้วยโค้ดเดียวกับ route — อ่าน DB อย่างเดียว
// ใช้: pnpm exec tsx --env-file=.env.local uat/bin/r15/render-samples.mts
import { writeFileSync } from 'node:fs'
import { renderDocumentSample } from '@/components/pdf/document-samples'
import { loadDocumentSampleContext } from '@/lib/documents/samples/queries'
import { DOCUMENT_SAMPLE_TYPES } from '@/lib/documents/samples/catalog'
const ORG = '00000000-0000-0000-0000-000000000001'
const ctx = await loadDocumentSampleContext(ORG)
for (const t of DOCUMENT_SAMPLE_TYPES) {
  const buf = await renderDocumentSample(t, ctx)
  writeFileSync(`uat/fixtures/downloads-R15/sample-${t}.pdf`, buf)
  console.log(t, buf.length)
}
process.exit(0)
