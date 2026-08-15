'use client'

import { useArAging } from '@/components/finance/use-billing'
import { Card, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * มุมมองอายุหนี้ (AR Aging) ของ `19` §6.4 — ช่วงอายุมาจาก `finance_policy_settings.ar_aging_buckets`
 * (`13` §6.2.1) ที่ backend คำนวณให้แล้ว (`22` §6.11) — **หน้าจอห้ามคิดช่วง/ยอดเอง** (Rule 01)
 */
export function ArAgingPanel({ companyId }: { companyId: string }) {
  const { data, loading, error } = useArAging(companyId)
  const bucketLabels = data.buckets.map((bucket) => bucket.label)

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">อายุหนี้คงค้าง (AR Aging)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          นับจากวันครบกำหนดชำระถึงวันที่ {data.asOf === '' ? '—' : fmtDate(data.asOf)} · รวมเฉพาะรอบที่ส่งบิลแล้ว
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>บริษัทไฟแนนซ์</Th>
              {bucketLabels.map((label) => (
                <Th key={label} numeric>
                  {label}
                </Th>
              ))}
              <Th numeric>รวมค้างรับ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.companies.length === 0}
            emptyTitle="ไม่มียอดค้างรับ"
            emptyDescription="ทุกรอบวางบิลที่ส่งแล้วได้รับชำระครบ"
            colSpan={bucketLabels.length + 2}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.companies.map((company) => (
                <Tr key={company.companyId}>
                  <Td className="font-semibold text-slate-900">{company.companyName}</Td>
                  {company.buckets.map((bucket) => (
                    <Td key={bucket.label} numeric className={bucket.outstandingSatang > 0 ? 'text-red-600' : undefined}>
                      {fmtSatangSymbol(bucket.outstandingSatang)}
                      <span className="ml-1 text-[10px] text-slate-400">({fmtCount(bucket.batchCount)})</span>
                    </Td>
                  ))}
                  <Td numeric className="font-bold text-red-600">
                    {fmtSatangSymbol(company.outstandingSatang)}
                  </Td>
                </Tr>
              ))}
            {!loading && error === null && data.companies.length > 0 && (
              <Tr>
                <Td className="font-bold text-slate-900">รวมทุกบริษัท</Td>
                {data.buckets.map((bucket) => (
                  <Td key={bucket.label} numeric className="font-semibold">
                    {fmtSatangSymbol(bucket.outstandingSatang)}
                  </Td>
                ))}
                <Td numeric className="text-base font-bold text-red-600">
                  {fmtSatangSymbol(data.totalOutstandingSatang)}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  )
}
