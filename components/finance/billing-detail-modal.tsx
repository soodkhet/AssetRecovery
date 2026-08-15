'use client'

import { useEffect, useState } from 'react'
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
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import {
  BILLING_STATUS_LABEL,
  billingStatusBadgeGroup,
  isArOutstanding,
  REVENUE_STATUS_LABEL,
  revenueStatusBadgeGroup,
} from '@/lib/revenue/revenue-ui'
import type { BillingBatchDetailDto, BillingBatchDto } from '@/lib/revenue/types'
import { SERVICE_FEE_MODEL_LABEL } from '@/lib/service-fee/template'

/**
 * ปุ่ม "เอกสาร/ดู" ของ `19` §8 — รายละเอียดรอบวางบิล + รายการรายได้ที่ถูกรวมเข้ารอบ
 *
 * ⚠️ ผู้เรียกต้องใส่ `key={batch.id}` (โหลดใหม่ทุกครั้งโดยไม่ setState ใน effect — กับดัก 2.x)
 * ⚠️ ยอดค้าง/วันเกินกำหนดมาจาก API เท่านั้น (`22` §6.11) — หน้าจอแค่ format (Rule 01)
 */
export function BillingDetailModal({ batch, onClose }: { batch: BillingBatchDto | null; onClose: () => void }) {
  const [detail, setDetail] = useState<BillingBatchDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const batchId = batch?.id ?? null

  useEffect(() => {
    if (batchId === null) return
    let cancelled = false
    void (async () => {
      const result = await callApi<BillingBatchDetailDto>(`/api/billing-batches/${batchId}`)
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setDetail(result.data ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [batchId])

  if (batch === null) return null

  const revenues = detail?.revenues ?? []

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`รอบวางบิล — ${batch.companyName} งวด ${batch.period}`}
      description="รายการรายได้ที่ถูกรวมเข้ารอบนี้ (snapshot ตอนสร้างรอบ)"
      footer={
        <Button variant="ghost" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
          <Summary label="ยอดเรียกเก็บ" value={fmtSatangSymbol(batch.totalSatang)} />
          <Summary label="รับชำระแล้ว" value={fmtSatangSymbol(batch.receivedSatang)} tone="text-emerald-700" />
          <Summary
            label="ยอดคงค้าง (AR)"
            value={fmtSatangSymbol(batch.outstandingSatang)}
            tone={isArOutstanding(batch) ? 'text-red-600' : 'text-slate-400'}
          />
          <Summary label="ครบกำหนดชำระ" value={fmtDate(batch.dueDate)} />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <StatusBadge
            status={batch.status}
            group={billingStatusBadgeGroup(batch.status)}
            label={BILLING_STATUS_LABEL[batch.status]}
          />
          <span>สร้างโดย {batch.createdByName}</span>
          <span>{fmtCount(batch.revenueCount)} รายการ</span>
          {batch.sentAt !== null && <span>ส่งบิล {fmtDate(batch.sentAt)}</span>}
          {batch.whtWithheldByCustomerSatang > 0 && (
            <span>ลูกค้าหัก ณ ที่จ่าย {fmtSatangSymbol(batch.whtWithheldByCustomerSatang)}</span>
          )}
        </div>

        {batch.status !== 'draft' && (
          <InlineAlert tone="info">
            รับชำระจริงอัปเดตจากการจับคู่รายการเดินบัญชี (ไฟล์ 35) เท่านั้น — แก้ยอดของรอบที่ส่งแล้วต้องผ่าน
            รายการปรับปรุง (Adjustment)
          </InlineAlert>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>Case Ref</Th>
                <Th>วันที่รายได้</Th>
                <Th>Model</Th>
                <Th numeric>Gross</Th>
                <Th numeric>VAT</Th>
                <Th numeric>รวม</Th>
                <Th>สถานะ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={revenues.length === 0}
              emptyTitle="ไม่มีรายการรายได้ในรอบนี้"
              colSpan={7}
            />
            <TBody>
              {!loading &&
                error === null &&
                revenues.map((revenue) => (
                  <Tr key={revenue.id}>
                    <Td>
                      <RefText>{revenue.caseRef}</RefText>
                      {revenue.debtorName !== null && (
                        <p className="mt-0.5 text-[10px] text-slate-400">{revenue.debtorName}</p>
                      )}
                    </Td>
                    <Td>{fmtDate(revenue.revenueDate)}</Td>
                    <Td className="text-xs">{SERVICE_FEE_MODEL_LABEL[revenue.feeModelSnapshot]}</Td>
                    <Td numeric>{fmtSatangSymbol(revenue.grossSatang)}</Td>
                    <Td numeric className="text-slate-500">
                      {fmtSatangSymbol(revenue.vatSatang)}
                    </Td>
                    <Td numeric className="font-bold text-slate-900">
                      {fmtSatangSymbol(revenue.totalSatang)}
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
      </div>
    </Modal>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-bold ${tone ?? 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
