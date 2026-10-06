'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { AdvanceFormModal } from '@/components/finance/advance-form-modal'
import { AdvanceRequestPdfLink, AdvanceReturnHistory } from '@/components/finance/advance-doc-links'
import { SubstituteReceiptPanel } from '@/components/substitute-receipts/substitute-receipt-panel'
import { AdvanceReviewModal } from '@/components/finance/advance-review-modal'
import { ChangeReturnMethodModal, RecordSeparateReturnModal } from '@/components/finance/advance-return-modals'
import { SettleAdvanceButton } from '@/components/finance/settle-advance-button'
import { SettleAdvanceModal } from '@/components/finance/settle-advance-modal'
import { useAdvances } from '@/components/finance/use-advances'
import {
  Button,
  Card,
  FilterGroup,
  InlineAlert,
  RefText,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { ADVANCE_RETURN_METHOD_LABEL, APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/advance'
import {
  ADVANCE_RETURN_STATE_LABEL,
  ADVANCE_STATUS_FILTERS,
  advanceReturnStateBadgeGroup,
  canChangeAdvanceReturnMethod,
  canRecordAdvanceSeparateReturn,
  totalReturnOutstandingSatang,
  advanceStatusBadgeGroup,
  advanceStatusLabel,
  canReviewAdvance,
  countAwaitingSettlement,
  countOverdue,
  outstandingAdvanceSatang,
  type AdvanceStatusFilter,
} from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "เงินทดรองจ่าย" เต็มรูป (`15` §8 · mockup `finance.html` แท็บ `advances`)
 * — ตาราง **9 คอลัมน์** ตาม mockup + แถบเตือนยอดค้างเคลียร์เหนือตาราง
 *
 * ต่างจากตารางที่ 2 ของแท็บ "รออนุมัติ" ตรงที่หน้านี้เป็นมุมมองเต็มของไฟล์ 15: มีตัวกรองสถานะ
 * ยอดคืน/ใช้จริงแยกคอลัมน์ และยอดเงินบริษัทที่ยังอยู่ในมือผู้เบิก
 *
 * ⚠️ ปุ่มทุกตัวมาจาก `advance-ui.ts` (state machine เดียวกับ API) — **ห้าม if สถานะเองใน JSX**
 * ⚠️ โหลดข้อมูลผ่าน `useAdvances()` เท่านั้น · ยอดทุกช่องมาจาก server หน้าจอแค่ format (Rule 01)
 */
export function AdvanceTab() {
  const { can } = usePermission()
  const canRequestAdvance = can('manage', REQUEST_ADVANCE)
  const canApproveAdvance = can('manage', APPROVE_ADVANCE)

  const [filter, setFilter] = useState<AdvanceStatusFilter>('all')
  const { items, loading, error, reload } = useAdvances(filter)

  const [formOpen, setFormOpen] = useState(false)
  const [settleTarget, setSettleTarget] = useState<AdvanceDto | null>(null)
  const [reviewTarget, setReviewTarget] = useState<AdvanceDto | null>(null)
  const [reviewMode, setReviewMode] = useState<'approve' | 'reject'>('approve')
  const [methodTarget, setMethodTarget] = useState<AdvanceDto | null>(null)
  const [returnTarget, setReturnTarget] = useState<AdvanceDto | null>(null)

  const awaiting = countAwaitingSettlement(items)
  const overdue = countOverdue(items)
  // โหลดไม่สำเร็จ ⇒ "—" ไม่ใช่ "0" ที่ดูเหมือนไม่มีข้อมูล (UAT R6-F)
  const failed = error !== null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="ยอดเงินทดรองที่ยังอยู่กับผู้เบิก"
          value={failed ? '—' : fmtSatangSymbol(outstandingAdvanceSatang(items))}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'นับจากยอดที่อนุมัติของรายการที่ยังไม่เคลียร์'}
        />
        <StatCard
          label="รายการที่รอเคลียร์ยอด"
          value={failed ? '—' : fmtCount(awaiting)}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'รวมที่เลยกำหนดแล้ว'}
        />
        <StatCard
          label="เลยกำหนดเคลียร์ (Overdue)"
          value={failed ? '—' : fmtCount(overdue)}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'ระบบเปลี่ยนสถานะให้อัตโนมัติทุกวัน'}
          className={overdue > 0 ? 'border-red-300 bg-red-50' : undefined}
        />
        <StatCard
          label="ยอดคืนเงินทดรองค้าง"
          value={failed ? '—' : fmtSatangSymbol(totalReturnOutstandingSatang(items))}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'เคลียร์แล้วแต่ยังไม่ได้รับคืน/ยังไม่ถูกหักในรอบจ่าย'}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">เงินทดรองจ่าย (Advances)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              กฎ: ต้องเคลียร์ยอดเดิมให้เสร็จก่อน จึงขอเบิกรอบใหม่ได้
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup options={ADVANCE_STATUS_FILTERS} value={filter} onChange={setFilter} />
            {canRequestAdvance && (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                + ขอเงินทดรอง
              </Button>
            )}
          </div>
        </div>

        {awaiting > 0 && (
          <div className="mb-4">
            <InlineAlert tone="warning">
              มี {fmtCount(awaiting)} รายการที่ยังไม่เคลียร์ยอด (รวม {fmtSatangSymbol(outstandingAdvanceSatang(items))})
              — ผู้ที่มียอดค้างจะขอเบิกรอบใหม่ไม่ได้จนกว่าจะเคลียร์
            </InlineAlert>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>เลขที่</Th>
                <Th>ผู้ขอ / ทีม</Th>
                <Th>วัตถุประสงค์</Th>
                <Th numeric>ขอเบิก</Th>
                <Th numeric>อนุมัติ / ใช้จริง</Th>
                <Th numeric>ยอดคืน</Th>
                <Th>กำหนดเคลียร์</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              emptyTitle="ไม่มีรายการตามตัวกรองนี้"
              colSpan={9}
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((advance) => (
                  <Tr key={advance.id} className={advance.status === 'overdue' ? 'bg-red-50/40' : undefined}>
                    <Td>
                      <RefText>{advance.ref}</RefText>
                      <p className="text-[10px] text-slate-400">ขอเมื่อ {fmtDate(advance.createdAt)}</p>
                      <AdvanceRequestPdfLink advance={advance} />
                    </Td>
                    <Td>
                      <p className="font-semibold text-slate-900">{advance.payeeName}</p>
                      {advance.teamName !== null && <p className="text-[10px] text-slate-500">{advance.teamName}</p>}
                    </Td>
                    <Td className="max-w-[220px] text-xs text-slate-600">
                      {advance.purpose}
                      {/* มติ PO U103 — ใบรับรองแทนใบเสร็จตอนเคลียร์ยอด (การเงินอัปโหลดฉบับเซ็นแทนได้) */}
                      {advance.substituteReceipt !== null && (
                        <SubstituteReceiptPanel
                          receipt={advance.substituteReceipt}
                          compact
                          canUpload={canApproveAdvance}
                          onSigned={() => void reload()}
                        />
                      )}
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(advance.requestedSatang)}
                    </Td>
                    <Td numeric>
                      <p>{fmtSatangSymbol(advance.approvedSatang)}</p>
                      <p className="text-[11px] text-slate-500">ใช้จริง {fmtSatangSymbol(advance.usedSatang)}</p>
                    </Td>
                    <Td
                      numeric
                      className={advance.returnSatang > 0 ? 'font-semibold text-emerald-700' : undefined}
                    >
                      {fmtSatangSymbol(advance.returnSatang)}
                      {advance.returnState !== 'none' && (
                        <div className="mt-1 space-y-0.5 text-right">
                          <StatusBadge
                            status={advance.returnState}
                            group={advanceReturnStateBadgeGroup(advance.returnState)}
                            label={ADVANCE_RETURN_STATE_LABEL[advance.returnState]}
                          />
                          {advance.returnOutstandingSatang > 0 && (
                            <p className="text-[11px] font-semibold text-amber-700">
                              ค้าง {fmtSatangSymbol(advance.returnOutstandingSatang)}
                            </p>
                          )}
                          {advance.returnMethod !== null && (
                            <p className="text-[10px] font-normal text-slate-500">
                              {ADVANCE_RETURN_METHOD_LABEL[advance.returnMethod]}
                            </p>
                          )}
                          {/* มติ PO U100 — ประวัติการคืน + ใบรับคืนเงินทดรอง (RAV) ต่อแถว */}
                          <AdvanceReturnHistory advance={advance} />
                        </div>
                      )}
                      {advance.excessSatang > 0 && (
                        <p className="text-[11px] font-semibold text-orange-700">
                          ใช้เกิน {fmtSatangSymbol(advance.excessSatang)}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <span
                        className={cn('text-xs', advance.isPastDue ? 'font-semibold text-red-600' : 'text-slate-500')}
                      >
                        {fmtDate(advance.dueClearDate)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge
                        status={advance.status}
                        group={advanceStatusBadgeGroup(advance.status)}
                        label={advanceStatusLabel(advance.status)}
                      />
                      {/* Rule 05 — action สำคัญต้องเห็นวันเวลาบน list ไม่ใช่ต้องไปขุดใน audit */}
                      {advance.clearedAt !== null ? (
                        <p className="mt-1 text-[10px] text-slate-400">เคลียร์ยอด {fmtDateTime(advance.clearedAt)}</p>
                      ) : (
                        advance.approvedAt !== null && (
                          <p className="mt-1 text-[10px] text-slate-400">อนุมัติ {fmtDateTime(advance.approvedAt)}</p>
                        )
                      )}
                      {advance.rejectionReason !== null && (
                        <p className="mt-1 max-w-[180px] text-[10px] text-orange-700">
                          เหตุผล: {advance.rejectionReason}
                        </p>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end gap-1">
                        {canApproveAdvance && canReviewAdvance(advance.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setReviewMode('approve')
                                setReviewTarget(advance)
                              }}
                            >
                              อนุมัติ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReviewMode('reject')
                                setReviewTarget(advance)
                              }}
                            >
                              ปฏิเสธ
                            </Button>
                          </>
                        )}
                        <SettleAdvanceButton advance={advance} onSettle={setSettleTarget} />
                        {canApproveAdvance && canRecordAdvanceSeparateReturn(advance) && (
                          <Button size="sm" variant="secondary" onClick={() => setReturnTarget(advance)}>
                            บันทึกรับคืน
                          </Button>
                        )}
                        {canApproveAdvance && canChangeAdvanceReturnMethod(advance) && (
                          <Button size="sm" variant="ghost" onClick={() => setMethodTarget(advance)}>
                            เปลี่ยนวิธีคืน
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </Card>

      <AdvanceFormModal open={formOpen} onClose={() => setFormOpen(false)} onCreated={() => void reload()} />

      <AdvanceReviewModal
        advance={reviewTarget}
        mode={reviewMode}
        onClose={() => setReviewTarget(null)}
        onDone={() => void reload()}
      />

      <ChangeReturnMethodModal
        advance={methodTarget}
        onClose={() => setMethodTarget(null)}
        onDone={() => void reload()}
      />

      <RecordSeparateReturnModal
        advance={returnTarget}
        onClose={() => setReturnTarget(null)}
        onDone={() => void reload()}
      />

      <SettleAdvanceModal
        advance={settleTarget}
        onClose={() => setSettleTarget(null)}
        onSettled={() => void reload()}
      />
    </div>
  )
}
