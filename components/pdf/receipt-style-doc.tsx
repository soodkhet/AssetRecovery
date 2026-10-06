import {
  Banner,
  BoxedText,
  DateNumberRow,
  DocPage,
  DocRow,
  DocTable,
  DocTitleHeader,
  FullRow,
  layout,
  NoteText,
  PartyPanel,
  Signatures,
  SummaryRow,
  type DocColumn,
} from '@/components/pdf/doc-layout'
import { Text } from '@/components/pdf/text'
import type { ReceiptDocChoice, ReceiptStyleDoc } from '@/lib/documents/receipt-style-doc'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * หน้าเอกสาร "แบบใบเสร็จ" ตามแบบที่อนุมัติ (มติ PO U100/U101 · mockup `reference/documents.html` ข้อ 6–8) —
 * ใช้ร่วมกันโดยใบเบิกเงินทดรอง / ใบรับคืนเงินทดรอง / ใบรับรองแทนใบเสร็จรับเงิน · **ต้นฉบับเดียว**
 *
 * ประกอบจากชิ้นส่วนกลาง `doc-layout.tsx` ชุดเดียวกับใบสำคัญจ่าย/ใบเสร็จรับเงิน ⇒ หน้าตาเหมือนเอกสารอื่นทุกใบ:
 * หัวเอกสาร (โลโก้ + ชื่อบริษัท / ชื่อเอกสาร + ฉบับ) → วันที่/เลขที่ → (ป้ายยกเลิก) → กล่องสองฝ่าย → ตาราง →
 * แถวช่องทาง → แถวสรุป → จำนวนเงินตัวอักษร → (คำรับรอง) → หมายเหตุ → ลายเซ็น → ท้ายกระดาษ "หน้า x/y"
 * ⚠️ ค่าทุกช่องประกอบเสร็จแล้วจาก builder ที่เป็น pure — ที่นี่แค่พิมพ์ (Rule 01)
 */

function choiceText(option: ReceiptDocChoice): string {
  return `${option.checked ? '[X]' : '[   ]'} ${option.label}`
}

export function ReceiptStylePage({ doc, letterhead }: { doc: ReceiptStyleDoc; letterhead: DocLetterhead }): React.JSX.Element {
  const [left, right] = doc.parties
  const columns: DocColumn[] = doc.columns.map((column) => ({
    label: column.header,
    width: column.width,
    align: column.align,
  }))
  // ช่องเงิน = คอลัมน์ชิดขวาตัวแรก (ใบรับรองแทนใบเสร็จมี "หมายเหตุ" ต่อท้าย)
  const amountIndex = Math.max(
    0,
    doc.columns.findIndex((column) => column.align === 'right'),
  )

  return (
    <DocPage footerLeft={doc.footerLeft}>
      <DocTitleHeader letterhead={letterhead} title={doc.title} titleEn={doc.titleEn} copyLabel={doc.copyLabel} />
      <DateNumberRow
        date={doc.dateText}
        number={doc.number}
        extras={doc.meta.map((entry) => [entry.label, entry.value] as const)}
      />
      {doc.cancelled === null ? null : <Banner text={`${doc.cancelled.title} — ${doc.cancelled.detail}`} />}
      <PartyPanel left={left} right={right} />

      <DocTable columns={columns}>
        {doc.rows.map((row, rowIndex) => (
          <DocRow
            key={rowIndex}
            columns={columns}
            tone={row.deduct === true ? 'deduct' : 'normal'}
            cells={row.cells.map((cell, index) => ({ main: cell, detail: index === 1 ? (row.sub ?? null) : null }))}
          />
        ))}
        {doc.infoLine === null ? null : (
          <FullRow>
            <Text style={layout.bold}>{doc.infoLine.label} :</Text> {doc.infoLine.text}
          </FullRow>
        )}
        {doc.choices === null ? null : (
          <FullRow>
            <Text style={layout.bold}>{doc.choices.label} :</Text>
            {`   ${doc.choices.options.map(choiceText).join('      ')}`}
          </FullRow>
        )}
        {doc.summary.map((entry) => (
          <SummaryRow
            key={entry.label}
            columns={columns}
            tone={entry.tone}
            label={entry.label}
            value={entry.value}
            valueIndex={amountIndex}
          />
        ))}
        <FullRow bold>{doc.wordsText}</FullRow>
      </DocTable>

      {doc.certification === null ? null : <BoxedText>{doc.certification}</BoxedText>}
      {doc.note === null ? null : <NoteText>{doc.note}</NoteText>}
      <Signatures
        roles={doc.signatures.map((signature) => signature.role)}
        names={doc.signatures.map((signature) => signature.name)}
      />
    </DocPage>
  )
}
