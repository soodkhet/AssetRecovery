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

// จอสัมผัสขยายพื้นที่แตะเป็นสูง 44px (เดิม 14–17px — preship PS-029)
const LINK_CLASS =
  'focus-ring inline-flex items-center text-[11px] font-semibold text-emerald-700 underline pointer-coarse:min-h-11 pointer-coarse:px-1'

/** ใบเบิกเงินทดรอง PDF — พิมพ์ได้หลังอนุมัติแล้ว */
export function AdvanceRequestPdfLink({ advance }: { advance: Pick<AdvanceDto, 'id' | 'status'> }) {
  if (!canPrintAdvanceRequest(advance.status)) return null
  return (
    <a href={`/api/advances/${advance.id}/pdf`} target="_blank" rel="noreferrer" className={LINK_CLASS}>
      ใบเบิก PDF
    </a>
  )
}

/**
 * ประวัติการคืนยอด + ลิงก์ใบรับคืน (RAV) ต่อแถว — แถวที่กลับรายการแล้วยังพิมพ์ได้ (ป้าย "ยกเลิก")
 * `collapsed` (ตารางการเงิน): แสดงรายการล่าสุด + พับที่เหลือ — เดิมแสดงครบทุกรายการในคอลัมน์แคบ แถวสูง 335px (preship R8-001)
 */
export function AdvanceReturnHistory({
  advance,
  collapsed = false,
}: {
  advance: Pick<AdvanceDto, 'id' | 'returns'>
  collapsed?: boolean
}) {
  if (advance.returns.length === 0) return null
  if (!collapsed || advance.returns.length === 1) {
    return (
      <ul className="mt-1 space-y-0.5 text-right">
        {advance.returns.map((entry) => (
          <ReturnEntry key={entry.id} advanceId={advance.id} entry={entry} />
        ))}
      </ul>
    )
  }
  // API เรียงใหม่ → เก่า (`createdAt desc`)
  const latest = advance.returns[0]
  const earlier = advance.returns.slice(1)
  return (
    <div className="mt-1 text-right">
      {latest !== undefined && (
        <ul className="space-y-0.5">
          <ReturnEntry advanceId={advance.id} entry={latest} />
        </ul>
      )}
      <details className="mt-0.5">
        {/* แบบเดียวกับ <details> อื่นในระบบ (import-template-help) · ตัวเลขในวงเล็บไม่ตัดบรรทัด (R9-004) */}
        <summary className="focus-ring cursor-pointer text-[11px] font-semibold text-slate-700 pointer-coarse:min-h-11">
          ดูการคืนก่อนหน้า <span className="whitespace-nowrap">({earlier.length} รายการ)</span>
        </summary>
        <ul className="mt-0.5 space-y-0.5">
          {earlier.map((entry) => (
            <ReturnEntry key={entry.id} advanceId={advance.id} entry={entry} />
          ))}
        </ul>
      </details>
    </div>
  )
}

function ReturnEntry({ advanceId, entry }: { advanceId: string; entry: AdvanceDto['returns'][number] }) {
  // 2 บรรทัดคงที่: เลขที่ + ยอด (ไม่ตัด) / ช่องทาง · รอบจ่ายหรือวันที่ + ลิงก์ — เดิมต่อกันยาวบรรทัดเดียว คอลัมน์แคบ
  // ตัด 4–5 บรรทัดแบบสุ่มตำแหน่ง (preship R9-004)
  return (
    <li className="text-[10px] font-normal text-slate-500">
      <div className={entry.reversedAt === null ? 'whitespace-nowrap' : 'whitespace-nowrap line-through'}>
        <span className="font-mono">{entry.returnNumber}</span> · {fmtSatangSymbol(entry.amountSatang)}
        {entry.reversedAt !== null && <span className="ml-1 font-semibold text-red-600 no-underline">ยกเลิก</span>}
      </div>
      <div>
        {ADVANCE_RETURN_CHANNEL_LABEL[entry.channel]}
        {entry.payoutBatchName !== null
          ? ` · ${entry.payoutBatchName}`
          : entry.receivedDate !== null
            ? ` · ${fmtDate(entry.receivedDate)}`
            : ''}{' '}
        <a
          href={`/api/advances/${advanceId}/returns/${entry.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className={LINK_CLASS}
        >
          ใบรับคืน PDF
        </a>
      </div>
    </li>
  )
}
