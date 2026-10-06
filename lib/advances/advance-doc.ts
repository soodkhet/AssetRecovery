import { ADVANCE_RETURN_CHANNEL_LABEL } from '@/lib/advances/advance'
import { AdvanceError } from '@/lib/advances/errors'
import {
  docDeduct,
  docMoney,
  docWords,
  ORIGINAL_COPY_LABEL,
  organizationDocParty,
  payeeBankLine,
  payeeDisplayName,
  payeeDocParty,
  type DocPayeeSource,
  type ReceiptStyleDoc,
} from '@/lib/documents/receipt-style-doc'
import { fmtDate } from '@/lib/format/datetime'
import type { AdvanceReturnChannel, AdvanceStatus } from '@/lib/generated/prisma/enums'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * ใบเบิกเงินทดรอง / ใบรับคืนเงินทดรอง (มติ PO U100/U101 · mockup `reference/documents.html` ข้อ 6–7 · `28` §6.1)
 * — **pure ล้วน**: แหล่งข้อมูล → โครงเอกสารที่ประกอบเสร็จ (`ReceiptStyleDoc`) · ต้นฉบับเดียวทั้งสองใบ
 *
 * - ใบเบิก: เลข `advances.advance_number` · จ่ายโดย (องค์กร) / ผู้เบิก (พนักงาน — ที่อยู่/เลขบัตรจาก payee)
 *   · ยอด = ยอดอนุมัติ · ออกได้ตั้งแต่อนุมัติแล้ว (`approved`/`overdue`/`cleared`) · ผู้เซ็น ผู้เบิก/ผู้อนุมัติ/ผู้จ่ายเงิน
 * - ใบรับคืน: ต่อแถว `advance_returns` (เลข RAV) · ชำระโดย (พนักงาน) / ชำระให้ (องค์กร) · ยอดเบิก/ใช้จริง/คืน
 *   · ช่องทาง (เงินสด/โอน/หักกลบรอบจ่าย + ชื่อรอบ/เลข PV) · แถวที่กลับรายการแล้วพิมพ์ป้าย "ยกเลิก"
 */

/** สถานะที่พิมพ์ใบเบิกได้ — ก่อนอนุมัติยังไม่มีเงินออก · ปฏิเสธแล้วไม่มีเอกสาร */
export const ADVANCE_PRINTABLE_STATUSES: readonly AdvanceStatus[] = ['approved', 'overdue', 'cleared']

export function canPrintAdvanceRequest(status: AdvanceStatus): boolean {
  return ADVANCE_PRINTABLE_STATUSES.includes(status)
}

export function assertAdvanceRequestPrintable(status: AdvanceStatus, advanceId: string): void {
  if (canPrintAdvanceRequest(status)) return
  throw new AdvanceError('ADVANCE_INVALID_STATUS', {
    message: 'ใบเบิกเงินทดรองพิมพ์ได้หลังคำขอได้รับอนุมัติแล้วเท่านั้น',
    detail: `advance=${advanceId} status=${status}`,
  })
}

export interface AdvanceDocSource {
  advanceNumber: string
  status: AdvanceStatus
  requestedSatang: number
  approvedSatang: number | null
  usedSatang: number
  returnSatang: number
  purpose: string
  dueClearDate: Date
  createdAt: Date
  approvedAt: Date | null
  clearedAt: Date | null
  approverName: string | null
  teamName: string | null
  payee: DocPayeeSource
  /** รอบจ่ายที่จ่ายเงินทดรองนี้ (ถ้ามี) */
  payoutBatchName: string | null
  /** ใบรับรองแทนใบเสร็จตอนเคลียร์ยอด (มติ PO U103) */
  substituteReceiptNumber: string | null
}

export const ADVANCE_REQUEST_NOTE =
  'ผู้เบิกต้องเคลียร์ยอดด้วยใบเสร็จ/ใบรับรองแทนใบเสร็จภายในกำหนด · ยอดเหลือคืนบริษัทเป็นเงินสด/โอน หรือหักกลบในรอบจ่ายถัดไป · ระหว่างยังไม่เคลียร์ เบิกเงินทดรองซ้อนไม่ได้'

/** ยอดที่ออกจริง = ยอดอนุมัติ (ยังไม่อนุมัติ = ยอดขอเบิก — ใช้แสดงเท่านั้น ใบจริงพิมพ์หลังอนุมัติ) */
function advanceAmountSatang(source: Pick<AdvanceDocSource, 'approvedSatang' | 'requestedSatang'>): number {
  return source.approvedSatang ?? source.requestedSatang
}

/** ตารางของใบเบิก/ใบรับคืน: ลำดับ · รายการ · บาท (ตามแบบเดียวกับใบสำคัญจ่าย) */
const ADVANCE_DOC_COLUMNS: ReceiptStyleDoc['columns'] = [
  { header: 'ลำดับ', width: '8%', align: 'center' },
  { header: 'รายการ (Descriptions)', width: '66%', align: 'left' },
  { header: 'บาท (Baht)', width: '26%', align: 'right' },
]

export function advanceRequestFileName(advanceNumber: string): string {
  return `ใบเบิกเงินทดรอง ${advanceNumber}.pdf`
}

export function buildAdvanceRequestDoc(source: AdvanceDocSource, letterhead: DocLetterhead): ReceiptStyleDoc {
  const amount = advanceAmountSatang(source)
  const bank = payeeBankLine(source.payee)
  const adjusted = source.approvedSatang !== null && source.approvedSatang !== source.requestedSatang
  const channel = [
    bank === null ? null : `โอนเข้าบัญชี ${bank}`,
    source.payoutBatchName === null ? null : `จ่ายในรอบ ${source.payoutBatchName}`,
  ].filter((part): part is string => part !== null)

  return {
    title: 'ใบเบิกเงินทดรอง',
    titleEn: 'Cash Advance Request',
    copyLabel: ORIGINAL_COPY_LABEL,
    dateText: fmtDate(source.approvedAt ?? source.createdAt),
    number: source.advanceNumber,
    meta: [
      { label: 'กำหนดเคลียร์ยอด', value: fmtDate(source.dueClearDate) },
      { label: 'ทีม', value: source.teamName ?? '-' },
      { label: 'วันที่ขอเบิก', value: fmtDate(source.createdAt) },
    ],
    parties: [
      organizationDocParty('จ่ายโดย', letterhead),
      payeeDocParty('ผู้เบิก', source.payee, bank === null ? [] : [`บัญชีรับโอน: ${bank}`]),
    ],
    columns: ADVANCE_DOC_COLUMNS,
    rows: [
      {
        cells: ['1', `เงินทดรอง — ${source.purpose}`, docMoney(amount)],
        sub: adjusted ? `ขอเบิก ${docMoney(source.requestedSatang)} บาท · อนุมัติ ${docMoney(amount)} บาท` : null,
      },
    ],
    infoLine: channel.length === 0 ? null : { label: 'ช่องทางการจ่ายเงิน', text: channel.join(' · ') },
    choices: null,
    summary: [{ label: 'รวมเงินเบิกทั้งสิ้น :', value: docMoney(amount), tone: 'total' }],
    wordsText: docWords(amount),
    certification: null,
    note: ADVANCE_REQUEST_NOTE,
    signatures: [
      { role: 'ผู้เบิก', name: payeeDisplayName(source.payee) },
      { role: 'ผู้อนุมัติ', name: source.approverName },
      { role: 'ผู้จ่ายเงิน', name: null },
    ],
    cancelled: null,
    footerLeft: `${letterhead.nameTh} · ${source.advanceNumber}`,
  }
}

// ── ใบรับคืนเงินทดรอง ─────────────────────────────────────────────────────────

export interface AdvanceReturnDocSource {
  returnNumber: string
  channel: AdvanceReturnChannel
  amountSatang: number
  /** รับคืนแยก = วันที่รับเงิน · หักกลบ = วันจ่ายของรอบ (ตัวเดียวกับ Export) */
  returnDate: Date
  payoutBatchName: string | null
  /** เลขใบสำคัญจ่ายของรอบที่หักกลบ (ถ้ามี) */
  voucherNumber: string | null
  reversedAt: Date | null
  reversalReason: string | null
  /** ยอดที่รับคืนแล้วก่อนแถวนี้ (แถวที่ยังมีผล — ไม่นับที่กลับรายการ) */
  collectedBeforeSatang: number
  advance: AdvanceDocSource
}

export function advanceReturnFileName(returnNumber: string): string {
  return `ใบรับคืนเงินทดรอง ${returnNumber}.pdf`
}

export const ADVANCE_RETURN_NOTE =
  'กรณีหักกลบแล้วยอดรอบจ่ายไม่พอ ระบบหักเท่าที่มีและยกยอดเหลือไปรอบถัดไป — ใบนี้แสดงยอดที่รับคืนในครั้งนี้'

function offsetChoiceLabel(source: AdvanceReturnDocSource): string {
  const parts = [
    source.payoutBatchName === null ? null : source.payoutBatchName,
    source.voucherNumber === null ? null : source.voucherNumber,
  ].filter((part): part is string => part !== null)
  return parts.length === 0 ? 'หักกลบในรอบจ่าย' : `หักกลบในรอบจ่าย ${parts.join(' · ')}`
}

export function buildAdvanceReturnDoc(source: AdvanceReturnDocSource, letterhead: DocLetterhead): ReceiptStyleDoc {
  const advance = source.advance
  const approved = advanceAmountSatang(advance)
  const usedSub =
    advance.substituteReceiptNumber === null
      ? 'ตามใบเสร็จที่เคลียร์ยอด'
      : `ตามใบเสร็จ + ใบรับรองแทนใบเสร็จ ${advance.substituteReceiptNumber}`

  const rows: ReceiptStyleDoc['rows'] = [
    { cells: ['1', `ยอดเงินทดรองที่เบิก ${advance.advanceNumber}`, docMoney(approved)] },
    { cells: ['2', 'หัก ใช้จ่ายจริงตามหลักฐาน', docDeduct(advance.usedSatang)], sub: usedSub, deduct: true },
  ]
  const summary: ReceiptStyleDoc['summary'] = [
    { label: 'ยอดที่ต้องคืนทั้งสิ้น', value: docMoney(advance.returnSatang), tone: 'sub' },
  ]
  if (source.collectedBeforeSatang > 0) {
    summary.push({ label: 'หัก รับคืนแล้วก่อนหน้า', value: docDeduct(source.collectedBeforeSatang), tone: 'deduct' })
  }
  summary.push({ label: 'ยอดรับคืนครั้งนี้ :', value: docMoney(source.amountSatang), tone: 'total' })

  return {
    title: 'ใบรับคืนเงินทดรอง',
    titleEn: 'Cash Advance Return Receipt',
    copyLabel: ORIGINAL_COPY_LABEL,
    dateText: fmtDate(source.returnDate),
    number: source.returnNumber,
    meta: [
      { label: 'อ้างอิงใบเบิก', value: `${advance.advanceNumber} ลงวันที่ ${fmtDate(advance.approvedAt ?? advance.createdAt)}` },
      { label: 'วันที่เคลียร์ยอด', value: fmtDate(advance.clearedAt) },
      { label: 'ช่องทาง', value: ADVANCE_RETURN_CHANNEL_LABEL[source.channel] },
    ],
    parties: [payeeDocParty('ชำระโดย', advance.payee), organizationDocParty('ชำระให้', letterhead)],
    columns: ADVANCE_DOC_COLUMNS,
    rows,
    infoLine: null,
    choices: {
      label: 'ช่องทางการชำระเงิน',
      options: [
        { label: 'เงินสด', checked: source.channel === 'cash' },
        { label: 'โอนเข้าบัญชีบริษัท', checked: source.channel === 'bank_transfer' },
        { label: offsetChoiceLabel(source), checked: source.channel === 'payout_offset' },
      ],
    },
    summary,
    wordsText: docWords(source.amountSatang),
    certification: null,
    note: ADVANCE_RETURN_NOTE,
    signatures: [
      { role: 'ผู้รับเงิน (การเงิน)', name: null },
      { role: 'ผู้คืนเงิน', name: payeeDisplayName(advance.payee) },
    ],
    cancelled:
      source.reversedAt === null
        ? null
        : {
            title: 'ยกเลิก',
            detail: `กลับรายการเมื่อ ${fmtDate(source.reversedAt)}${
              source.reversalReason === null || source.reversalReason.trim() === '' ? '' : ` · ${source.reversalReason.trim()}`
            } — ยอดนี้กลับเป็นยอดค้างคืน`,
          },
    footerLeft: `${letterhead.nameTh} · ${source.returnNumber}`,
  }
}
