'use client'

import { useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { CreatePayoutModal } from '@/components/finance/create-payout-modal'
import { PaymentFileModal } from '@/components/finance/payment-file-modal'
import { PayoutDetailModal } from '@/components/finance/payout-detail-modal'
import { usePayoutBatches } from '@/components/finance/use-payout-batches'
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
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { GENERATE_PAYMENT_FILE, MANAGE_PAYOUT_BATCH, PAYOUT_SIDE_LABEL } from '@/lib/payout/payout'
import {
  canCompletePayout,
  canDownloadPaymentFile,
  canGeneratePaymentFile,
  countPendingPayoutBatches,
  isDuplicatePaymentFile,
  payoutStatusBadgeGroup,
  pendingPayoutNetSatang,
  PAYOUT_SIDE_BADGE_CLASS,
  PAYOUT_SIDE_FILTERS,
  PAYOUT_STATUS_FILTERS,
  PAYOUT_STATUS_LABEL_SHORT,
  type PayoutSideFilter,
  type PayoutStatusFilter,
} from '@/lib/payout/payout-ui'
import type { PayoutBatchDto } from '@/lib/payout/types'

/**
 * แท็บ "รอบจ่ายเงิน" (`17` §8 · mockup `finance.html` แท็บ `payout`)
 * — ตาราง batch + 3 modal (สร้างรอบ / สร้างไฟล์โอน / ดูรายการ) + ยืนยันจ่ายแล้ว
 *
 * ⚠️ ปุ่มทุกตัวถาม `payout-ui.ts` (state machine เดียวกับ API `23` §6.6) — **ห้าม if สถานะใน JSX**
 * ⚠️ **สิทธิ์ 2 ชั้น**: ดู/สร้างรอบ = `manage_payout_batch` · สร้าง+ดาวน์โหลดไฟล์โอน =
 *    `generate_payment_file` (จุดที่เงินออกจริง — `17` §12)
 * ⚠️ ยอดทุกช่องมาจาก API หน้าจอแค่ format (Rule 01)
 */
export function PayoutTab() {
  const { can } = usePermission()
  const canManageBatch = can('manage', MANAGE_PAYOUT_BATCH)
  const canGenerateFile = can('manage', GENERATE_PAYMENT_FILE)
  const canDownloadFile = can('view', GENERATE_PAYMENT_FILE)

  const { showToast } = useToast()
  const [status, setStatus] = useState<PayoutStatusFilter>('all')
  const [side, setSide] = useState<PayoutSideFilter>('all')
  const { items, loading, error, reload } = usePayoutBatches(status, side)

  const [createOpen, setCreateOpen] = useState(false)
  const [fileTarget, setFileTarget] = useState<PayoutBatchDto | null>(null)
  const [detailTarget, setDetailTarget] = useState<PayoutBatchDto | null>(null)
  const [completeTarget, setCompleteTarget] = useState<PayoutBatchDto | null>(null)
  const [completeReason, setCompleteReason] = useState('')
  const [completing, setCompleting] = useState(false)

  async function confirmComplete(): Promise<void> {
    if (completeTarget === null || completeReason.trim().length < REASON_MIN_LENGTH) return
    setCompleting(true)
    const result = await callApi<PayoutBatchDto>(
      `/api/payout-batches/${completeTarget.id}/complete`,
      jsonRequest('PATCH', { reason: completeReason.trim() }),
    )
    setCompleting(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'ยืนยันการจ่ายเงินแล้ว',
      description: `${completeTarget.name} — ${fmtSatangSymbol(completeTarget.netSatang)}`,
    })
    setCompleteTarget(null)
    setCompleteReason('')
    void reload()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="เงินรอจ่าย (Payout)"
          value={fmtSatangSymbol(pendingPayoutNetSatang(items))}
          hint={`${fmtCount(countPendingPayoutBatches(items))} รอบที่ยังไม่จ่ายสำเร็จ`}
        />
        <StatCard label="รอบทั้งหมดตามตัวกรอง" value={fmtCount(items.length)} hint="เรียงจากรอบล่าสุด" />
        <StatCard
          label="รอบที่รอสร้างไฟล์โอน"
          value={fmtCount(items.filter((batch) => batch.status === 'checking').length)}
          hint="ตรวจยอดให้ครบก่อนสร้างไฟล์"
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รอบจ่ายเงิน (Payout Batches)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              1 รอบ = 1 ฝั่งเสมอ · ระบบรวบรวมรายการที่อนุมัติแล้วให้เอง (`17` §6.1/§9)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup
              options={PAYOUT_STATUS_FILTERS}
              value={status}
              onChange={(value) => setStatus(value as PayoutStatusFilter)}
            />
            <FilterGroup
              options={PAYOUT_SIDE_FILTERS}
              value={side}
              onChange={(value) => setSide(value as PayoutSideFilter)}
            />
            {canManageBatch && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                + สร้างรอบจ่าย
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4">
          <InlineAlert tone="warning">
            ห้ามรวม <b>Inhouse</b> กับ <b>Outsource</b> ในรอบเดียวกัน (MIXED_SIDE_BATCH) — ผู้รับเงินที่ยัง
            ไม่ยืนยันข้อมูลถูกบล็อกทั้งรอบ (UNVERIFIED_PAYEE_IN_PAYOUT)
          </InlineAlert>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>ชื่อรอบจ่าย</Th>
                <Th>ฝั่ง</Th>
                <Th numeric>Gross</Th>
                <Th numeric>WHT</Th>
                <Th numeric>โอนสุทธิ</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              emptyTitle="ยังไม่มีรอบจ่ายตามตัวกรองนี้"
              emptyDescription="กด “สร้างรอบจ่าย” เพื่อรวบรวมรายการที่อนุมัติแล้ว"
              colSpan={7}
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((batch) => (
                  <Tr key={batch.id}>
                    <Td>
                      <p className="font-semibold text-slate-900">{batch.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {fmtCount(batch.itemCount)} รายการ
                        {batch.idempotencyKey !== null && (
                          <>
                            {' · Key: '}
                            <RefText className="text-[10px]">{batch.idempotencyKey}</RefText>
                          </>
                        )}
                      </p>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-[10px] font-bold uppercase',
                          PAYOUT_SIDE_BADGE_CLASS[batch.side],
                        )}
                      >
                        {PAYOUT_SIDE_LABEL[batch.side]}
                      </span>
                    </Td>
                    <Td numeric>{fmtSatangSymbol(batch.grossSatang)}</Td>
                    <Td numeric className="text-red-600">
                      {fmtSatangSymbol(batch.whtSatang)}
                    </Td>
                    <Td numeric className="text-base font-bold text-emerald-700">
                      {fmtSatangSymbol(batch.netSatang)}
                    </Td>
                    <Td>
                      <StatusBadge
                        status={batch.status}
                        group={payoutStatusBadgeGroup(batch.status)}
                        label={PAYOUT_STATUS_LABEL_SHORT[batch.status]}
                      />
                      {batch.paymentFileGeneratedAt !== null && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          ไฟล์: {fmtDateTime(batch.paymentFileGeneratedAt)}
                        </p>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end gap-1">
                        {canGenerateFile && canGeneratePaymentFile(batch.status) && (
                          <Button
                            size="sm"
                            variant={isDuplicatePaymentFile(batch) ? 'secondary' : 'primary'}
                            onClick={() => setFileTarget(batch)}
                          >
                            {isDuplicatePaymentFile(batch) ? 'สร้างไฟล์โอนซ้ำ' : 'สร้างไฟล์โอน'}
                          </Button>
                        )}
                        {canDownloadFile && canDownloadPaymentFile(batch) && (
                          <a
                            href={`/api/payout-batches/${batch.id}/payment-file`}
                            className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            ดาวน์โหลดไฟล์โอน
                          </a>
                        )}
                        {canManageBatch && canCompletePayout(batch.status) && (
                          <Button size="sm" variant="secondary" onClick={() => setCompleteTarget(batch)}>
                            ✓ ยืนยันจ่ายแล้ว
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDetailTarget(batch)}>
                          ดูรายการ
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </Card>

      <CreatePayoutModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => void reload()} />

      <PaymentFileModal batch={fileTarget} onClose={() => setFileTarget(null)} onDone={() => void reload()} />

      {/* `key` = รอบจ่าย ⇒ เปิดรอบใหม่แล้ว modal เริ่มโหลดใหม่เสมอ ไม่ค้างข้อมูลรอบก่อน */}
      <PayoutDetailModal
        key={detailTarget?.id ?? 'none'}
        batch={detailTarget}
        onClose={() => setDetailTarget(null)}
      />

      <ReasonConfirmModal
        open={completeTarget !== null}
        title="ยืนยันการจ่ายเงินสำเร็จ (Mark Completed)"
        description={completeTarget?.name}
        confirmLabel="ยืนยันจ่ายแล้ว"
        confirmVariant="primary"
        loading={completing}
        reason={completeReason}
        onReasonChange={setCompleteReason}
        onClose={() => {
          setCompleteTarget(null)
          setCompleteReason('')
        }}
        onConfirm={() => void confirmComplete()}
        placeholder="เช่น ตรวจสอบสลิปโอนจากธนาคารครบทุกราย 05/07/2569"
      >
        <div className="mb-3 space-y-2">
          <InlineAlert tone="success" title="ยอดสุทธิที่โอน">
            {completeTarget === null ? '' : fmtSatangSymbol(completeTarget.netSatang)}
          </InlineAlert>
          <InlineAlert tone="info">
            ปกติระบบ sync สถานะนี้อัตโนมัติจากรายการเดินบัญชีที่จับคู่สำเร็จ (ไฟล์ 35) —
            การยืนยันด้วยมือเป็นทางเลือกสำรองเมื่อ statement ล่าช้า และจะถูกบันทึกชื่อผู้ยืนยันไว้
          </InlineAlert>
        </div>
      </ReasonConfirmModal>
    </div>
  )
}

