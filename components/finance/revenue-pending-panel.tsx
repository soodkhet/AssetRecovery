'use client'

import { useEffect, useState } from 'react'
import { Button, Card, RefText, StatusBadge, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { caseStatusBadgeGroup, caseStatusLabel } from '@/lib/cases/status-display'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'
import type { RevenuePendingItemDto } from '@/lib/revenue/pending'

/**
 * ตาราง "เคสรอเกิดรายได้" (staging E-008) — เคสที่ปิดงานแล้วแต่รายได้ยังไม่เกิด พร้อมเหตุผลว่าติดเงื่อนไขไหน
 * อ่านอย่างเดียวจาก `GET /api/finance/revenue-pending` (เกตเดียวกับที่ระบบใช้สร้างรายได้)
 */
export function RevenuePendingPanel({ reloadToken = 0 }: { reloadToken?: number }) {
  const [items, setItems] = useState<RevenuePendingItemDto[] | null>(null)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<RevenuePendingItemDto[]>('/api/finance/revenue-pending')
      if (cancelled) return
      if (result.error !== undefined) {
        setError(result.error)
        setItems([])
        return
      }
      setError(null)
      setItems(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken, retryKey])

  const loading = items === null
  const rows = items ?? []

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">
          เคสรอเกิดรายได้{!loading && error === null && ` (${fmtCount(rows.length)})`}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          เคสที่ปิดงานแล้วแต่รายได้ยังไม่เกิด — ดูว่าติดเงื่อนไขข้อไหน แล้วตามแก้ที่ต้นทาง
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>เลขที่สัญญา / รอบ</Th>
              <Th>บริษัทไฟแนนซ์ / ลูกหนี้</Th>
              <Th>ผลการติดตาม</Th>
              <Th>ปิดงานเมื่อ</Th>
              <Th>ยังไม่เกิดเพราะ</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={5}
            loading={loading}
            error={error === null ? null : { title: error.title, message: error.message }}
            isEmpty={rows.length === 0}
            emptyTitle="ไม่มีเคสที่รอเกิดรายได้"
            emptyDescription="เคสที่ปิดงานแล้วเกิดรายได้ครบทุกเคส"
            onRetry={
              <Button
                variant="secondary"
                onClick={() => {
                  setItems(null)
                  setRetryKey((key) => key + 1)
                }}
              >
                ลองใหม่
              </Button>
            }
          />
          <TBody>
            {!loading &&
              error === null &&
              rows.map((item) => (
                <Tr key={item.caseId}>
                  <Td>
                    <RefText className="font-bold">{item.caseRef}</RefText>
                    <div className="mt-0.5 text-[11px] text-slate-500">รอบที่ {item.trackingRound}</div>
                  </Td>
                  <Td>
                    <div className="text-xs text-slate-700">{item.companyName}</div>
                    <div className="text-[11px] text-slate-500">{item.debtorName ?? '—'}</div>
                  </Td>
                  <Td>
                    <StatusBadge
                      status={item.outcome}
                      group={caseStatusBadgeGroup(item.outcome)}
                      label={caseStatusLabel(item.outcome)}
                    />
                  </Td>
                  <Td className="text-xs text-slate-600">{item.closedAt === null ? '—' : fmtDate(item.closedAt)}</Td>
                  <Td className="text-xs text-amber-700">{item.reasonText}</Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>
    </Card>
  )
}
