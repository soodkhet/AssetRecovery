'use client'

import { buttonClass } from '@/components/ui/button'
import { useState } from 'react'
import { useUrlFilter } from '@/components/ui/use-url-filter'
import { FINANCE_FILTER_PARAMS } from '@/lib/finance/operation-tabs'
import { usePermission } from '@/components/auth/permission-provider'
import { CancelPayoutModal } from '@/components/finance/cancel-payout-modal'
import { CreatePayoutModal } from '@/components/finance/create-payout-modal'
import { PaymentFileModal } from '@/components/finance/payment-file-modal'
import { PayoutDetailModal } from '@/components/finance/payout-detail-modal'
import { usePayoutBatches } from '@/components/finance/use-payout-batches'
import { ReasonConfirmModal, REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import { REASON_MAX } from '@/lib/api/validation'
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
  hasAdvanceOffset,
  isDuplicatePaymentFile,
  payoutStatusBadgeGroup,
  payoutTransferText,
  pendingPayoutTransferSatang,
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
  // ตัวกรองอยู่ใน URL — refresh/Back กลับมายังกรองเหมือนเดิม (preship R6-008)
  const [status, setStatus] = useUrlFilter<PayoutStatusFilter>(FINANCE_FILTER_PARAMS.payoutStatus, PAYOUT_STATUS_FILTERS, 'all')
  const [side, setSide] = useUrlFilter<PayoutSideFilter>(FINANCE_FILTER_PARAMS.payoutSide, PAYOUT_SIDE_FILTERS, 'all')
  const { items, loading, error, reload } = usePayoutBatches(status, side)

  const [createOpen, setCreateOpen] = useState(false)
  const [fileTarget, setFileTarget] = useState<PayoutBatchDto | null>(null)
  const [detailTarget, setDetailTarget] = useState<PayoutBatchDto | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PayoutBatchDto | null>(null)
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
      // ยอดโอนจริงจาก server (หักคืนเงินทดรองแล้ว — BUG-154)
      description: `${completeTarget.name} — ${payoutTransferText(completeTarget)}`,
    })
    setCompleteTarget(null)
    setCompleteReason('')
    void reload()
  }

  // โหลดไม่สำเร็จ (เช่น ไม่มีสิทธิ์) ⇒ การ์ดสรุปแสดง "—" ไม่ใช่ "0" ที่ดูเหมือนไม่มีข้อมูล (UAT R6-F)
  const failed = error !== null
  // ระหว่างโหลดก็ยังไม่มีตัวเลขจริง ⇒ "—" เช่นกัน (preship R2-007)
  const unavailable = loading || failed

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          // ยอดโอนจริง (สุทธิ − หักคืนเงินทดรอง) ต่างจาก "เงินรอจ่าย" ของภาพรวมที่เป็นยอดสุทธิ ⇒ ตั้งชื่อให้ต่างกัน (preship R3-017)
          label="ยอดโอนจริงที่รอจ่าย"
          value={unavailable ? '—' : fmtSatangSymbol(pendingPayoutTransferSatang(items))}
          hint={
            failed
              ? 'โหลดข้อมูลไม่สำเร็จ'
              : loading
                ? 'กำลังโหลด...'
                : `${fmtCount(countPendingPayoutBatches(items))} รอบที่ยังไม่จ่ายสำเร็จ · หักคืนเงินทดรองแล้ว`
          }
        />
        <StatCard
          label="รอบทั้งหมดตามตัวกรอง"
          value={unavailable ? '—' : fmtCount(items.length)}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'เรียงจากรอบล่าสุด'}
        />
        <StatCard
          label="รอบที่รอสร้างไฟล์โอน"
          value={unavailable ? '—' : fmtCount(items.filter((batch) => batch.status === 'checking').length)}
          hint={failed ? 'โหลดข้อมูลไม่สำเร็จ' : 'ตรวจยอดให้ครบก่อนสร้างไฟล์'}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">รอบจ่ายเงิน (Payout Batches)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              1 รอบ = 1 ฝั่งเสมอ · ระบบรวบรวมรายการที่อนุมัติแล้วให้เอง
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
            ห้ามรวม <b>Inhouse</b> กับ <b>Outsource</b> ในรอบเดียวกัน — ผู้รับเงินที่ยัง
            ไม่ยืนยันข้อมูลถูกบล็อกทั้งรอบ
          </InlineAlert>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>ชื่อรอบจ่าย</Th>
                <Th>ฝั่ง</Th>
                <Th numeric>ค่าตอบแทน</Th>
                <Th numeric>ภาษีที่บริษัทออกให้</Th>
                <Th numeric>WHT หักผู้รับ</Th>
                <Th numeric>โอนสุทธิ</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              onRetry={() => void reload()}
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              emptyTitle="ยังไม่มีรอบจ่ายตามตัวกรองนี้"
              emptyDescription="กด “สร้างรอบจ่าย” เพื่อรวบรวมรายการที่อนุมัติแล้ว"
              colSpan={8}
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
                    {/* มติ PO U109 — แยกค่าตอบแทน (เงินได้จริง) กับภาษีที่บริษัทออกให้ (ยอดจาก server) */}
                    <Td numeric>{fmtSatangSymbol(batch.compensationSatang)}</Td>
                    <Td numeric className={batch.whtPaidByPayerSatang > 0 ? 'text-amber-700' : undefined}>
                      {fmtSatangSymbol(batch.whtPaidByPayerSatang)}
                    </Td>
                    <Td numeric className="text-red-600">
                      {fmtSatangSymbol(batch.whtWithheldSatang)}
                    </Td>
                    <Td numeric className="text-base font-bold text-emerald-700">
                      {fmtSatangSymbol(batch.transferSatang)}
                      {hasAdvanceOffset(batch) && (
                        <p className="text-[10px] font-normal text-amber-700">
                          หักคืนเงินทดรอง {fmtSatangSymbol(batch.advanceOffsetSatang)}
                        </p>
                      )}
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
                      {batch.cancelledAt !== null && (
                        <p className="mt-1 text-[10px] text-red-600">ยกเลิก: {fmtDateTime(batch.cancelledAt)}</p>
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
                            className={buttonClass('secondary')}
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
        canManage={canManageBatch}
        onCancelRequest={(batch) => {
          setDetailTarget(null)
          setCancelTarget(batch)
        }}
      />

      {/* มติ PO U67 — ยกเลิกรอบจ่าย (เปิดจากรายละเอียดรอบ) · `key` ⇒ เปิดรอบใหม่ฟอร์มเริ่มว่างเสมอ */}
      <CancelPayoutModal
        key={`cancel-${cancelTarget?.id ?? 'none'}`}
        batch={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => void reload()}
      />

      <ReasonConfirmModal
        maxLength={REASON_MAX}
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
            {completeTarget === null ? '' : fmtSatangSymbol(completeTarget.transferSatang)}
            {completeTarget !== null && hasAdvanceOffset(completeTarget) && (
              <span className="block text-xs font-normal">
                หักคืนเงินทดรอง {fmtSatangSymbol(completeTarget.advanceOffsetSatang)} (ยอดหลังหักภาษี{' '}
                {fmtSatangSymbol(completeTarget.netSatang)})
              </span>
            )}
          </InlineAlert>
          <InlineAlert tone="info">
            ปกติระบบ sync สถานะนี้อัตโนมัติจากรายการเดินบัญชีที่จับคู่สำเร็จ —
            การยืนยันด้วยมือเป็นทางเลือกสำรองเมื่อ statement ล่าช้า และจะถูกบันทึกชื่อผู้ยืนยันไว้
          </InlineAlert>
        </div>
      </ReasonConfirmModal>
    </div>
  )
}

