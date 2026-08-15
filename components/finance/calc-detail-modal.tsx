'use client'

import { Badge, InlineAlert, Modal, StatusBadge } from '@/components/ui'
import { approvalHistoryLabel, approvalStepText } from '@/lib/compensation/approval-ui'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import { EXPENSE_TYPE_LABEL, EXPENSE_STATUS_LABEL, expenseStatusBadgeGroup } from '@/lib/field/expense-ui'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtPercent, fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "ดูสูตร" (`16` §8 · mockup `finance.html` `comp-calc-detail`)
 *
 * แสดง **ยอดที่ระบบคิดไว้แล้ว** เท่านั้น — Gross มาจาก snapshot ของรายการ · WHT/Net มาจาก
 * `calculateWhtForPayee()` ฝั่ง server (Payee ชนะ Plan — `18` §6.3) **หน้าจอไม่คำนวณเงินเอง**
 * (Rule 01) · ยอดที่ผูกพันการจ่ายจริงถูก snapshot ตอนสร้างรอบจ่าย (Phase 3.4)
 */
export function CalcDetailModal({
  item,
  onClose,
}: {
  item: CompensationApprovalDto | null
  onClose: () => void
}) {
  if (item === null) return null

  return (
    <Modal open onClose={onClose} size="lg" title="รายละเอียดสูตรคำนวณค่าตอบแทน">
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          เคส: <span className="font-mono font-semibold">{item.caseRef ?? 'ไม่ผูกเคส'}</span> · ผู้รับเงิน:{' '}
          <span className="font-semibold">{item.payeeName}</span> · ประเภท:{' '}
          <span className="font-semibold">{EXPENSE_TYPE_LABEL[item.expenseType]}</span>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Amount label="Gross" value={fmtSatangSymbol(item.grossSatang)} />
            <Amount
              label="WHT"
              value={fmtSatangSymbol(item.whtSatang)}
              hint={`${fmtPercent(item.whtPctUsed)} · ${item.whtRateSource === 'payee' ? 'จาก Tax Profile ของผู้รับเงิน' : 'ตกไปใช้อัตราของแผน'}`}
            />
            <Amount label="Net จ่ายจริง" value={fmtSatangSymbol(item.netSatang)} tone="emerald" />
          </div>

          {item.whtWarning !== null && <InlineAlert tone="warning">{item.whtWarning}</InlineAlert>}
          {!item.payeeVerified && (
            <InlineAlert tone="warning">
              ผู้รับเงินรายนี้ยังไม่ถูกยืนยัน — รวมเข้ารอบจ่ายไม่ได้จนกว่าการเงินจะยืนยันข้อมูลธนาคาร/ภาษี (`18` §6.2)
            </InlineAlert>
          )}

          <div>
            <p className="text-xs font-bold tracking-wider text-slate-500 uppercase">สูตร / ฐานคิด (ไฟล์ 11/22)</p>
            <pre className="mt-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-slate-700">
              {item.basisText}
              {item.distanceKm === null ? '' : `\nระยะทางที่บันทึกไว้: ${item.distanceKm} กม.`}
              {`\nวันที่เกิดรายการ: ${item.expenseDate}`}
            </pre>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold tracking-wider text-slate-500 uppercase">ประวัติอนุมัติ (Multi-step)</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge
                status={item.status}
                group={expenseStatusBadgeGroup(item.status)}
                label={EXPENSE_STATUS_LABEL[item.status]}
              />
              <Badge>{approvalStepText(item)}</Badge>
            </div>

            <ul className="mt-3 space-y-2">
              {item.approvalHistory.length === 0 && (
                <li className="text-xs text-slate-400">ยังไม่มีการอนุมัติในรอบนี้</li>
              )}
              {item.approvalHistory.map((entry, index) => (
                <li
                  key={`${entry.step}-${entry.timestamp}-${index}`}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                >
                  <p className="font-semibold">{approvalHistoryLabel(entry, item.approvalStepTotal)}</p>
                  <p className="text-[11px] text-slate-500">{fmtDateTime(entry.timestamp)}</p>
                  {entry.reason !== null && <p className="mt-1 text-[11px] text-slate-600">เหตุผล: {entry.reason}</p>}
                </li>
              ))}
            </ul>

            {item.rejectReason !== null && (
              <InlineAlert tone="warning" className="mt-3">
                เหตุผลที่ตีกลับล่าสุด: {item.rejectReason}
              </InlineAlert>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Amount({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'emerald' }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{label}</p>
      <p className={`font-mono text-lg font-bold ${tone === 'emerald' ? 'text-emerald-700' : 'text-slate-800'}`}>
        {value}
      </p>
      {hint !== undefined && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}
