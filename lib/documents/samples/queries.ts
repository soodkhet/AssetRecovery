import {
  DOCUMENT_SAMPLES,
  type DocumentSampleListItemDto,
} from '@/lib/documents/samples/catalog'
import type { DocumentSampleContext } from '@/lib/documents/samples/fixtures'
import { listDocumentNumbering } from '@/lib/document-numbering/queries'
import type { DocumentNumberingDto } from '@/lib/document-numbering/types'
import type { DocumentNumberType } from '@/lib/generated/prisma/enums'
import { currentLetterhead } from '@/lib/organization/letterhead'

/**
 * ข้อมูลจริงที่หน้าตัวอย่างเอกสารใช้ (มติ PO U104) — **อ่านอย่างเดียว 2 อย่างเท่านั้น**
 *
 * 1. หัวเอกสาร/โลโก้ขององค์กร (ค่าปัจจุบัน — ตัวเดียวกับเอกสารภายใน)
 * 2. "เลขถัดไป" ของทุกชุดเลขที่เอกสาร — ผ่าน `listDocumentNumbering()` ที่หน้าตั้งค่าใช้แสดงตัวอย่างเลข
 *    (SELECT ล้วน ⇒ **ไม่เดินตัวนับ** ไม่สร้างแถวชุดเลข · ล็อกด้วยเทสต์ DB เทียบ `current_seq` ก่อน/หลัง)
 *
 * ข้อมูลธุรกรรมอื่นทั้งหมดเป็นข้อมูลสมมติจาก `fixtures.ts` — ห้ามเพิ่มการดึงข้อมูลจริงที่นี่
 */

function numbersOf(rows: readonly DocumentNumberingDto[]): Record<DocumentNumberType, string> {
  return Object.fromEntries(rows.map((row) => [row.docType, row.nextNumberPreview])) as Record<
    DocumentNumberType,
    string
  >
}

export async function loadDocumentSampleContext(
  organizationId: string,
  asOf: Date = new Date(),
): Promise<DocumentSampleContext> {
  const [letterhead, numbering] = await Promise.all([
    currentLetterhead(organizationId),
    listDocumentNumbering(organizationId, asOf),
  ])
  return { letterhead, numbers: numbersOf(numbering), asOf }
}

/** `GET /api/accounting/document-samples` — ทะเบียนตัวอย่าง + เลขตัวอย่างตามค่าตั้งปัจจุบัน */
export async function listDocumentSamples(
  organizationId: string,
  asOf: Date = new Date(),
): Promise<DocumentSampleListItemDto[]> {
  const numbering = await listDocumentNumbering(organizationId, asOf)
  const bySeries = new Map(numbering.map((row) => [row.docType, row]))
  return DOCUMENT_SAMPLES.map((info) => {
    const series = info.numberSeries === null ? undefined : bySeries.get(info.numberSeries)
    return {
      ...info,
      sampleNumber: series?.nextNumberPreview ?? null,
      numberPattern: series?.pattern ?? null,
    }
  })
}
