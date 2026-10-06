import {
  docMoney,
  docWords,
  ORIGINAL_COPY_LABEL,
  organizationDocParty,
  payeeDisplayName,
  payeeDocParty,
  type DocPayeeSource,
  type ReceiptStyleDoc,
} from '@/lib/documents/receipt-style-doc'
import { fmtDate } from '@/lib/format/datetime'
import type { DocLetterhead } from '@/lib/organization/profile'
import { substituteReceiptCertification, substituteReceiptTotalSatang } from '@/lib/substitute-receipts/substitute-receipt'

/**
 * ใบรับรองแทนใบเสร็จรับเงิน (แบบ บก.111 · มติ PO U103 · mockup `reference/documents.html` ข้อ 8 · `28` §6.1)
 * — **pure ล้วน**: แหล่งข้อมูล → โครงเอกสารที่ประกอบเสร็จ · ต้นฉบับเดียว (U101) · ผู้เซ็น: ผู้เบิกจ่าย / ผู้อนุมัติ
 * ยอดรวมคำนวณจากบรรทัดด้วยสูตรเดียวกับตอนออกใบ (`22` §6.17) แล้วต้องตรงกับยอดที่ snapshot ไว้
 */

export interface SubstituteReceiptDocLine {
  lineDate: Date
  description: string
  amountSatang: number
  note: string | null
}

export interface SubstituteReceiptDocSource {
  receiptNumber: string
  issueDate: Date
  totalSatang: number
  lines: readonly SubstituteReceiptDocLine[]
  payee: DocPayeeSource
  teamName: string | null
  /** อ้างอิง: เลขเงินทดรอง (เคลียร์ยอด) หรือคำอธิบายใบเบิก */
  reference: { label: string; value: string }
}

export function buildSubstituteReceiptDoc(
  source: SubstituteReceiptDocSource,
  letterhead: DocLetterhead,
): ReceiptStyleDoc {
  const total = substituteReceiptTotalSatang(source.lines)
  if (total !== source.totalSatang) {
    // ยอด snapshot ต้องตรงกับผลรวมบรรทัดเสมอ (DB ห้ามแก้ทั้งสองฝั่ง) — ไม่ตรง = ข้อมูลเสีย ห้ามพิมพ์เอกสารเงินผิด
    throw new RangeError(`ยอดรวม ${source.receiptNumber} ไม่ตรงกับผลรวมรายการ (${source.totalSatang} ≠ ${total})`)
  }
  const payeeName = payeeDisplayName(source.payee)

  return {
    title: 'ใบรับรองแทนใบเสร็จรับเงิน',
    titleEn: 'Substitute Receipt Certificate',
    copyLabel: ORIGINAL_COPY_LABEL,
    dateText: fmtDate(source.issueDate),
    number: source.receiptNumber,
    meta: [source.reference, { label: 'ทีม', value: source.teamName ?? '-' }],
    parties: [payeeDocParty('ผู้จ่ายเงิน (ในนามบริษัท)', source.payee), organizationDocParty('บริษัท', letterhead)],
    columns: [
      { header: 'วัน เดือน ปี', width: '15%', align: 'center' },
      { header: 'รายละเอียดรายจ่าย', width: '44%', align: 'left' },
      { header: 'จำนวนเงิน (บาท)', width: '17%', align: 'right' },
      { header: 'หมายเหตุ', width: '24%', align: 'left' },
    ],
    rows: source.lines.map((line) => ({
      cells: [fmtDate(line.lineDate), line.description, docMoney(line.amountSatang), line.note ?? ''],
    })),
    infoLine: null,
    choices: null,
    summary: [{ label: 'รวมเงินทั้งสิ้น :', value: docMoney(total), tone: 'total' }],
    wordsText: docWords(total),
    certification: substituteReceiptCertification(payeeName),
    note: null,
    signatures: [
      { role: 'ผู้เบิกจ่าย', name: payeeName },
      { role: 'ผู้อนุมัติ', name: null },
    ],
    cancelled: null,
    footerLeft: `${letterhead.nameTh} · ${source.receiptNumber}`,
  }
}
