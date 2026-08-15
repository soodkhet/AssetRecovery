'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import { PAYOUT_SIDE_LABEL } from '@/lib/payout/payout'
import { PAYOUT_STATUS_LABEL_SHORT, payoutStatusBadgeGroup } from '@/lib/payout/payout-ui'
import type { PayoutBatchDetailDto, PayoutBatchDto } from '@/lib/payout/types'

/**
 * Modal "ดูรายการในรอบจ่าย" (`17` §8 · mockup `finance.html` `payout-detail`) — **อ่านอย่างเดียว**
 *
 * รายการในรอบแก้ไขไม่ได้หลังสร้างไฟล์โอนแล้ว (`17` §10) ⇒ หน้านี้ไม่มีปุ่มแก้ไขเลยโดยตั้งใจ
 * ปุ่มเอกสาร 3 ใบ (`28` §6.1) เป็น `<a href>` ตรงไป endpoint — session cookie พาไปเอง
 *
 * ⚠️ ยอดทุกช่องเป็น snapshot ของรายการ ณ เวลาที่เข้ารอบ (`92` §7.1) — หน้าจอไม่คิดใหม่
 */
export function PayoutDetailModal({
  batch,
  onClose,
}: {
  batch: PayoutBatchDto | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<PayoutBatchDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

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
  }, [batchId, fetchDetail])

  if (batch === null) return null

  const items = detail?.items ?? []
  const canPrintVoucher = batch.status === 'file_generated' || batch.status === 'completed'

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={batch.name}
      description={`${PAYOUT_SIDE_LABEL[batch.side]} · ${fmtCount(batch.itemCount)} รายการ`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
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
              Gross {fmtSatangSymbol(batch.grossSatang)} · WHT{' '}
              <span className="text-red-600">{fmtSatangSymbol(batch.whtSatang)}</span> · สุทธิ{' '}
              <span className="font-bold text-emerald-700">{fmtSatangSymbol(batch.netSatang)}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DocLink href={`/api/payout-batches/${batch.id}/summary-pdf`}>สรุปรอบจ่าย PDF</DocLink>
            <DocLink href={`/api/payout-batches/${batch.id}/payslip-pdf`}>สลิปค่าตอบแทน</DocLink>
            {canPrintVoucher && (
              <DocLink href={`/api/payout-batches/${batch.id}/voucher-pdf`}>ใบสำคัญจ่าย</DocLink>
            )}
          </div>
        </div>

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
                <Th numeric>ก่อนหัก</Th>
                <Th numeric>WHT</Th>
                <Th numeric>สุทธิ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              emptyTitle="รอบนี้ยังไม่มีรายการ"
              colSpan={6}
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <p className="font-semibold text-slate-900">{item.payeeName}</p>
                      <p className="text-[10px] text-slate-500">{item.teamName ?? '—'}</p>
                    </Td>
                    <Td className="max-w-[220px] text-xs text-slate-600">
                      {item.description}
                      {item.caseRef !== null && (
                        <p className="text-[10px] text-slate-400">
                          เคส {item.caseRef}
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
                    <Td numeric>{fmtSatangSymbol(item.grossSatang)}</Td>
                    <Td numeric className={item.whtSatang > 0 ? 'text-red-600' : undefined}>
                      {fmtSatangSymbol(item.whtSatang)}
                      {item.whtPctSnapshot !== null && item.whtSatang > 0 && (
                        <p className="text-[10px] text-slate-400">
                          {fmtPercent(item.whtPctSnapshot)} · {item.taxProfileName ?? '—'}
                        </p>
                      )}
                    </Td>
                    <Td numeric className="font-semibold text-emerald-700">
                      {fmtSatangSymbol(item.netSatang)}
                    </Td>
                  </Tr>
                ))}
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
      className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {children}
    </a>
  )
}
