import { Document, renderToBuffer } from '@react-pdf/renderer'
import {
  DateNumberRow,
  DOC_COPY_LABEL,
  DocPage,
  DocRow,
  DocTable,
  DocTitleHeader,
  letterheadPartyLines,
  NoteText,
  ORIGINAL_AND_COPY,
  partyLines,
  PartyPanel,
  Signatures,
  SummaryRow,
  type DocColumn,
  type DocCopyKind,
} from '@/components/pdf/doc-layout'
import { ensureThaiFont } from '@/components/pdf/thai-font'
import type { DocLetterhead } from '@/lib/organization/profile'
import type { HandoverDocModel } from '@/lib/warehouse/handover-doc'
import { EMPTY_DOC_VALUE } from '@/lib/warehouse/handover-doc'

/**
 * **ใบส่งมอบสินทรัพย์คืน** (`44` §6.4 · เลย์เอาต์ตามแบบที่อนุมัติ มติ PO U100/U101)
 * · **2 ฉบับ** (ต้นฉบับ/สำเนา) ใน PDF เดียว — เซ็นทั้งสองฝ่าย บริษัทไฟแนนซ์เก็บ 1 คลังเก็บ 1
 * · ผู้ส่งมอบ = หัวเอกสารกลาง (ค่าปัจจุบันขององค์กร — มติ PO U99) · ตารางทรัพย์ IMEI/serial ตัวอักษรความกว้างคงที่
 *
 * ⚠️ วันที่ทุกจุดเป็น พ.ศ. มาแล้วจาก `buildHandoverDoc()` — component นี้ **ห้าม format วันที่เอง**
 */

const COLUMNS: readonly DocColumn[] = [
  { label: 'ลำดับ', width: '7%', align: 'center' },
  { label: 'เลขสัญญา', width: '20%' },
  { label: 'ยี่ห้อ / รุ่น', width: '22%' },
  { label: 'IMEI / Serial', width: '23%' },
  { label: 'สภาพ / หมายเหตุ', width: '28%' },
]

function HandoverCopy({
  doc,
  letterhead,
  copy,
}: {
  doc: HandoverDocModel
  letterhead: DocLetterhead
  copy: DocCopyKind
}): React.JSX.Element {
  const extras: Array<readonly [string, string]> = [
    ['เลขล็อต', doc.lotNumber],
    ['รูปแบบ', doc.typeLabel],
    // UAT BUG-080 — วันนัดต้องอยู่บนใบส่งมอบ (หน้าดูตัวอย่างแสดง)
    [doc.scheduledAtCaption, doc.scheduledAtLabel],
  ]
  if (doc.trackingNo !== EMPTY_DOC_VALUE) extras.push(['เลขพัสดุ', doc.trackingNo])

  const recipient = doc.recipient
  return (
    <DocPage footerLeft={`${doc.issuer.name} · ${doc.docRef}`}>
      <DocTitleHeader
        letterhead={letterhead}
        title={doc.title}
        titleEn="Asset Handover Note"
        copyLabel={DOC_COPY_LABEL[copy]}
      />
      <DateNumberRow date={doc.issuedAtLabel} number={doc.docRef} extras={extras} />
      <PartyPanel
        left={{ label: 'ผู้ส่งมอบ', name: letterhead.nameTh, lines: letterheadPartyLines(letterhead) }}
        right={{
          label: 'ผู้รับมอบ',
          name: recipient.name,
          lines: partyLines({
            phone: recipient.phone,
            address: recipient.address,
            taxId: recipient.taxId,
            branchLabel: recipient.branchLabel,
            extra: [
              recipient.contactPerson === EMPTY_DOC_VALUE ? null : `ผู้ประสานงาน: ${recipient.contactPerson}`,
              recipient.deliveryAddr === EMPTY_DOC_VALUE ? null : `ที่อยู่จัดส่ง: ${recipient.deliveryAddr}`,
            ],
          }),
        }}
      />

      <DocTable columns={COLUMNS}>
        {doc.rows.map((row) => (
          <DocRow
            key={`${row.caseRef}-${row.no}`}
            columns={COLUMNS}
            cells={[
              { main: String(row.no) },
              { main: row.caseRef, mono: true, detail: row.debtorName },
              { main: row.deviceDesc },
              {
                main: row.identifier,
                mono: true,
                detail: row.identifierActual === null ? null : `ตรวจจริง: ${row.identifierActual}`,
              },
              { main: row.condition, detail: row.conditionNote },
            ]}
          />
        ))}
        <SummaryRow columns={COLUMNS} tone="total" label="จำนวนทรัพย์รวม :" value={`${doc.totalCount} เครื่อง`} />
      </DocTable>

      {doc.note === EMPTY_DOC_VALUE ? null : <NoteText>หมายเหตุ: {doc.note}</NoteText>}
      <NoteText>
        ผู้รับมอบได้ตรวจนับและตรวจเลข IMEI ตรงกับรายการข้างต้นครบถ้วนแล้ว · หากพบความไม่ถูกต้องโปรดแจ้งภายในวันที่รับมอบ
      </NoteText>
      <Signatures roles={['ผู้ส่งมอบ', 'ผู้รับมอบ']} />
    </DocPage>
  )
}

export function HandoverNote({ doc, letterhead }: { doc: HandoverDocModel; letterhead: DocLetterhead }): React.JSX.Element {
  return (
    <Document title={`${doc.title} ${doc.docRef}`} author={doc.issuer.name}>
      {ORIGINAL_AND_COPY.map((copy) => (
        <HandoverCopy key={copy} doc={doc} letterhead={letterhead} copy={copy} />
      ))}
    </Document>
  )
}

/** เรนเดอร์เป็นไฟล์ PDF (`28` §7 — `renderToBuffer()` ฝั่ง server แล้วคืนพร้อม header) */
export async function renderHandoverNote(doc: HandoverDocModel, letterhead: DocLetterhead): Promise<Buffer> {
  ensureThaiFont()
  return renderToBuffer(<HandoverNote doc={doc} letterhead={letterhead} />)
}
