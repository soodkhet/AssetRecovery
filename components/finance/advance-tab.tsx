'use client'

import { useState } from 'react'
import { useUrlFilter } from '@/components/ui/use-url-filter'
import { FINANCE_FILTER_PARAMS } from '@/lib/finance/operation-tabs'
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
import { ADVANCE_RETURN_METHOD_LABEL, advanceCreateAccess, APPROVE_ADVANCE } from '@/lib/advances/advance'
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
  // มติ PO U160 — การเงินขอแทนผู้อื่นได้ (ไม่ถือ `manage:request_advance`) ⇒ ปุ่มขอเบิกแสดงเมื่อทำได้อย่างใดอย่างหนึ่ง
  const advanceAccess = advanceCreateAccess((capability) => can('manage', capability))
  const canRequestAdvance = advanceAccess.self || advanceAccess.onBehalf
  const canApproveAdvance = can('manage', APPROVE_ADVANCE)

  // ตัวกรองอยู่ใน URL — refresh/Back กลับมายังกรองเหมือนเดิม (preship R6-008)
  const [filter, setFilter] = useUrlFilter<AdvanceStatusFilter>(FINANCE_FILTER_PARAMS.advanceStatus, ADVANCE_STATUS_FILTERS, 'all')
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
  // ระหว่างโหลดก็ยังไม่มีตัวเลขจริง ⇒ "—" เช่นกัน (preship R2-007)
  const unavailable = loading || failed

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="ยอดเงินทดรองที่ยังอยู่กับผู้เบิก"
          value={unavailable ? '—' : fmtSatangSymbol(outstandingAdvanceSatang(items))}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'นับจากยอดที่อนุมัติของรายการที่ยังไม่เคลียร์'}
        />
        <StatCard
          label="รายการที่รอเคลียร์ยอด"
          value={unavailable ? '—' : fmtCount(awaiting)}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'รวมที่เลยกำหนดแล้ว'}
        />
        <StatCard
          label="เลยกำหนดเคลียร์ (Overdue)"
          value={unavailable ? '—' : fmtCount(overdue)}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'ระบบเปลี่ยนสถานะให้อัตโนมัติทุกวัน'}
          className={!unavailable && overdue > 0 ? 'border-red-300 bg-red-50' : undefined}
        />
        <StatCard
          label="ยอดคืนเงินทดรองค้าง"
          value={unavailable ? '—' : fmtSatangSymbol(totalReturnOutstandingSatang(items))}
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
          {/* 9 คอลัมน์ + ป้ายสถานะยาว ("อนุมัติแล้ว — รอเคลียร์ยอด") — ระยะในช่องแคบลงให้พอดีจอ 1280 โดยไม่บีบชื่อ (R7-002) */}
          <Table className="[&_td]:px-3 [&_th]:px-3">
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
              onRetry={() => void reload()}
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
                    {/* กว้างขั้นต่ำ — เดิมถูกบีบเหลือ 81px ชื่อไทยแตก 3 บรรทัด (preship R7-002) */}
                    <Td className="min-w-[7.5rem]">
                      {/* ตัดบรรทัดที่ช่องว่างเท่านั้น — ชื่อไทยไม่แตกกลางคำ (R8-001) */}
                      <p className="font-semibold [word-break:keep-all] text-slate-900">{advance.payeeName}</p>
                      {advance.teamName !== null && <p className="text-[10px] text-slate-500">{advance.teamName}</p>}
                    </Td>
                    <Td className="max-w-[160px] text-xs text-slate-600">
                      {advance.purpose}
                      {/* มติ PO U103 — ใบรับรองแทนใบเสร็จตอนเคลียร์ยอด (การเงินอัปโหลดฉบับเซ็นแทนได้) */}
                      {advance.substituteReceipt !== null && (
                        <SubstituteReceiptPanel
                          receipt={advance.substituteReceipt}
                          compact
                          canUpload={canApproveAdvance}
                          canCancel={canApproveAdvance}
                          onSigned={() => void reload()}
                          onChanged={() => void reload()}
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
                        // ประวัติการคืนตัดบรรทัดได้ — เดิมยาวบรรทัดเดียวจนคอลัมน์กว้าง ~400px ตารางล้นที่ 1440px (preship PS-016)
                        // font-sans: ช่องตัวเลขเป็น font-mono ทั้งช่อง ข้อความไทยในประวัติจึงกว้าง/อ่านยาก (R7-002)
                        <div className="mt-1 ml-auto max-w-[200px] space-y-0.5 text-right font-sans whitespace-normal">
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
                          <AdvanceReturnHistory advance={advance} collapsed />
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
