'use client'

import { useState } from 'react'
import { CostCenterMapModal } from '@/components/accounting/cost-center-map-modal'
import { ExpenseDetailModal } from '@/components/accounting/expense-detail-modal'
import { useExpenseRecords, type ExpenseDocumentFilter } from '@/components/accounting/use-expense-records'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
  FilterGroup,
  InlineAlert,
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
import {
  DOCUMENT_STATUS_GROUP,
  DOCUMENT_STATUS_LABEL,
  MAP_COST_CENTER,
  MAPPING_RULE_LABEL,
} from '@/lib/expenses/expense-record'
import type { ExpenseRecordDto } from '@/lib/expenses/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "ค่าใช้จ่าย" (`32` §8 · mockup `accounting.html` แท็บ `expenses`)
 *
 * ⚠️ ไม่มีปุ่มสร้าง/ลบรายการโดยเจตนา — รายการเกิดจากรอบจ่ายที่ `completed` เท่านั้น (`32` §6.1)
 * ⚠️ ปุ่ม Map Cost Center ขึ้นเฉพาะรายการ `manual` + ผู้ที่มีสิทธิ์ (`32` §11 · API ตรวจซ้ำอีกชั้น)
 */

const DOCUMENT_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'incomplete', label: `เอกสาร${DOCUMENT_STATUS_LABEL.incomplete}` },
  { value: 'complete', label: `เอกสาร${DOCUMENT_STATUS_LABEL.complete}` },
]

export function ExpensesTab() {
  const { can } = usePermission()
  const canMap = can('manage', MAP_COST_CENTER)

  const [documentStatus, setDocumentStatus] = useState<ExpenseDocumentFilter>('all')
  const { data, loading, error, reload } = useExpenseRecords(documentStatus)

  const [mapping, setMapping] = useState<ExpenseRecordDto | null>(null)
  const [viewing, setViewing] = useState<ExpenseRecordDto | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="รายการทั้งหมด" value={fmtCount(data.summary.count)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ยอดจ่ายจริง (Net)" value={fmtSatangSymbol(data.summary.netSatang)} hint="รวมตามตัวกรอง" />
        <StatCard label="หัก ณ ที่จ่ายรวม" value={fmtSatangSymbol(data.summary.whtSatang)} hint="ฐานของใบ 50 ทวิ" />
        <StatCard label="เอกสารไม่ครบ" value={fmtCount(data.summary.incompleteCount)} hint="ตามเก็บก่อนส่งบัญชี" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ค่าใช้จ่ายและรายการจ่าย (Expense Records)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            เกิดอัตโนมัติจากรอบจ่ายเงินที่จ่ายจริงแล้ว (completed) — ไม่ใช่ยอดที่อนุมัติแต่ยังไม่โอน
          </p>
        </div>
        <FilterGroup
          options={DOCUMENT_FILTERS}
          value={documentStatus}
          onChange={(value) => setDocumentStatus(value as ExpenseDocumentFilter)}
        />
      </div>

      {data.summary.unmappedCount > 0 && (
        <InlineAlert tone="warning" title={`ยังไม่ได้ map Cost Center ${fmtCount(data.summary.unmappedCount)} รายการ`}>
          บัญชีต้องเลือกศูนย์ต้นทุนให้ครบก่อนรวมเข้าชุดเอกสารส่งสำนักงานบัญชี (ไฟล์ 30/37)
        </InlineAlert>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>ผู้รับเงิน</Th>
              <Th>ประเภท</Th>
              <Th>วันที่จ่าย</Th>
              <Th numeric>Gross</Th>
              <Th numeric>WHT</Th>
              <Th numeric>Net</Th>
              <Th>Cost Center</Th>
              <Th>เอกสาร</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีรายการค่าใช้จ่ายตามตัวกรองนี้"
            emptyDescription="รายการจะเกิดเองเมื่อรอบจ่ายเงินถูกยืนยันว่าจ่ายจริงแล้ว (ไฟล์ 17)"
            colSpan={9}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id} className={row.documentStatus === 'incomplete' ? 'bg-red-50/30' : undefined}>
                  <Td>
                    <div className="text-sm font-semibold text-slate-900">{row.payeeName}</div>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.payoutBatchName}</p>
                  </Td>
                  <Td className="text-slate-600">{row.category}</Td>
                  <Td className="text-xs text-slate-500">{fmtDate(row.paymentDate)}</Td>
                  <Td numeric className="font-semibold">
                    {fmtSatangSymbol(row.grossSatang)}
                  </Td>
                  <Td numeric className="font-semibold text-rose-600">
                    {row.whtSatang > 0 ? fmtSatangSymbol(row.whtSatang) : '—'}
                  </Td>
                  <Td numeric className="font-bold text-emerald-700">
                    {fmtSatangSymbol(row.netSatang)}
                  </Td>
                  <Td>
                    {row.costCenterLabel === null ? (
                      <span className="text-xs font-semibold text-red-500">ยังไม่ได้ Map</span>
                    ) : (
                      <>
                        <div className="text-xs text-slate-700">{row.costCenterLabel}</div>
                        <p className="text-[10px] text-slate-400">{MAPPING_RULE_LABEL[row.mappingRule]}</p>
                      </>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge
                      status={row.documentStatus}
                      group={DOCUMENT_STATUS_GROUP[row.documentStatus]}
                      label={row.documentStatusLabel}
                    />
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {row.mappingRule === 'manual' && canMap && (
                        <Button size="sm" variant="ghost" onClick={() => setMapping(row)}>
                          Map Cost Center
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setViewing(row)}>
                        ดู
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="หลักการ (ไฟล์ 32)">
        ห้ามแก้ไขยอดเงินโดยตรง — ถ้าต้องแก้ต้องผ่าน Adjustment (ไฟล์ 20) · รายการที่เอกสารไม่ครบจะขึ้นเป็น
        ข้อยกเว้นในแท็บ &ldquo;เอกสารไม่ครบ&rdquo; อัตโนมัติ (ไฟล์ 34)
      </InlineAlert>

      <CostCenterMapModal
        key={`map-${mapping?.id ?? 'none'}`}
        record={mapping}
        costCenters={data.costCenters}
        onClose={() => setMapping(null)}
        onMapped={() => void reload()}
      />

      <ExpenseDetailModal record={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
