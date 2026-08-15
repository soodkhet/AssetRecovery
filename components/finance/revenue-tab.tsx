'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { ArAgingPanel } from '@/components/finance/ar-aging-panel'
import { BillingDetailModal } from '@/components/finance/billing-detail-modal'
import { CreateBillingModal } from '@/components/finance/create-billing-modal'
import { useBillingBatches, useRevenues } from '@/components/finance/use-billing'
import { ReasonConfirmModal, REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
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
  useToast,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import { MANAGE_BILLING } from '@/lib/revenue/revenue'
import {
  BILLING_STATUS_FILTERS,
  BILLING_STATUS_LABEL,
  billingStatusBadgeGroup,
  canDeleteBillingBatch,
  canSendBillingBatch,
  isArOutstanding,
  isArOverdue,
  REVENUE_STATUS_FILTERS,
  REVENUE_STATUS_LABEL,
  revenueStatusBadgeGroup,
  totalArOutstandingSatang,
  VAT_MODE_LABEL,
  type BillingStatusFilter,
  type RevenueStatusFilter,
} from '@/lib/revenue/revenue-ui'
import type { BillingBatchDto } from '@/lib/revenue/types'
import { SERVICE_FEE_MODEL_LABEL } from '@/lib/service-fee/template'

/**
 * แท็บ "รายได้และวางบิล" (`19` §8 · mockup `finance.html` แท็บ `revenue`)
 * — **2 ตารางในหน้าเดียว** (รอบวางบิล + รายการรายได้ดิบ) + มุมมอง AR Aging
 *
 * ⚠️ ปุ่มทุกตัวถาม `revenue-ui.ts` (state machine เดียวกับ API `23` §6.8) — ห้าม if สถานะใน JSX
 * ⚠️ ยอดคงค้าง/วันเกินกำหนดมาจาก API (`22` §6.11) — หน้าจอแค่ format และทาสีแดงเมื่อ > 0
 * ⚠️ **ไม่มีปุ่มแก้ยอดรายได้** — Revenue เกิดจากเกต `19` §6.1 เท่านั้น แก้ยอดต้องผ่าน Adjustment (ไฟล์ 20)
 */
export function RevenueTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_BILLING)
  const { showToast } = useToast()

  const [view, setView] = useState<'batches' | 'aging'>('batches')
  const [companyId, setCompanyId] = useState('')
  const [batchStatus, setBatchStatus] = useState<BillingStatusFilter>('all')
  const [revenueStatus, setRevenueStatus] = useState<RevenueStatusFilter>('all')

  const batches = useBillingBatches(batchStatus, companyId)
  const revenues = useRevenues(revenueStatus, companyId)

  const [createOpen, setCreateOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<BillingBatchDto | null>(null)
  const [action, setAction] = useState<{ batch: BillingBatchDto; kind: 'send' | 'delete' } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // ตัวเลือกบริษัทมาจากข้อมูลที่ผู้ใช้เห็นอยู่แล้ว (scope ระดับแถวของ API คัดมาให้)
  const companyOptions = [
    ...new Map(
      [
        ...batches.data.map((batch) => [batch.companyId, batch.companyName] as const),
        ...revenues.data.map((revenue) => [revenue.companyId, revenue.companyName] as const),
      ].map(([id, name]) => [id, name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'th'))

  function reloadAll(): void {
    void batches.reload()
    void revenues.reload()
  }

  async function confirmAction(): Promise<void> {
    if (action === null || reason.trim().length < REASON_MIN_LENGTH) return
    setBusy(true)
    const result =
      action.kind === 'send'
        ? await callApi(`/api/billing-batches/${action.batch.id}/send`, jsonRequest('PATCH', { reason: reason.trim() }))
        : await callApi(`/api/billing-batches/${action.batch.id}`, jsonRequest('DELETE', { reason: reason.trim() }))
    setBusy(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: action.kind === 'send' ? 'ส่งบิลแล้ว' : 'ลบรอบวางบิลแล้ว',
      description:
        action.kind === 'send'
          ? `${action.batch.companyName} งวด ${action.batch.period} — ${fmtSatangSymbol(action.batch.totalSatang)}`
          : `รายได้ในรอบถูกปล่อยกลับเป็น "รอวางบิล" ทั้งหมด`,
    })
    setAction(null)
    setReason('')
    reloadAll()
  }

  const unbilledCount = revenues.data.filter((revenue) => revenue.billingBatchId === null).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="ยอดค้างรับ (AR)"
          value={fmtSatangSymbol(totalArOutstandingSatang(batches.data))}
          hint={`${fmtCount(batches.data.filter(isArOverdue).length)} รอบเลยกำหนดชำระ`}
        />
        <StatCard
          label="รอบวางบิลตามตัวกรอง"
          value={fmtCount(batches.data.length)}
          hint={`${fmtCount(batches.data.filter((batch) => batch.status === 'draft').length)} รอบยังไม่ส่งบิล`}
        />
        <StatCard
          label="รายได้ที่ยังไม่ถูกรวมรอบ"
          value={fmtCount(unbilledCount)}
          hint="เกิดอัตโนมัติเมื่อผ่านเกตของ `19` §6.1"
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รอบวางบิล (Billing Batches)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              1 บริษัท 1 งวด = 1 รอบ · รับชำระจริงมาจากการจับคู่รายการเดินบัญชี (ไฟล์ 35) ไม่ใช่กรอกมือ
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup
              options={[
                { value: 'batches', label: 'รอบวางบิล' },
                { value: 'aging', label: 'AR Aging' },
              ]}
              value={view}
              onChange={(value) => setView(value === 'aging' ? 'aging' : 'batches')}
            />
            <select
              aria-label="กรองตามบริษัทไฟแนนซ์"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <option value="">ทุกบริษัท</option>
              {companyOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {view === 'batches' && (
              <FilterGroup
                options={BILLING_STATUS_FILTERS}
                value={batchStatus}
                onChange={(value) => setBatchStatus(value as BillingStatusFilter)}
              />
            )}
            {canManage && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                + สร้างรอบวางบิล
              </Button>
            )}
          </div>
        </div>

        {view === 'aging' ? (
          <ArAgingPanel companyId={companyId} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table>
              <THead>
                <Tr>
                  <Th>บริษัทไฟแนนซ์</Th>
                  <Th>รอบเดือน</Th>
                  <Th numeric>ยอดเรียกเก็บ</Th>
                  <Th numeric>รับชำระแล้ว</Th>
                  <Th numeric>ยอดคงค้าง (AR)</Th>
                  <Th>สถานะ</Th>
                  <Th className="text-right">จัดการ</Th>
                </Tr>
              </THead>
              <TableState
                loading={batches.loading}
                error={batches.error}
                isEmpty={batches.data.length === 0}
                emptyTitle="ยังไม่มีรอบวางบิลตามตัวกรองนี้"
                emptyDescription="กด “สร้างรอบวางบิล” เพื่อรวมรายได้ที่รอวางบิลของบริษัทในงวดนั้น"
                colSpan={7}
              />
              <TBody>
                {!batches.loading &&
                  batches.error === null &&
                  batches.data.map((batch) => (
                    <Tr key={batch.id} className={isArOverdue(batch) ? 'bg-red-50/40' : undefined}>
                      <Td>
                        <p className="font-semibold text-slate-900">{batch.companyName}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {fmtCount(batch.revenueCount)} รายการ · {VAT_MODE_LABEL[batch.companyVatMode]}
                        </p>
                      </Td>
                      <Td>
                        <p className="text-xs font-semibold text-slate-700">{batch.period}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          ครบกำหนด {fmtDate(batch.dueDate)}
                          {isArOverdue(batch) && (
                            <span className="ml-1 font-semibold text-red-600">
                              (เกิน {fmtCount(batch.daysOverdue)} วัน)
                            </span>
                          )}
                        </p>
                      </Td>
                      <Td numeric className="font-semibold">
                        {fmtSatangSymbol(batch.totalSatang)}
                      </Td>
                      <Td numeric className="text-emerald-700">
                        {fmtSatangSymbol(batch.receivedSatang)}
                        {batch.whtWithheldByCustomerSatang > 0 && (
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            + WHT ลูกค้าหัก {fmtSatangSymbol(batch.whtWithheldByCustomerSatang)}
                          </p>
                        )}
                      </Td>
                      <Td
                        numeric
                        className={cn('font-bold', isArOutstanding(batch) ? 'text-red-600' : 'text-slate-400')}
                      >
                        {fmtSatangSymbol(batch.outstandingSatang)}
                      </Td>
                      <Td>
                        <StatusBadge
                          status={batch.status}
                          group={billingStatusBadgeGroup(batch.status)}
                          label={BILLING_STATUS_LABEL[batch.status]}
                        />
                        {/* Rule 05 — "ส่งบิล" เป็น action สำคัญ ต้องเห็นวันที่บน list ไม่ใช่เฉพาะใน modal */}
                        {batch.sentAt !== null && (
                          <p className="mt-1 text-[10px] text-slate-400">ส่งบิล {fmtDate(batch.sentAt)}</p>
                        )}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="inline-flex flex-col items-end gap-1">
                          {canManage && canSendBillingBatch(batch.status) && (
                            <Button size="sm" onClick={() => setAction({ batch, kind: 'send' })}>
                              ส่งวางบิล
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDetailTarget(batch)}>
                            เอกสาร
                          </Button>
                          {canManage && canDeleteBillingBatch(batch.status) && (
                            <Button size="sm" variant="ghost" onClick={() => setAction({ batch, kind: 'delete' })}>
                              ลบรอบ
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รายการรายได้ (Revenue)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              เกิดอัตโนมัติเมื่อรายการเบิกอนุมัติ **และ** คลังยืนยันส่งมอบแล้ว (`19` §6.1) — ไม่มีการสร้าง/แก้ด้วยมือ
            </p>
          </div>
          <FilterGroup
            options={REVENUE_STATUS_FILTERS}
            value={revenueStatus}
            onChange={(value) => setRevenueStatus(value as RevenueStatusFilter)}
          />
        </div>

        <div className="mb-4">
          <InlineAlert tone="info">
            แก้ยอดรายได้ที่ถูกวางบิลไปแล้วไม่ได้ (EDIT_BILLED_REVENUE) — ต้องสร้างรายการปรับปรุงที่แท็บ “ปรับปรุง”
          </InlineAlert>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>บริษัท</Th>
                <Th>Case Ref</Th>
                <Th>วันที่รายได้</Th>
                <Th>Model</Th>
                <Th numeric>Gross</Th>
                <Th>VAT Flag</Th>
                <Th>รอบที่ถูกรวม</Th>
                <Th>สถานะ</Th>
              </Tr>
            </THead>
            <TableState
              loading={revenues.loading}
              error={revenues.error}
              isEmpty={revenues.data.length === 0}
              emptyTitle="ยังไม่มีรายการรายได้ตามตัวกรองนี้"
              emptyDescription="รายได้จะปรากฏหลังเคสผ่านเกตของ `19` §6.1 (expense approved + คลังยืนยัน)"
              colSpan={8}
            />
            <TBody>
              {!revenues.loading &&
                revenues.error === null &&
                revenues.data.map((revenue) => (
                  <Tr key={revenue.id}>
                    <Td className="text-xs">{revenue.companyName}</Td>
                    <Td>
                      <RefText>{revenue.caseRef}</RefText>
                      {revenue.trackingRound > 1 && (
                        <span className="ml-1 text-[10px] text-slate-400">รอบที่ {revenue.trackingRound}</span>
                      )}
                    </Td>
                    <Td>{fmtDate(revenue.revenueDate)}</Td>
                    <Td className="text-xs">{SERVICE_FEE_MODEL_LABEL[revenue.feeModelSnapshot]}</Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(revenue.grossSatang)}
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        VAT {fmtSatangSymbol(revenue.vatSatang)} · รวม {fmtSatangSymbol(revenue.totalSatang)}
                      </p>
                    </Td>
                    <Td className="text-xs">
                      {revenue.vatRatePctUsed > 0 ? `VAT ${fmtPercent(revenue.vatRatePctUsed)}` : VAT_MODE_LABEL.no_vat}
                    </Td>
                    <Td className="text-xs">
                      {revenue.billingBatchPeriod === null ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        revenue.billingBatchPeriod
                      )}
                    </Td>
                    <Td>
                      <StatusBadge
                        status={revenue.status}
                        group={revenueStatusBadgeGroup(revenue.status)}
                        label={REVENUE_STATUS_LABEL[revenue.status]}
                      />
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </Card>

      <CreateBillingModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reloadAll} />

      {/* `key` = รอบวางบิล ⇒ เปิดรอบใหม่แล้วโหลดใหม่เสมอ ไม่ค้างข้อมูลรอบก่อน */}
      <BillingDetailModal
        key={detailTarget?.id ?? 'none'}
        batch={detailTarget}
        onClose={() => setDetailTarget(null)}
      />

      <ReasonConfirmModal
        open={action !== null}
        title={action?.kind === 'delete' ? 'ลบรอบวางบิล (Draft)' : 'ส่งบิลให้บริษัทไฟแนนซ์'}
        description={action === null ? undefined : `${action.batch.companyName} งวด ${action.batch.period}`}
        confirmLabel={action?.kind === 'delete' ? 'ลบรอบวางบิล' : 'ยืนยันส่งบิล'}
        confirmVariant={action?.kind === 'delete' ? 'danger' : 'primary'}
        loading={busy}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => {
          setAction(null)
          setReason('')
        }}
        onConfirm={() => void confirmAction()}
        placeholder={
          action?.kind === 'delete'
            ? 'เช่น สร้างรอบผิดบริษัท ต้องรวมใหม่'
            : 'เช่น ส่งใบวางบิลทางอีเมลให้ฝ่ายจัดซื้อแล้ว 05/07/2569'
        }
      >
        <div className="mb-3 space-y-2">
          {action !== null && (
            <InlineAlert tone={action.kind === 'delete' ? 'warning' : 'info'} title="ยอดเรียกเก็บของรอบ">
              {fmtSatangSymbol(action.batch.totalSatang)} · {fmtCount(action.batch.revenueCount)} รายการ ·
              ครบกำหนด {fmtDate(action.batch.dueDate)}
            </InlineAlert>
          )}
          {action?.kind === 'delete' && (
            <InlineAlert tone="warning">
              รายได้ทุกใบในรอบจะถูกปล่อยกลับเป็น “รอวางบิล” และรวมเข้ารอบใหม่ได้ — ลบได้เฉพาะรอบที่ยังไม่ส่ง
            </InlineAlert>
          )}
        </div>
      </ReasonConfirmModal>
    </div>
  )
}

