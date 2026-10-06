import type { ComponentProps, ReactNode } from 'react'
import { Image, Page, StyleSheet, View } from '@react-pdf/renderer'
import { Text } from '@/components/pdf/text'
import { THAI_FONT } from '@/components/pdf/thai-font'
import { letterheadContactLine, letterheadTaxLine, type DocLetterhead } from '@/lib/organization/profile'

/**
 * **เลย์เอาต์เอกสารตามแบบที่ผู้ใช้อนุมัติ** (มติ PO U100/U101 · ต้นแบบ `reference/documents.html` · `28` §6.0)
 *
 * ชิ้นส่วนร่วมของเอกสารทุกใบ (ยกเว้นแบบ 50 ทวิ ที่คงแบบทางการของกรมสรรพากร):
 * - {@link DocTitleHeader} โลโก้ + ชื่อบริษัทซ้ายบน · ชื่อเอกสารตัวใหญ่สีน้ำเงินเข้ม + ป้ายฉบับขวาบน
 * - {@link DateNumberRow} วันที่ (ซ้าย) / เลขที่ (ขวา) + ข้อมูลประกอบ 2 คอลัมน์
 * - {@link PartyPanel} กล่องสองฝ่าย · {@link DocTable} ตารางขอบเส้น หัวตารางพื้นเทา (หัวซ้ำทุกหน้า)
 * - แถวหัก = สีแดง · แถวรวม = ตัวหนาพื้นเทา · {@link Signatures} ช่องลายเซ็น · {@link DocPage} ท้ายกระดาษ "หน้า x/y"
 * - {@link InternalHeader} แถบหัวเอกสารภายใน (สรุปรอบจ่าย/หน้าปก/รายงาน)
 *
 * ⚠️ ทุกค่าที่ส่งเข้ามาต้องเป็น**ข้อความที่ประกอบเสร็จแล้ว** (พ.ศ. / คั่นหลักพัน) — ที่นี่ห้ามคำนวณ/format (Rule 01)
 * ⚠️ ห้ามตั้ง `lineHeight` ที่ระดับ `Page` — react-pdf จะไม่วาดท้ายกระดาษแบบ `fixed` + `position: absolute` เลย
 *    (ข้อความยังอยู่ในไฟล์แต่มองไม่เห็น) · ตั้งที่ View ก็ทำให้แถวสูงผิดปกติ ⇒ ใช้ระยะบรรทัดตั้งต้นของฟอนต์
 * ⚠️ เลขหน้านับ**ต่อฉบับ** (`subPageNumber`) — ต้นฉบับ + สำเนาใน PDF เดียวกันขึ้น "หน้า 1/1" ทั้งคู่
 */

/** สไตล์ 1 ชุดของ react-pdf (แพ็กเกจไม่ export ชนิดนี้ตรง ๆ) */
type Style = Exclude<NonNullable<ComponentProps<typeof View>['style']>, readonly unknown[]>

/** สีชื่อเอกสาร (น้ำเงินเข้ม) ตามแบบ */
export const DOC_TITLE_COLOR = '#1e3a8a'
const LINE = '#111827'
const DEDUCT = '#dc2626'
const GRAY_FILL = '#e5e7eb'
const MUTED = '#475569'

/** ป้ายฉบับ (มติ PO U101) */
export type DocCopyKind = 'original' | 'copy'
export const DOC_COPY_LABEL: Record<DocCopyKind, string> = {
  original: '(ต้นฉบับ / Original)',
  copy: '(สำเนา / Copy)',
}
/** ใบแจ้งหนี้ · ใบเสร็จรับเงิน/ใบกำกับภาษี · ใบส่งมอบ = ต้นฉบับ + สำเนา (มติ PO U101) */
export const ORIGINAL_AND_COPY: readonly DocCopyKind[] = ['original', 'copy']

export const layout = StyleSheet.create({
  page: {
    fontFamily: THAI_FONT,
    fontSize: 9,
    paddingHorizontal: 40,
    paddingTop: 32,
    paddingBottom: 58,
    color: LINE,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  logo: { width: 44, height: 44, objectFit: 'contain' },
  brandName: { fontSize: 10, fontWeight: 700 },
  brandNameEn: { fontSize: 8, color: '#64748b' },
  titleBlock: { alignItems: 'flex-end', maxWidth: '58%' },
  title: { fontSize: 21, fontWeight: 700, color: DOC_TITLE_COLOR, lineHeight: 1.2, textAlign: 'right' },
  titleEn: { fontSize: 9.5, fontWeight: 700, color: DOC_TITLE_COLOR, textAlign: 'right' },
  copyLabel: { fontSize: 9.5, fontWeight: 700, color: '#334155', marginTop: 1, textAlign: 'right' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, fontSize: 9.5 },
  bold: { fontWeight: 700 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  extraCell: { width: '50%', paddingRight: 10, fontSize: 9, color: '#334155' },
  partyPanel: { flexDirection: 'row', borderWidth: 1, borderColor: LINE, marginTop: 8 },
  partyCell: { flex: 1, padding: 7 },
  partyCellLeft: { borderRightWidth: 1, borderColor: LINE },
  partyLabel: { fontWeight: 700 },
  partyName: { fontWeight: 700 },
  partyLine: { fontSize: 8.8 },
  banner: {
    borderWidth: 1.2,
    borderColor: DEDUCT,
    color: '#b91c1c',
    fontWeight: 700,
    textAlign: 'center',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 8,
  },
  bannerInfo: { borderColor: DOC_TITLE_COLOR, color: DOC_TITLE_COLOR },
  table: { marginTop: 8 },
  row: { flexDirection: 'row' },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  cellFirst: { borderLeftWidth: 1 },
  headCell: { borderTopWidth: 1, backgroundColor: GRAY_FILL, fontWeight: 700 },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  muted: { color: MUTED },
  deduct: { color: DEDUCT },
  total: { backgroundColor: GRAY_FILL, fontWeight: 700 },
  sub: { fontWeight: 700 },
  note: { fontSize: 8.5, color: MUTED, marginTop: 6 },
  noteBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8.5,
    color: '#334155',
  },
  boxed: { borderWidth: 1, borderColor: LINE, paddingVertical: 7, paddingHorizontal: 9, marginTop: 12, fontSize: 9.5 },
  signRow: { flexDirection: 'row', gap: 18, marginTop: 20 },
  signBox: { flex: 1, alignItems: 'center', fontSize: 9 },
  signLine: { alignSelf: 'stretch', height: 24, borderBottomWidth: 1, borderBottomStyle: 'dotted', borderColor: LINE },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: GRAY_FILL,
    paddingTop: 5,
    fontSize: 8,
    color: '#64748b',
  },
  internalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    borderBottomWidth: 2,
    borderColor: DOC_TITLE_COLOR,
    paddingBottom: 9,
    marginBottom: 12,
  },
  internalTaxLine: { fontSize: 8, color: '#64748b' },
  internalBadge: {
    marginTop: 3,
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    fontSize: 7.5,
    fontWeight: 700,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 2,
  },
  internalTitle: { fontSize: 16, fontWeight: 700, color: DOC_TITLE_COLOR, textAlign: 'right' },
  internalLine: { fontSize: 9, color: '#334155', textAlign: 'right' },
})

// ── ตัวอักษรความกว้างคงที่ (เลขอ้างอิง/IMEI/เลขผู้เสียภาษี — Rule 05 font-mono) ─────────

const MONO_FONT = 'Courier'
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/

/**
 * ฟอนต์ mono ของ PDF — ใช้ Courier ในตัวของ react-pdf **เฉพาะข้อความ ASCII** (Courier ไม่มี glyph ไทย)
 * ข้อความที่มีอักษรอื่นปนใช้ฟอนต์ไทยตามปกติ ⇒ ไม่มีทางพิมพ์อักษรหาย
 */
export function monoStyle(value: string): Style {
  return PRINTABLE_ASCII.test(value) ? { fontFamily: MONO_FONT, fontSize: 8.6 } : {}
}

export function Mono({ children, style }: { children: string; style?: Style | Style[] }): React.JSX.Element {
  const extra = style === undefined ? [] : Array.isArray(style) ? style : [style]
  return <Text style={[...extra, monoStyle(children)]}>{children}</Text>
}

// ── หัวเอกสาร ─────────────────────────────────────────────────────────────

function Brand({ letterhead, children }: { letterhead: DocLetterhead; children?: ReactNode }): React.JSX.Element {
  return (
    <View style={layout.brand}>
      {letterhead.logo === null ? null : (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image ของ react-pdf ไม่มี alt (ไม่ใช่ <img> ของ DOM)
        <Image style={layout.logo} src={{ data: letterhead.logo.data, format: letterhead.logo.format }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={layout.brandName}>{letterhead.nameTh}</Text>
        {children}
      </View>
    </View>
  )
}

/**
 * หัวเอกสารแบบทางการ (ใบแจ้งหนี้/ใบเสร็จ/ใบส่งมอบ/ใบสำคัญจ่าย/สลิป) — ไม่มีโลโก้ = ชื่อบริษัทชิดซ้ายไม่เว้นกล่องว่าง
 * · `copyLabel` ไม่ส่ง = ไม่มีป้ายฉบับ (สลิปค่าตอบแทน)
 */
export function DocTitleHeader({
  letterhead,
  title,
  titleEn,
  copyLabel,
}: {
  letterhead: DocLetterhead
  title: string
  titleEn: string
  copyLabel?: string | null
}): React.JSX.Element {
  return (
    <View style={layout.headerRow}>
      <Brand letterhead={letterhead}>
        {letterhead.nameEn === null ? null : <Text style={layout.brandNameEn}>{letterhead.nameEn}</Text>}
      </Brand>
      <View style={layout.titleBlock}>
        <Text style={layout.title}>{title}</Text>
        <Text style={layout.titleEn}>{titleEn}</Text>
        {copyLabel === undefined || copyLabel === null ? null : <Text style={layout.copyLabel}>{copyLabel}</Text>}
      </View>
    </View>
  )
}

/** แถบหัวเอกสารภายใน — โลโก้ + ชื่อบริษัท + เลขผู้เสียภาษี/สาขา + ป้าย "เอกสารภายใน" ซ้าย · ชื่อเอกสาร + บรรทัดประกอบขวา */
export function InternalHeader({
  letterhead,
  title,
  lines,
}: {
  letterhead: DocLetterhead
  title: string
  lines: readonly string[]
}): React.JSX.Element {
  return (
    <View style={layout.internalHead}>
      <Brand letterhead={letterhead}>
        <Text style={layout.internalTaxLine}>{letterheadTaxLine(letterhead)}</Text>
        <Text style={layout.internalBadge}>เอกสารภายใน</Text>
      </Brand>
      <View style={layout.titleBlock}>
        <Text style={layout.internalTitle}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={layout.internalLine}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}

/** แถว "วันที่: …" ซ้าย / "เลขที่: …" ขวา + ข้อมูลประกอบ 2 คอลัมน์ ("ป้าย: ค่า") */
export function DateNumberRow({
  dateLabel = 'วันที่',
  date,
  numberLabel = 'เลขที่',
  number,
  extras = [],
}: {
  dateLabel?: string
  date: string
  numberLabel?: string
  number: string
  extras?: ReadonlyArray<readonly [string, string]>
}): React.JSX.Element {
  return (
    <>
      <View style={layout.dateRow}>
        <Text>
          <Text style={layout.bold}>{dateLabel}:</Text> {date}
        </Text>
        <Text>
          <Text style={layout.bold}>{numberLabel}:</Text> <Text style={monoStyle(number)}>{number}</Text>
        </Text>
      </View>
      {extras.length === 0 ? null : (
        <View style={layout.extras}>
          {extras.map(([label, value]) => (
            <Text key={label} style={layout.extraCell}>
              <Text style={layout.bold}>{label}:</Text> {value}
            </Text>
          ))}
        </View>
      )}
    </>
  )
}

// ── กล่องสองฝ่าย ──────────────────────────────────────────────────────────

/** ข้อมูลฝ่ายหนึ่งในกล่อง — บรรทัดที่เป็น `null`/ว่าง ไม่พิมพ์ */
export interface PartyBlock {
  label: string
  name: string
  lines: ReadonlyArray<string | null>
}

/**
 * บรรทัดของคู่ค้าตามแบบ: โทร → ที่อยู่ → เลขประจำตัวผู้เสียภาษี (+ สาขา — ม.86/4) → บรรทัดเพิ่ม
 * · `taxLabel` เช่น "เลขประจำตัวประชาชน" สำหรับบุคคลธรรมดา
 */
export function partyLines(party: {
  phone?: string | null
  address?: string | null
  taxId?: string | null
  branchLabel?: string | null
  taxLabel?: string
  extra?: ReadonlyArray<string | null>
}): Array<string | null> {
  const taxId = (party.taxId ?? '').trim()
  const branch = (party.branchLabel ?? '').trim()
  return [
    party.phone === undefined || party.phone === null || party.phone.trim() === '' ? null : `โทร. ${party.phone}`,
    party.address ?? null,
    taxId === '' ? null : `${party.taxLabel ?? 'เลขประจำตัวผู้เสียภาษี'} ${taxId}${branch === '' ? '' : ` · ${branch}`}`,
    ...(party.extra ?? []),
  ]
}

/** บรรทัดของ**ผู้ออกเอกสาร** (องค์กรเรา) จากหัวเอกสารกลาง — ที่อยู่ · ติดต่อ · เลขผู้เสียภาษี + สาขา */
export function letterheadPartyLines(letterhead: DocLetterhead, extra: ReadonlyArray<string | null> = []): Array<string | null> {
  return [
    letterhead.address === '' ? null : letterhead.address,
    letterheadContactLine(letterhead),
    letterheadTaxLine(letterhead),
    ...extra,
  ]
}

function PartyCell({ party, first }: { party: PartyBlock; first: boolean }): React.JSX.Element {
  return (
    <View style={first ? [layout.partyCell, layout.partyCellLeft] : layout.partyCell}>
      <Text style={layout.partyLabel}>{party.label} :</Text>
      <Text style={layout.partyName}>{party.name}</Text>
      {party.lines
        .filter((line): line is string => line !== null && line.trim() !== '')
        .map((line, index) => (
          <Text key={index} style={layout.partyLine}>
            {line}
          </Text>
        ))}
    </View>
  )
}

export function PartyPanel({ left, right }: { left: PartyBlock; right: PartyBlock }): React.JSX.Element {
  return (
    <View style={layout.partyPanel} wrap={false}>
      <PartyCell party={left} first />
      <PartyCell party={right} first={false} />
    </View>
  )
}

export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }): React.JSX.Element {
  return <Text style={tone === 'info' ? [layout.banner, layout.bannerInfo] : layout.banner}>{text}</Text>
}

// ── ตาราง ────────────────────────────────────────────────────────────────

export interface DocColumn {
  label: string
  width: string
  align?: 'left' | 'right' | 'center'
}

/** โทนของแถว: หัก = แดง · รวม = ตัวหนาพื้นเทา · ยอดย่อย = ตัวหนา */
export type RowTone = 'normal' | 'deduct' | 'total' | 'sub'

function alignStyle(align: DocColumn['align']): Style {
  if (align === 'right') return layout.right
  if (align === 'center') return layout.center
  return {}
}

function toneStyle(tone: RowTone): Style[] {
  if (tone === 'deduct') return [layout.deduct]
  if (tone === 'total') return [layout.total]
  if (tone === 'sub') return [layout.sub]
  return []
}

/** ตารางขอบเส้น — หัวตารางพื้นเทา **พิมพ์ซ้ำทุกหน้า** เมื่อรายการยาวข้ามหน้า */
export function DocTable({ columns, children }: { columns: readonly DocColumn[]; children: ReactNode }): React.JSX.Element {
  return (
    <View style={layout.table}>
      <View style={layout.row} fixed>
        {columns.map((column, index) => (
          <Text
            key={column.label}
            style={[
              layout.cell,
              layout.headCell,
              ...(index === 0 ? [layout.cellFirst] : []),
              { width: column.width },
              alignStyle(column.align),
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {children}
    </View>
  )
}

/** เซลล์หนึ่งช่อง — `main` บรรทัดหลัก · `detail` บรรทัดรองสีเทา · `mono` = เลขอ้างอิง/IMEI */
export interface DocCell {
  main: string
  detail?: string | null
  mono?: boolean
  detailMono?: boolean
}

/** แถวรายการ 1 แถว (ไม่ตัดกลางแถวข้ามหน้า) */
export function DocRow({
  columns,
  cells,
  tone = 'normal',
}: {
  columns: readonly DocColumn[]
  cells: readonly DocCell[]
  tone?: RowTone
}): React.JSX.Element {
  return (
    <View style={layout.row} wrap={false}>
      {columns.map((column, index) => {
        const cell = cells[index] ?? { main: '' }
        return (
          <View
            key={column.label}
            style={[layout.cell, ...(index === 0 ? [layout.cellFirst] : []), { width: column.width }, ...toneStyle(tone)]}
          >
            <Text style={[alignStyle(column.align), ...(cell.mono === true ? [monoStyle(cell.main)] : [])]}>{cell.main}</Text>
            {cell.detail === undefined || cell.detail === null || cell.detail === '' ? null : (
              <Text
                style={[
                  layout.muted,
                  alignStyle(column.align),
                  ...(cell.detailMono === true ? [monoStyle(cell.detail)] : []),
                ]}
              >
                {cell.detail}
              </Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

/**
 * แถวสรุปท้ายตาราง — ป้ายชิดขวากินทุกคอลัมน์ก่อนช่องเงิน · ค่าอยู่ช่องเงิน (`valueIndex` — ไม่ส่ง = คอลัมน์สุดท้าย)
 * · คอลัมน์หลังช่องเงิน (เช่น "หมายเหตุ") พิมพ์เป็นช่องว่างให้เส้นตารางตรงกัน
 */
export function SummaryRow({
  columns,
  label,
  value,
  tone = 'normal',
  valueIndex,
}: {
  columns: readonly DocColumn[]
  label: string
  value: string
  tone?: RowTone
  valueIndex?: number
}): React.JSX.Element {
  const index = valueIndex ?? columns.length - 1
  const valueWidth = columns[index]?.width ?? '25%'
  const trailing = columns.slice(index + 1)
  return (
    <View style={layout.row} wrap={false}>
      <Text style={[layout.cell, layout.cellFirst, { flex: 1 }, layout.right, ...toneStyle(tone)]}>{label}</Text>
      <Text style={[layout.cell, { width: valueWidth }, layout.right, ...toneStyle(tone)]}>{value}</Text>
      {trailing.map((column) => (
        <Text key={column.label} style={[layout.cell, { width: column.width }, ...toneStyle(tone)]}>
          {''}
        </Text>
      ))}
    </View>
  )
}

/** แถวเต็มความกว้าง (ช่องทางการชำระเงิน · จำนวนเงินตัวอักษร) */
export function FullRow({ children, bold = false }: { children: ReactNode; bold?: boolean }): React.JSX.Element {
  return (
    <View style={layout.row} wrap={false}>
      <Text style={[layout.cell, layout.cellFirst, { flex: 1 }, ...(bold ? [layout.bold] : [])]}>{children}</Text>
    </View>
  )
}

/** "จำนวนเงิน: -…บาทถ้วน-" (ข้อความตัวอักษรมาจาก `bahtInWords()` แล้ว) */
export function AmountInWordsRow({ words }: { words: string }): React.JSX.Element {
  return <FullRow bold>{`จำนวนเงิน: -${words}-`}</FullRow>
}

/** "ช่องทางการชำระเงิน : …" — ไม่มีข้อมูล = ไม่พิมพ์แถว */
export function PaymentChannelRow({ text }: { text: string | null }): React.JSX.Element | null {
  if (text === null) return null
  return (
    <FullRow>
      <Text style={layout.bold}>ช่องทางการชำระเงิน :</Text> {text}
    </FullRow>
  )
}

// ── ท้ายเอกสาร ───────────────────────────────────────────────────────────

export function NoteText({ children }: { children: ReactNode }): React.JSX.Element {
  return <Text style={layout.note}>{children}</Text>
}

/** กล่องข้อความขอบเส้น (คำรับรองของใบรับรองแทนใบเสร็จ) */
export function BoxedText({ children }: { children: ReactNode }): React.JSX.Element {
  return <Text style={layout.boxed}>{children}</Text>
}

const BLANK_SIGNER = '........................................'

/**
 * ช่องลายเซ็น — เส้นประ · ( ชื่อ ) · บทบาท · วันที่
 * · `names[i]` = ชื่อผู้เซ็นที่ทราบแล้ว (เช่น ผู้เบิก) — ไม่ส่ง/`null` = เว้นจุดให้เขียนเอง
 */
export function Signatures({
  roles,
  names = [],
}: {
  roles: readonly string[]
  names?: ReadonlyArray<string | null>
}): React.JSX.Element {
  return (
    <View style={layout.signRow} wrap={false}>
      {roles.map((role, index) => (
        <View key={role} style={layout.signBox}>
          <View style={layout.signLine} />
          <Text style={{ marginTop: 3 }}>( {names[index] ?? BLANK_SIGNER} )</Text>
          <Text style={layout.bold}>{role}</Text>
          <Text style={layout.muted}>วันที่ ......../......../............</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * หน้ากระดาษ A4 + ท้ายกระดาษ "ชื่อบริษัท · เลขที่เอกสาร" / "หน้า x/y" (นับต่อฉบับ — `subPageNumber`)
 * · ฉบับที่ข้ามหน้าเพราะรายการยาว เลขหน้าเดินต่อในฉบับนั้น
 */
export function DocPage({
  footerLeft,
  orientation = 'portrait',
  children,
}: {
  footerLeft: string
  orientation?: 'portrait' | 'landscape'
  children: ReactNode
}): React.JSX.Element {
  return (
    <Page size="A4" orientation={orientation} style={layout.page}>
      {children}
      <View style={layout.footer} fixed>
        <Text>{footerLeft}</Text>
        <Text render={({ subPageNumber, subPageTotalPages }) => `หน้า ${subPageNumber}/${subPageTotalPages}`} />
      </View>
    </Page>
  )
}
