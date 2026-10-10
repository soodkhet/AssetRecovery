'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { AdvanceFormModal } from '@/components/finance/advance-form-modal'
import { AdvanceRequestPdfLink, AdvanceReturnHistory } from '@/components/finance/advance-doc-links'
import { SubstituteReceiptPanel } from '@/components/substitute-receipts/substitute-receipt-panel'
import { SettleAdvanceButton } from '@/components/finance/settle-advance-button'
import { SettleAdvanceModal } from '@/components/finance/settle-advance-modal'
import { useAdvances } from '@/components/finance/use-advances'
import { IconPlus } from '@/components/field/field-icons'
import { Button, EmptyState, ErrorState, InlineAlert, LoadingState, StatusBadge } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { REQUEST_ADVANCE } from '@/lib/advances/advance'
import {
  advanceCardAmounts,
  advanceStatusBadgeGroup,
  advanceStatusLabel,
  canSettleAdvance,
  countAwaitingSettlement,
} from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * หน้า "เงินทดรองจ่าย" ของพนักงานภาคสนาม (UAT BUG-046 · `15` §5/§8/§12 · `25` §7.2 "ขอเงินทดรองจ่าย /
 * เคลียร์ยอด — Field Agent (เจ้าของ)")
 *
 * mockup ของไฟล์ 41 ไม่มีหน้านี้ (จุดเบี่ยง — ดูรายงาน fixer R4) ⇒ วางในหมวด "การเงิน" ของเมนู Field Tracker
 * ใช้ของเดิมทั้งหมด: ฟอร์ม `<AdvanceFormModal>` / `<SettleAdvanceModal>` / โหลดผ่าน `useAdvances()`
 * (API คืนเฉพาะรายการของตัวเองให้ผู้ไม่ถือ `approve_advance` — scope บังคับที่ชั้นข้อมูล)
 *
 * mobile + desktop ใช้ component เดียวกัน (`41` §11) — ต่างกันแค่ความกว้างผ่าน breakpoint
 * ⚠️ ปุ่มมาจาก `advance-ui.ts` (state machine เดียวกับ API) — ห้าม if สถานะเองใน JSX
 */
export function AdvancesTab() {
  const { can } = usePermission()
  const canRequest = can('manage', REQUEST_ADVANCE)
  const { items, loading, error, reload } = useAdvances('all')

  const [formOpen, setFormOpen] = useState(false)
  const [settleTarget, setSettleTarget] = useState<AdvanceDto | null>(null)

  const awaiting = countAwaitingSettlement(items)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">ขอเบิกเงินล่วงหน้าไปสำรองจ่าย แล้วเคลียร์ยอดด้วยใบเสร็จจริงภายหลัง</p>
        {canRequest && (
          <Button onClick={() => setFormOpen(true)}>
            <IconPlus className="h-4 w-4" /> ขอเงินทดรอง
          </Button>
        )}
      </div>

      {awaiting > 0 && (
        <div className="mb-4">
          <InlineAlert tone="warning">
            คุณมีเงินทดรองที่ยังไม่เคลียร์ยอด — ต้องเคลียร์ยอดรายการเดิมให้เสร็จก่อน จึงขอเบิกรอบใหม่ได้
          </InlineAlert>
        </div>
      )}

      {loading ? (
        <LoadingState message="กำลังโหลดเงินทดรอง..." />
      ) : error !== null ? (
        <ErrorState title={error.title} message={error.message} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <EmptyState title="ยังไม่มีคำขอเงินทดรอง" description="กด “ขอเงินทดรอง” เพื่อส่งคำขอให้การเงินอนุมัติ" />
      ) : (
        <ul className="space-y-3 lg:max-w-[720px]">
          {items.map((advance) => (
            <li
              key={advance.id}
              className={cn(
                'rounded-xl border bg-white p-4 shadow-sm',
                advance.status === 'overdue' ? 'border-red-300 bg-red-50/40' : 'border-slate-200',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* staging E-053 — ตัวเลขหลัก = ยอดที่อนุมัติ (เงินที่ได้รับจริง) */}
                  <p className="text-lg font-extrabold text-slate-900">
                    {fmtSatangSymbol(advanceCardAmounts(advance).headlineSatang)}
                  </p>
                  {advanceCardAmounts(advance).requestedNoteSatang !== null && (
                    <p className="text-[11px] text-slate-500">
                      ขอ {fmtSatangSymbol(advanceCardAmounts(advance).requestedNoteSatang ?? 0)}
                    </p>
                  )}
                  <p className="text-[13px] text-slate-600">{advance.purpose}</p>
                </div>
                <StatusBadge
                  status={advance.status}
                  group={advanceStatusBadgeGroup(advance.status)}
                  label={advanceStatusLabel(advance.status)}
                />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-slate-500">ขอเมื่อ</dt>
                <dd className="text-right text-slate-700">{fmtDateTime(advance.createdAt)}</dd>
                <dt className="text-slate-500">กำหนดเคลียร์ยอด</dt>
                <dd className={cn('text-right', advance.isPastDue ? 'font-semibold text-red-600' : 'text-slate-700')}>
                  {fmtDate(advance.dueClearDate)}
                </dd>
                {advance.approvedAt !== null && (
                  <>
                    <dt className="text-slate-500">อนุมัติ</dt>
                    <dd className="text-right text-slate-700">
                      {fmtSatangSymbol(advance.approvedSatang)} · {fmtDateTime(advance.approvedAt)}
                    </dd>
                  </>
                )}
                {advance.clearedAt !== null && (
                  <>
                    <dt className="text-slate-500">ใช้จริง / ยอดคืน</dt>
                    <dd className="text-right text-slate-700">
                      {fmtSatangSymbol(advance.usedSatang)} / {fmtSatangSymbol(advance.returnSatang)}
                    </dd>
                    <dt className="text-slate-500">เคลียร์ยอด</dt>
                    <dd className="text-right text-slate-700">{fmtDateTime(advance.clearedAt)}</dd>
                  </>
                )}
              </dl>

              {/* มติ PO U100/U103 — ใบเบิก/ใบรับคืน PDF + ใบรับรองแทนใบเสร็จ (เจ้าของอัปโหลดฉบับเซ็น) */}
              <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
                <AdvanceRequestPdfLink advance={advance} />
              </div>
              <AdvanceReturnHistory advance={advance} />
              {advance.substituteReceipt !== null && (
                <SubstituteReceiptPanel
                  receipt={advance.substituteReceipt}
                  canUpload={canRequest}
                  onSigned={() => void reload()}
                />
              )}

              {advance.rejectionReason !== null && (
                <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  เหตุผลที่ไม่อนุมัติ: {advance.rejectionReason}
                </p>
              )}

              {canRequest && canSettleAdvance(advance.status) && (
                <div className="mt-3 flex justify-end">
                  <SettleAdvanceButton advance={advance} onSettle={setSettleTarget} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AdvanceFormModal open={formOpen} onClose={() => setFormOpen(false)} onCreated={() => void reload()} />
      <SettleAdvanceModal advance={settleTarget} onClose={() => setSettleTarget(null)} onSettled={() => void reload()} />
    </>
  )
}
