'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { AdjustmentFormModal } from '@/components/finance/adjustment-form-modal'
import { AdjustmentReviewModal } from '@/components/finance/adjustment-review-modal'
import { useAdjustments } from '@/components/finance/use-adjustments'
import {
  Button,
  Card,
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
import {
  ADJUSTMENT_TARGET_LABEL,
  APPROVE_ADJUSTMENT,
  APPROVE_ADJUSTMENT_LOCKED,
  CREATE_ADJUSTMENT,
} from '@/lib/adjustments/adjustment'
import {
  ADJUSTMENT_STATUS_FILTERS,
  ADJUSTMENT_STATUS_LABEL,
  ADJUSTMENT_TARGET_FILTERS,
  ADJUSTMENT_TYPE_TONE,
  adjustmentSignPrefix,
  adjustmentStatusBadgeGroup,
  canActOnAdjustment,
  periodStatusBadgeGroup,
  periodStatusLabel,
  type AdjustmentStatusFilter,
  type AdjustmentTargetFilter,
} from '@/lib/adjustments/adjustment-ui'
import type { AdjustmentDto } from '@/lib/adjustments/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "ปรับปรุง" (`20` §8 · mockup `finance.html` แท็บ `adjustment`)
 *
 * ⚠️ ปุ่มถาม `canActOnAdjustment()` (state machine เดียวกับ API `23` §6.9) — ห้าม if สถานะใน JSX
 * ⚠️ แถวของรายการที่อ้างรอบ `locked` ไฮไลต์แดง + บอกว่า "ต้องผู้บริหาร" ตาม mockup
 * ⚠️ ยอดในฐานข้อมูลเป็นบวกเสมอ — เครื่องหมาย/สีมาจาก `adjustment-ui.ts` ไม่ใช่คำนวณบนจอ (Rule 01)
 */
export function AdjustmentTab() {
  const { can } = usePermission()
  const canCreate = can('manage', CREATE_ADJUSTMENT)
  const canApprove = can('manage', APPROVE_ADJUSTMENT) || can('manage', APPROVE_ADJUSTMENT_LOCKED)

  const [status, setStatus] = useState<AdjustmentStatusFilter>('all')
  const [targetType, setTargetType] = useState<AdjustmentTargetFilter>('all')
  const { items, loading, error, reload } = useAdjustments(status, targetType)

  const [createOpen, setCreateOpen] = useState(false)
  const [review, setReview] = useState<{ adjustment: AdjustmentDto; mode: 'approve' | 'reject' } | null>(null)

  const pending = items.filter((row) => row.status === 'pending_approval')
  const lockedPending = pending.filter((row) => row.periodStatusAtTarget === 'locked')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="รออนุมัติ" value={fmtCount(pending.length)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard
          label="รออนุมัติของรอบที่ปิดแล้ว"
          value={fmtCount(lockedPending.length)}
          hint="ต้องผู้บริหารอนุมัติเท่านั้น"
        />
        <StatCard label="รายการทั้งหมด" value={fmtCount(items.length)} hint="เรียงจากรายการล่าสุด" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รายการปรับปรุง (Adjustments)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              ไม่แก้รายการต้นทาง — สร้างรายการชดเชยใหม่ · ระดับอนุมัติขึ้นกับสถานะรอบบัญชีของรายการต้นทาง
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup
              options={ADJUSTMENT_STATUS_FILTERS}
              value={status}
              onChange={(value) => setStatus(value as AdjustmentStatusFilter)}
            />
            <select
              aria-label="กรองตามประเภทรายการต้นทาง"
              value={targetType}
              onChange={(event) => setTargetType(event.target.value as AdjustmentTargetFilter)}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {ADJUSTMENT_TARGET_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                + สร้าง Adjustment
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4">
          <InlineAlert tone="info" title="หลักการ">
            ไม่แก้ source record ตรง — สร้างรายการใหม่ชดเชย · รอบกำลังรวบรวม = การเงินอนุมัติได้เอง ·
            ส่งสำนักงานบัญชีแล้ว = การเงิน + ผู้บริหาร · <b>ปิดรอบแล้ว = ผู้บริหารเท่านั้น</b>
          </InlineAlert>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>อ้างอิง (Target)</Th>
                <Th>ประเภท</Th>
                <Th>เหตุผล</Th>
                <Th numeric>ยอดปรับ</Th>
                <Th>สถานะรอบ</Th>
                <Th>สถานะรายการ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              emptyTitle="ยังไม่มีรายการปรับปรุงตามตัวกรองนี้"
              emptyDescription="กด “สร้าง Adjustment” เมื่อต้องแก้ยอดของรายการที่ประมวลผลไปแล้ว"
              colSpan={7}
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((row) => (
                  <Tr key={row.id} className={row.periodStatusAtTarget === 'locked' ? 'bg-red-50/40' : undefined}>
                    <Td>
                      <RefText>{row.targetRef}</RefText>
                      <p className="mt-0.5 text-[10px] text-slate-400">{row.targetLabel}</p>
                    </Td>
                    <Td className="text-xs">{ADJUSTMENT_TARGET_LABEL[row.targetType]}</Td>
                    <Td className="max-w-[220px] text-xs text-slate-600">
                      {row.reason}
                      {row.rejectionReason !== null && (
                        <p className="mt-0.5 text-[10px] font-semibold text-red-600">
                          เหตุผลที่ปฏิเสธ: {row.rejectionReason}
                        </p>
                      )}
                    </Td>
                    <Td numeric className={cn('font-bold', ADJUSTMENT_TYPE_TONE[row.adjustmentType])}>
                      {adjustmentSignPrefix(row.adjustmentType)}
                      {fmtSatangSymbol(row.amountSatang)}
                    </Td>
                    <Td>
                      <StatusBadge
                        status={row.periodStatusAtTarget ?? 'collecting'}
                        group={periodStatusBadgeGroup(row.periodStatusAtTarget)}
                        label={periodStatusLabel(row.periodStatusAtTarget)}
                      />
                      {row.periodStatusAtTarget === 'locked' && (
                        <p className="mt-1 text-[10px] font-semibold text-red-600">ต้องผู้บริหาร</p>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge
                        status={row.status}
                        group={adjustmentStatusBadgeGroup(row.status)}
                        label={ADJUSTMENT_STATUS_LABEL[row.status]}
                      />
                      {row.approvedByName !== null && (
                        <p className="mt-1 text-[10px] text-slate-400">โดย: {row.approvedByName}</p>
                      )}
                      {row.status === 'pending_approval' && row.missingApproverRoles.length > 0 && (
                        <p className="mt-1 text-[10px] text-slate-400">รอ: {row.missingApproverRoles.join(', ')}</p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">สร้าง {fmtDate(row.createdAt)}</p>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end gap-1">
                        {canApprove && canActOnAdjustment(row.status) && (
                          <>
                            <Button size="sm" onClick={() => setReview({ adjustment: row, mode: 'approve' })}>
                              ✓ อนุมัติ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setReview({ adjustment: row, mode: 'reject' })}
                            >
                              ปฏิเสธ
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </Card>

      <AdjustmentFormModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => void reload()} />

      <AdjustmentReviewModal
        key={`${review?.adjustment.id ?? 'none'}-${review?.mode ?? ''}`}
        adjustment={review?.adjustment ?? null}
        mode={review?.mode ?? 'approve'}
        onClose={() => setReview(null)}
        onDone={() => void reload()}
      />
    </div>
  )
}

function FilterGroup({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'focus-ring rounded-md px-3 py-1 text-xs font-semibold transition-colors',
            value === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
