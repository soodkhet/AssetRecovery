'use client'

import { ADVANCE_RETURN_CHANNEL_LABEL } from '@/lib/advances/advance'
import { canPrintAdvanceRequest } from '@/lib/advances/advance-doc'
import type { AdvanceDto } from '@/lib/advances/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * ลิงก์ดาวน์โหลดเอกสารเงินทดรอง (มติ PO U100) — ใช้ร่วมหน้าการเงินและหน้าเงินทดรองของพนักงาน (เจ้าของ)
 * สิทธิ์จริงตรวจที่ API (เจ้าของ/การเงิน · คนอื่น 404) — ที่นี่แค่ซ่อนลิงก์ของสถานะที่ยังพิมพ์ไม่ได้
 */

const LINK_CLASS = 'focus-ring text-[11px] font-semibold text-emerald-700 underline'

/** ใบเบิกเงินทดรอง PDF — พิมพ์ได้หลังอนุมัติแล้ว */
export function AdvanceRequestPdfLink({ advance }: { advance: Pick<AdvanceDto, 'id' | 'status'> }) {
  if (!canPrintAdvanceRequest(advance.status)) return null
  return (
    <a href={`/api/advances/${advance.id}/pdf`} target="_blank" rel="noreferrer" className={LINK_CLASS}>
      ใบเบิก PDF
    </a>
  )
}

/** ประวัติการคืนยอด + ลิงก์ใบรับคืน (RAV) ต่อแถว — แถวที่กลับรายการแล้วยังพิมพ์ได้ (ป้าย "ยกเลิก") */
export function AdvanceReturnHistory({ advance }: { advance: Pick<AdvanceDto, 'id' | 'returns'> }) {
  if (advance.returns.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-right">
      {advance.returns.map((entry) => (
        <li key={entry.id} className="text-[10px] font-normal text-slate-500">
          <span className={entry.reversedAt === null ? undefined : 'line-through'}>
            <span className="font-mono">{entry.returnNumber}</span> · {ADVANCE_RETURN_CHANNEL_LABEL[entry.channel]}{' '}
            {fmtSatangSymbol(entry.amountSatang)}
            {entry.payoutBatchName !== null
              ? ` · ${entry.payoutBatchName}`
              : entry.receivedDate !== null
                ? ` · ${fmtDate(entry.receivedDate)}`
                : ''}
          </span>
          {entry.reversedAt !== null && <span className="ml-1 font-semibold text-red-600">ยกเลิก</span>}{' '}
          <a
            href={`/api/advances/${advance.id}/returns/${entry.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={LINK_CLASS}
          >
            ใบรับคืน PDF
          </a>
        </li>
      ))}
    </ul>
  )
}
