'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { AdvanceFormModal } from '@/components/finance/advance-form-modal'
import { AdvanceReviewModal } from '@/components/finance/advance-review-modal'
import { CalcDetailModal } from '@/components/finance/calc-detail-modal'
import { ManualClaimModal } from '@/components/finance/manual-claim-modal'
import { SettleAdvanceModal } from '@/components/finance/settle-advance-modal'
import { useAdvances } from '@/components/finance/use-advances'
import { useApprovalActions } from '@/components/finance/use-approval-actions'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Badge,
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
import { APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/advance'
import {
  advanceStatusBadgeGroup,
  advanceStatusLabel,
  canReviewAdvance,
  canSettleAdvance,
  countAwaitingSettlement,
  countOverdue,
} from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'
import { CREATE_CLAIM_CAPABILITIES } from '@/lib/claims/claim'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import {
  CLAIM_STATUS_FILTERS,
  approvalStepText,
  claimSourceLabel,
  expenseRowActions,
  expenseRowHighlight,
  pendingClaimTotalSatang,
  type ClaimStatusFilter,
} from '@/lib/compensation/approval-ui'
import { EXPENSE_STATUS_LABEL, EXPENSE_TYPE_LABEL, expenseStatusBadgeGroup } from '@/lib/field/expense-ui'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "รออนุมัติ" (`15` §8 · mockup `finance.html` แท็บ `approval`) — **2 ตารางในหน้าเดียว**
 *
 * 1. รายการเบิก (Claims) — auto จากไฟล์ 41 + manual จากที่นี่ อยู่ในคิวอนุมัติชุดเดียวกัน
 * 2. เงินทดรองจ่าย (Advances) — ขอ/อนุมัติ/เคลียร์ยอด · `overdue` = **แดงเด่นชัด** (`15` §8)
 *
 * ⚠️ ปุ่มทุกตัวมาจากโมดูล pure (`approval-ui.ts` / `advance-ui.ts`) ที่อ่าน state machine เดียวกับ API
 *   — **ห้าม if สถานะเองใน JSX** · ยอดเงินทุกช่องมาจาก server ทั้งหมด หน้าจอแค่ format (Rule 01)
 */
export function ApprovalTab() {
  const { can } = usePermission()
  const canCreateClaim = CREATE_CLAIM_CAPABILITIES.some((capability) => can('manage', capability))
  const canRequestAdvance = can('manage', REQUEST_ADVANCE)
  const canApproveAdvance = can('manage', APPROVE_ADVANCE)

  const claims = useApprovalActions('/api/claims')
  const [claimFilter, setClaimFilter] = useState<ClaimStatusFilter>('all')
  const [formulaTarget, setFormulaTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectTarget, setRejectTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [claimFormOpen, setClaimFormOpen] = useState(false)

  // ตารางที่ 2 ใช้ตัวโหลดเดียวกับแท็บ "เงินทดรองจ่าย" เต็มรูป (3.4) — ห้าม fetch เอง
  const { items: advances, loading: advLoading, error: advError, reload: reloadAdvances } = useAdvances('all')
  const [advanceFormOpen, setAdvanceFormOpen] = useState(false)
  const [settleTarget, setSettleTarget] = useState<AdvanceDto | null>(null)
  const [reviewTarget, setReviewTarget] = useState<AdvanceDto | null>(null)
  const [reviewMode, setReviewMode] = useState<'approve' | 'reject'>('approve')

  const visibleClaims =
    claimFilter === 'all' ? claims.items : claims.items.filter((item) => item.status === claimFilter)
  const overdueCount = countOverdue(advances)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="เงินรออนุมัติ (Claim)"
          value={fmtSatangSymbol(pendingClaimTotalSatang(claims.items))}
          hint={`${fmtCount(claims.items.filter((item) => item.status === 'pending_approval' || item.status === 'pending_finance_approval').length)} รายการในคิว`}
        />
        <StatCard
          label="เงินทดรองที่ยังไม่เคลียร์"
          value={fmtCount(countAwaitingSettlement(advances))}
          hint="รวมที่อนุมัติแล้วและที่เลยกำหนด"
        />
        <StatCard
          label="เลยกำหนดเคลียร์ (Overdue)"
          value={fmtCount(overdueCount)}
          hint="ต้องตามเคลียร์ก่อนอนุมัติรอบใหม่"
          className={overdueCount > 0 ? 'border-red-300 bg-red-50' : undefined}
        />
      </div>

      {/* ============ ตารางที่ 1 — รายการเบิก (Claims) ============ */}
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รายการเบิก (Claims) — อนุมัติหลายขั้น</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              มาจากงานภาคสนาม (ไฟล์ 41) อัตโนมัติ หรือบันทึกเองที่นี่ — เดินสายอนุมัติตาม Approval Matrix (`13` §6.2)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup options={CLAIM_STATUS_FILTERS} value={claimFilter} onChange={setClaimFilter} />
            {canCreateClaim && (
              <Button size="sm" onClick={() => setClaimFormOpen(true)}>
                + สร้างรายการเบิกเอง
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>วันที่ / อ้างอิง</Th>
                <Th>ประเภท</Th>
                <Th>ผู้เบิก / ทีม</Th>
                <Th numeric>Gross / WHT / Net</Th>
                <Th>สถานะ / ขั้น</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={claims.loading}
              error={claims.error}
              isEmpty={visibleClaims.length === 0}
              emptyTitle="ไม่มีรายการตามตัวกรองนี้"
              colSpan={6}
            />
            <TBody>
              {!claims.loading &&
                claims.error === null &&
                visibleClaims.map((item) => {
                  const actions = expenseRowActions({ status: item.status, canApprove: claims.canApprove })
                  return (
                    <Tr key={item.id} className={expenseRowHighlight(item.status) ?? undefined}>
                      <Td>
                        <p className="text-[11px] text-slate-400">{fmtDate(item.expenseDate)}</p>
                        <RefText>{item.caseRef ?? '— ไม่ผูกเคส'}</RefText>
                        <p className="text-[10px] text-slate-400">{claimSourceLabel(item.calculationSource)}</p>
                      </Td>
                      <Td>{EXPENSE_TYPE_LABEL[item.expenseType]}</Td>
                      <Td>
                        <p className="font-semibold text-slate-900">{item.payeeName}</p>
                        {item.agentName !== null && <p className="text-[10px] text-slate-500">{item.agentName}</p>}
                      </Td>
                      <Td numeric>
                        <p className="font-semibold text-slate-800">{fmtSatangSymbol(item.grossSatang)}</p>
                        <p className="text-[11px] text-slate-500">
                          WHT: {fmtSatangSymbol(item.whtSatang)} → Net:{' '}
                          <span className="font-semibold text-emerald-700">{fmtSatangSymbol(item.netSatang)}</span>
                        </p>
                      </Td>
                      <Td>
                        <StatusBadge
                          status={item.status}
                          group={expenseStatusBadgeGroup(item.status)}
                          label={EXPENSE_STATUS_LABEL[item.status]}
                        />
                        <div className="mt-1">
                          <Badge>{approvalStepText(item)}</Badge>
                        </div>
                        {item.rejectReason !== null && (
                          <p className="mt-1 max-w-[180px] text-[10px] text-orange-700">
                            เหตุผล: {item.rejectReason}
                          </p>
                        )}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="inline-flex flex-col items-end gap-1">
                          {actions.includes('approve') && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={claims.busyId === item.id}
                              onClick={() => void claims.approve(item)}
                            >
                              อนุมัติขั้น {item.approvalStepCurrent}
                            </Button>
                          )}
                          {actions.includes('reject') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRejectTarget(item)
                                setRejectReason('')
                              }}
                            >
                              ตีกลับ
                            </Button>
                          )}
                          {actions.includes('view_formula') && (
                            <Button size="sm" variant="ghost" onClick={() => setFormulaTarget(item)}>
                              ดูสูตร
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
            </TBody>
          </Table>
        </div>
      </Card>

      {/* ============ ตารางที่ 2 — เงินทดรองจ่าย (Advances) ============ */}
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">เงินทดรองจ่าย (Advances) — ไฟล์ 15</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              เบิกล่วงหน้าได้ครั้งละ 1 รายการต่อคน — ต้องเคลียร์ยอดเดิมให้เสร็จก่อนขอรอบใหม่เสมอ
            </p>
          </div>
          {canRequestAdvance && (
            <Button size="sm" variant="secondary" onClick={() => setAdvanceFormOpen(true)}>
              + ขอเบิกเงินทดรอง
            </Button>
          )}
        </div>

        {overdueCount > 0 && (
          <InlineAlert tone="error" className="mb-4">
            มี {fmtCount(overdueCount)} รายการเลยกำหนดเคลียร์ยอดแล้ว — ต้องตามเคลียร์ก่อน ผู้ขอจะเบิกรอบใหม่ไม่ได้
          </InlineAlert>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>ผู้ขอ / ทีม</Th>
                <Th>วัตถุประสงค์</Th>
                <Th numeric>ขอเบิก / ใช้จริง / คืน</Th>
                <Th>กำหนดเคลียร์</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={advLoading}
              error={advError}
              isEmpty={advances.length === 0}
              emptyTitle="ยังไม่มีรายการเงินทดรองจ่าย"
              colSpan={6}
            />
            <TBody>
              {!advLoading &&
                advError === null &&
                advances.map((advance) => (
                  <Tr key={advance.id} className={advance.status === 'overdue' ? 'bg-red-50/40' : undefined}>
                    <Td>
                      <p className="font-semibold text-slate-900">{advance.requesterName}</p>
                      {advance.teamName !== null && <p className="text-[10px] text-slate-500">{advance.teamName}</p>}
                    </Td>
                    <Td className="max-w-[220px] text-xs text-slate-600">{advance.purpose}</Td>
                    <Td numeric>
                      <p>
                        ขอ:{' '}
                        <span className="font-semibold text-slate-800">
                          {fmtSatangSymbol(advance.requestedSatang)}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        อนุมัติ: {fmtSatangSymbol(advance.approvedSatang)} · ใช้จริง:{' '}
                        {fmtSatangSymbol(advance.usedSatang)}
                      </p>
                      <p
                        className={cn(
                          'text-[11px]',
                          advance.returnSatang > 0 ? 'font-semibold text-emerald-700' : 'text-slate-500',
                        )}
                      >
                        คืน: {fmtSatangSymbol(advance.returnSatang)}
                        {advance.excessSatang > 0 && (
                          <span className="ml-1 text-orange-700">
                            (ใช้เกิน {fmtSatangSymbol(advance.excessSatang)})
                          </span>
                        )}
                      </p>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          'text-xs',
                          advance.isPastDue ? 'font-semibold text-red-600' : 'text-slate-500',
                        )}
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
                        {canSettleAdvance(advance.status) && (
                          <Button size="sm" variant="secondary" onClick={() => setSettleTarget(advance)}>
                            เคลียร์ยอด
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

      <CalcDetailModal item={formulaTarget} onClose={() => setFormulaTarget(null)} />

      <ReasonConfirmModal
        open={rejectTarget !== null}
        title="ตีกลับรายการเบิกให้แก้ไข"
        description="รายการจะกลับไปสถานะ “ต้องแก้ไข” และเริ่มขั้นอนุมัติที่ 1 ใหม่ทั้งหมด — ใช้กับเอกสาร/ใบเสร็จที่ไม่ถูกต้องเท่านั้น ถ้าสงสัยหลักฐานปิดงาน ต้องแจ้งเจ้าหน้าที่อนุมัติเคส (`16` §6.2)"
        confirmLabel="ตีกลับรายการ"
        loading={rejectTarget !== null && claims.busyId === rejectTarget.id}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget === null) return
          void claims.reject(rejectTarget, rejectReason).then((ok) => {
            if (ok) {
              setRejectTarget(null)
              setRejectReason('')
            }
          })
        }}
        placeholder="เช่น ใบเสร็จไม่ชัด ขอให้ถ่ายใหม่"
      />

      <ManualClaimModal
        open={claimFormOpen}
        onClose={() => setClaimFormOpen(false)}
        onCreated={() => void claims.reload()}
      />

      <AdvanceFormModal
        open={advanceFormOpen}
        onClose={() => setAdvanceFormOpen(false)}
        onCreated={() => void reloadAdvances()}
      />

      <AdvanceReviewModal
        advance={reviewTarget}
        mode={reviewMode}
        onClose={() => setReviewTarget(null)}
        onDone={() => void reloadAdvances()}
      />

      <SettleAdvanceModal
        advance={settleTarget}
        onClose={() => setSettleTarget(null)}
        onSettled={() => void reloadAdvances()}
      />
    </div>
  )
}
