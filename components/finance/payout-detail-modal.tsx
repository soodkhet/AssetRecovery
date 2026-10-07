'use client'

import { useCallback, useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/button'
import {
  Button,
  InlineAlert,
  Modal,
  RefText,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { payoutItemTaxSplit } from '@/lib/finance/wht-calc'
import { fmtCount, fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import { PAYOUT_SIDE_LABEL } from '@/lib/payout/payout'
import { canCancelPayout, PAYOUT_STATUS_LABEL_SHORT, payoutStatusBadgeGroup } from '@/lib/payout/payout-ui'
import type { PayoutBatchDetailDto, PayoutBatchDto } from '@/lib/payout/types'

/**
 * Modal "ดูรายการในรอบจ่าย" (`17` §8 · mockup `finance.html` `payout-detail`) — **อ่านอย่างเดียว**
 *
 * รายการในรอบแก้ไขไม่ได้หลังสร้างไฟล์โอนแล้ว (`17` §10) ⇒ หน้านี้ไม่มีปุ่มแก้ไขเลยโดยตั้งใจ
 * ปุ่มเอกสาร 3 ใบ (`28` §6.1) เป็น `<a href>` ตรงไป endpoint — session cookie พาไปเอง
 *
 * ⚠️ ยอดทุกช่องเป็น snapshot ของรายการ ณ เวลาที่เข้ารอบ (`92` §7.1) — หน้าจอไม่คิดใหม่
 * มติ PO U109 — แยก "ค่าตอบแทน" (เงินได้จริง) กับ "ภาษีที่บริษัทออกให้" ด้วย `payoutItemTaxSplit()` (ไม่คิดภาษีใหม่)
 */
export function PayoutDetailModal({
  batch,
  onClose,
  canManage = false,
  onCancelRequest,
}: {
  batch: PayoutBatchDto | null
  onClose: () => void
  /** มีสิทธิ์จัดการรอบจ่าย (manage) — ใช้แสดงปุ่ม "ยกเลิกรอบจ่าย" (มติ PO U67) */
  canManage?: boolean
  onCancelRequest?: (batch: PayoutBatchDto) => void
}) {
  const [detail, setDetail] = useState<PayoutBatchDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  /** เพิ่มค่าเมื่อกด "ลองใหม่" หลังโหลดไม่สำเร็จ — บังคับ effect ยิงซ้ำ (preship R2-022) */
  const [retryKey, setRetryKey] = useState(0)
  const retry = (): void => {
    setError(null)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }

  const batchId = batch?.id ?? null

  const fetchDetail = useCallback(
    async () => (batchId === null ? null : callApi<PayoutBatchDetailDto>(`/api/payout-batches/${batchId}`)),
    [batchId],
  )

  useEffect(() => {
    if (batchId === null) return
    let cancelled = false
    // ไม่ setLoading ที่นี่ (กฎ `react-hooks/set-state-in-effect`) — ผู้เรียกใส่ `key` ตามรอบจ่าย
    // ⇒ เปลี่ยนรอบ = remount ทั้ง modal, state เริ่มที่ loading ใหม่เสมอ
    void (async () => {
      const result = await fetchDetail()
      if (cancelled || result === null) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setDetail(null)
        setLoading(false)
        return
      }
      setDetail(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [batchId, fetchDetail, retryKey])

  if (batch === null) return null

  const items = detail?.items ?? []
  const canPrintVoucher = batch.status === 'file_generated' || batch.status === 'completed'
  // มติ PO U67 — รอบที่ยกเลิกไม่มีการจ่ายจริง ⇒ ไม่มีเอกสารจ่ายเงินให้พิมพ์ (API ปฏิเสธด้วย)
  const isCancelled = batch.status === 'cancelled'
  const showCancel = canManage && onCancelRequest !== undefined && canCancelPayout(batch.status)

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={batch.name}
      description={`${PAYOUT_SIDE_LABEL[batch.side]} · ${fmtCount(batch.itemCount)} รายการ`}
      footer={
        <>
          {showCancel && (
            <Button variant="danger" onClick={() => onCancelRequest(batch)}>
              ยกเลิกรอบจ่าย
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <StatusBadge
              status={batch.status}
              group={payoutStatusBadgeGroup(batch.status)}
              label={PAYOUT_STATUS_LABEL_SHORT[batch.status]}
            />
            <span>
              ค่าตอบแทน {fmtSatangSymbol(batch.compensationSatang)}
              {batch.whtPaidByPayerSatang > 0 && (
                <>
                  {' '}· ภาษีที่บริษัทออกให้{' '}
                  <span className="text-amber-700">{fmtSatangSymbol(batch.whtPaidByPayerSatang)}</span>
                </>
              )}
              {' '}· WHT หักผู้รับ <span className="text-red-600">{fmtSatangSymbol(batch.whtWithheldSatang)}</span> · สุทธิ{' '}
              <span className="font-bold text-emerald-700">{fmtSatangSymbol(batch.netSatang)}</span>
              {/* มติ PO U30 — หักคืนเงินทดรองหลังภาษี ⇒ ยอดโอนจริงลดลง */}
              {batch.advanceOffsetSatang > 0 && (
                <>
                  {' '}· หักคืนเงินทดรอง <span className="text-amber-700">{fmtSatangSymbol(batch.advanceOffsetSatang)}</span>
                  {' '}· ยอดโอน <span className="font-bold text-emerald-700">{fmtSatangSymbol(batch.transferSatang)}</span>
                </>
              )}
            </span>
          </div>

          {!isCancelled && (
            <div className="flex flex-wrap items-center gap-2">
              <DocLink href={`/api/payout-batches/${batch.id}/summary-pdf`}>สรุปรอบจ่าย PDF</DocLink>
              <DocLink href={`/api/payout-batches/${batch.id}/payslip-pdf`}>สลิปค่าตอบแทน</DocLink>
              {canPrintVoucher && (
                <DocLink href={`/api/payout-batches/${batch.id}/voucher-pdf`}>ใบสำคัญจ่าย</DocLink>
              )}
            </div>
          )}
        </div>

        {isCancelled && (
          <InlineAlert tone="error" title="รอบจ่ายนี้ถูกยกเลิกแล้ว">
            {batch.cancelledAt !== null && `เมื่อ ${fmtDateTime(batch.cancelledAt)}`}
            {batch.cancelledByName !== null && ` โดย ${batch.cancelledByName}`}
            {batch.cancelReason !== null && ` — เหตุผล: ${batch.cancelReason}`}
            {' · '}รายการทั้งหมดกลับไปรอจ่ายแล้ว ตารางด้านล่างเป็นประวัติ ณ วันที่สร้างรอบ
          </InlineAlert>
        )}

        {/* มติ PO U133 — รอบจ่าย AP ที่ใช้ + กำหนดจ่าย (snapshot ตอนสร้างรอบ) */}
        {batch.cycleName !== null && (
          <div className="text-xs text-slate-600">
            รอบจ่าย: <span className="font-semibold text-slate-800">{batch.cycleName}</span>
            {batch.cycleDueRule !== null && ` · ${batch.cycleDueRule}`}
            {batch.payDueDate !== null && ` · กำหนดจ่าย ${fmtDate(batch.payDueDate)}`}
          </div>
        )}

        {batch.idempotencyKey !== null && (
          <InlineAlert tone="info">
            Idempotency Key: <RefText>{batch.idempotencyKey}</RefText>
            {batch.paymentFileGeneratedAt !== null && ` · สร้างไฟล์โอนเมื่อ ${fmtDateTime(batch.paymentFileGeneratedAt)}`}
          </InlineAlert>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>ผู้รับเงิน / ทีม</Th>
                <Th>รายการ</Th>
                <Th>บัญชีรับเงิน</Th>
                <Th numeric>ค่าตอบแทน</Th>
                <Th numeric>ภาษีที่บริษัทออกให้</Th>
                <Th numeric>WHT หักผู้รับ</Th>
                <Th numeric>สุทธิ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              emptyTitle="รอบนี้ยังไม่มีรายการ"
              colSpan={7}
              onRetry={retry}
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((item) => {
                  const split = payoutItemTaxSplit(item)
                  const rateNote =
                    item.whtPctSnapshot !== null && item.whtSatang > 0 ? (
                      <p className="text-[10px] text-slate-400">
                        {fmtPercent(item.whtPctSnapshot)} ·{' '}
                        {item.whtIncomeCategory === 'sec_40_1'
                          ? 'เงินได้ 40(1)'
                          : item.whtIncomeCategory === 'sec_40_2'
                            ? 'เงินได้ 40(2)'
                            : (item.taxProfileName ?? '—')}
                      </p>
                    ) : null
                  return (
                  <Tr key={item.id}>
                    <Td>
                      <p className="font-semibold text-slate-900">{item.payeeName}</p>
                      <p className="text-[10px] text-slate-500">{item.teamName ?? '—'}</p>
                    </Td>
                    <Td className="max-w-[220px] text-xs text-slate-600">
                      {item.description}
                      {item.caseRef !== null && (
                        <p className="text-[10px] text-slate-400">
                          เคส <span className="font-mono">{item.caseRef}</span>
                          {item.trackingRound > 1 ? ` (รอบติดตามที่ ${item.trackingRound})` : ''}
                        </p>
                      )}
                      {item.source === 'advance' && (
                        <p className="text-[10px] text-purple-800">เงินทดรองจ่าย — ไม่หัก WHT</p>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {item.bankName ?? '—'}
                      <p className="font-mono text-[10px] text-slate-400">{item.accountNumberMasked ?? '—'}</p>
                    </Td>
                    <Td numeric>{fmtSatangSymbol(split.compensationSatang)}</Td>
                    <Td numeric className={split.whtPaidByPayerSatang > 0 ? 'text-amber-700' : undefined}>
                      {fmtSatangSymbol(split.whtPaidByPayerSatang)}
                      {split.whtPaidByPayerSatang > 0 && (
                        <>
                          {rateNote}
                          <p className="text-[10px] text-slate-400">ไม่หักจากผู้รับ</p>
                        </>
                      )}
                    </Td>
                    <Td numeric className={split.whtWithheldSatang > 0 ? 'text-red-600' : undefined}>
                      {fmtSatangSymbol(split.whtWithheldSatang)}
                      {split.whtWithheldSatang > 0 && rateNote}
                      {/* ค่าตั้งฐาน WHT (มติ PO 05/10/2569 UAT U3) — รายการนอกฐานจ่ายเต็ม ไม่หัก */}
                      {item.source === 'expense' && !item.whtBaseIncluded && (
                        <p className="text-[10px] text-slate-400">ไม่อยู่ในฐานภาษี</p>
                      )}
                    </Td>
                    <Td numeric className="font-semibold text-emerald-700">
                      {fmtSatangSymbol(item.netSatang)}
                      {item.advanceOffsets.map((offset) => (
                        <p key={offset.advanceId} className="text-[10px] font-normal text-amber-700">
                          หักคืนเงินทดรอง <span className="font-mono">{offset.advanceRef}</span> ({fmtSatangSymbol(offset.amountSatang)})
                        </p>
                      ))}
                      {item.advanceOffsetSatang > 0 && (
                        <p className="text-[10px] text-slate-600">โอน {fmtSatangSymbol(item.transferSatang)}</p>
                      )}
                    </Td>
                  </Tr>
                  )
                })}
            </TBody>
          </Table>
        </div>
      </div>
    </Modal>
  )
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonClass('secondary')}
    >
      {children}
    </a>
  )
}
