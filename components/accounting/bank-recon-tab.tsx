'use client'

import { useState } from 'react'
import { ImportStatementModal } from '@/components/accounting/import-statement-modal'
import { ManualMatchModal } from '@/components/accounting/manual-match-modal'
import { MatchDetailModal } from '@/components/accounting/match-detail-modal'
import { ResolveUnmatchedModal } from '@/components/accounting/resolve-unmatched-modal'
import { useBankTransactions, type BankStatusFilter } from '@/components/accounting/use-bank-transactions'
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
  BANK_MATCH_STATUS_GROUP,
  BANK_MATCH_STATUS_LABEL,
  MANAGE_BANK_RECONCILIATION,
  isMatched,
} from '@/lib/bank-recon/matching'
import type { BankTransactionDto } from '@/lib/bank-recon/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "กระทบยอด" (`35` §8 · mockup `accounting.html` แท็บ `bank`)
 *
 * ⚠️ ปุ่มขึ้นกับสถานะตาม state machine เดียวกับ API (`23` §6.14) — `unmatched` เท่านั้นที่จับคู่/
 *    ปิดรายการได้ · `unmatched_resolved` เป็น terminal แสดงเป็นข้อความอย่างเดียว
 * ⚠️ สีของ badge มาจาก mapper กลาง (`04` §8.1) ไม่ใช่คลาสสีตรง ๆ
 */

const STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'unmatched', label: BANK_MATCH_STATUS_LABEL.unmatched },
  { value: 'auto_matched', label: BANK_MATCH_STATUS_LABEL.auto_matched },
  { value: 'manual_matched', label: BANK_MATCH_STATUS_LABEL.manual_matched },
  { value: 'unmatched_resolved', label: BANK_MATCH_STATUS_LABEL.unmatched_resolved },
]

export function BankReconTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_BANK_RECONCILIATION)

  const [status, setStatus] = useState<BankStatusFilter>('all')
  const { data, loading, error, reload } = useBankTransactions(status)

  const [importOpen, setImportOpen] = useState(false)
  const [matching, setMatching] = useState<BankTransactionDto | null>(null)
  const [resolving, setResolving] = useState<BankTransactionDto | null>(null)
  const [viewing, setViewing] = useState<BankTransactionDto | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="รายการทั้งหมด" value={fmtCount(data.summary.total)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ยังไม่จับคู่" value={fmtCount(data.summary.unmatched)} hint="ต้องเป็น 0 ก่อนส่งงวด" />
        <StatCard label="เงินเข้ารวม" value={fmtSatangSymbol(data.summary.totalInSatang)} hint="ตามตัวกรอง" />
        <StatCard label="เงินออกรวม" value={fmtSatangSymbol(data.summary.totalOutSatang)} hint="ตามตัวกรอง" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">กระทบยอดธนาคาร (Bank Reconciliation)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ยืนยันว่าเงินที่ระบบบอกว่าควรรับ/จ่าย ตรงกับที่ธนาคารบันทึกจริง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            options={STATUS_FILTERS}
            value={status}
            onChange={(value) => setStatus(value as BankStatusFilter)}
          />
          {canManage && (
            <Button size="sm" onClick={() => setImportOpen(true)}>
              Import Statement
            </Button>
          )}
        </div>
      </div>

      {data.summary.unmatched > 0 && (
        <InlineAlert tone="warning" title={`มี ${fmtCount(data.summary.unmatched)} รายการยังไม่ได้จับคู่`}>
          ต้องจัดการให้ครบ 100% ก่อนส่งงวดบัญชีได้ — จับคู่กับรอบวางบิล/รอบจ่าย หรือปิดรายการพร้อมเหตุผล
          ถ้าไม่ใช่รายรับ-จ่ายของระบบ
        </InlineAlert>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>วันที่</Th>
              <Th>รายละเอียด Statement</Th>
              <Th numeric>เงินเข้า</Th>
              <Th numeric>เงินออก</Th>
              <Th>จับคู่กับ</Th>
              <Th>หมายเหตุ</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีรายการเดินบัญชีตามตัวกรองนี้"
            emptyDescription="กด “Import Statement” เพื่อนำเข้าไฟล์ statement ของบัญชีธนาคารบริษัท"
            colSpan={8}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id} className={row.matchStatus === 'unmatched' ? 'bg-amber-50/40' : undefined}>
                  <Td className="text-xs text-slate-500">{fmtDate(row.transactionDate)}</Td>
                  <Td>
                    <div className="text-sm font-semibold text-slate-900">{row.description}</div>
                    <p className="mt-0.5 text-[10px] text-slate-400">{row.bankAccountLabel}</p>
                  </Td>
                  <Td numeric className="font-bold text-emerald-600">
                    {row.amountSatang > 0 ? `+${fmtSatangSymbol(row.amountSatang)}` : '—'}
                  </Td>
                  <Td numeric className="font-bold text-rose-600">
                    {row.amountSatang < 0 ? `-${fmtSatangSymbol(Math.abs(row.amountSatang))}` : '—'}
                  </Td>
                  <Td className="font-mono text-xs text-slate-600">{row.matchedRef ?? '—'}</Td>
                  <Td className="max-w-[160px] truncate text-xs text-slate-500" title={row.matchNote ?? ''}>
                    {row.matchNote ?? '—'}
                  </Td>
                  <Td>
                    <StatusBadge
                      status={row.matchStatus}
                      group={BANK_MATCH_STATUS_GROUP[row.matchStatus]}
                      label={row.matchStatusLabel}
                    />
                    {row.matchedByName !== null && (
                      <p className="mt-1 text-[10px] text-slate-400">โดย: {row.matchedByName}</p>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {row.matchStatus === 'unmatched' && canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setMatching(row)}>
                            จับคู่ Manual
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setResolving(row)}>
                            ปิดรายการ
                          </Button>
                        </>
                      )}
                      {isMatched(row.matchStatus) && (
                        <Button size="sm" variant="ghost" onClick={() => setViewing(row)}>
                          ดูการจับคู่
                        </Button>
                      )}
                      {row.matchStatus === 'unmatched_resolved' && (
                        <span className="text-[10px] text-slate-400 italic">ปิดรายการแล้ว — ดูเหตุผลที่ช่องหมายเหตุ</span>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="หลักการ (ไฟล์ 35)">
        ระบบจับคู่อัตโนมัติเฉพาะรายการที่ยอดตรงเป๊ะและมีคู่ที่เป็นไปได้<b>เพียงรายการเดียว</b> ·
        จับคู่เองที่ยอดไม่ตรงต้องกรอกหมายเหตุเสมอ · จับคู่สำเร็จ ระบบสร้างเงินรับ (ไฟล์ 31) หรือยืนยัน
        รอบจ่ายเป็น &ldquo;จ่ายแล้ว&rdquo; (ไฟล์ 17) ให้อัตโนมัติ
      </InlineAlert>

      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void reload()} />

      <ManualMatchModal
        key={`match-${matching?.id ?? 'none'}`}
        transaction={matching}
        onClose={() => setMatching(null)}
        onMatched={() => void reload()}
      />

      <ResolveUnmatchedModal
        key={`resolve-${resolving?.id ?? 'none'}`}
        transaction={resolving}
        onClose={() => setResolving(null)}
        onResolved={() => void reload()}
      />

      <MatchDetailModal transaction={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
