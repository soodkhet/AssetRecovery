'use client'

import { useState } from 'react'
import { kpiValue } from '@/components/ui/kpi-value'
import { ImportStatementModal } from '@/components/accounting/import-statement-modal'
import { ManualMatchModal } from '@/components/accounting/manual-match-modal'
import { MatchDetailModal } from '@/components/accounting/match-detail-modal'
import { MatchProposalsPanel } from '@/components/accounting/match-proposals-panel'
import { ResolveUnmatchedModal } from '@/components/accounting/resolve-unmatched-modal'
import { SuspenseModal } from '@/components/accounting/suspense-modal'
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
  canMoveToSuspense,
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
 * มติ PO U41: เงินเข้าไม่ทราบที่มา ⇒ "เงินรับรอตรวจสอบ" (ไม่สร้างเงินรับ/ไม่ลดยอดค้าง) → จับคู่ภายหลัง หรือคืนเงินผู้โอน
 */

const STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'unmatched', label: BANK_MATCH_STATUS_LABEL.unmatched },
  { value: 'auto_matched', label: BANK_MATCH_STATUS_LABEL.auto_matched },
  { value: 'manual_matched', label: BANK_MATCH_STATUS_LABEL.manual_matched },
  { value: 'unmatched_resolved', label: BANK_MATCH_STATUS_LABEL.unmatched_resolved },
  { value: 'suspense', label: BANK_MATCH_STATUS_LABEL.suspense },
  { value: 'suspense_refunded', label: BANK_MATCH_STATUS_LABEL.suspense_refunded },
]

export function BankReconTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_BANK_RECONCILIATION)

  const [status, setStatus] = useState<BankStatusFilter>('all')
  const { data, loading, error, reload } = useBankTransactions(status)
  // ระหว่างโหลด/โหลดไม่สำเร็จ KPI = "—" ไม่ใช่ ฿0.00/0 ที่อ่านเหมือนไม่มียอด (preship R2-007)
  const ready = !loading && error === null
  // คู่ที่ระบบเสนอ (มติ PO U137) โหลดใหม่ทุกครั้งที่รายการเดินบัญชีเปลี่ยน
  const [proposalsVersion, setProposalsVersion] = useState(0)
  function refresh(): void {
    void reload()
    setProposalsVersion((version) => version + 1)
  }

  const [importOpen, setImportOpen] = useState(false)
  const [matching, setMatching] = useState<BankTransactionDto | null>(null)
  const [resolving, setResolving] = useState<BankTransactionDto | null>(null)
  const [viewing, setViewing] = useState<BankTransactionDto | null>(null)
  const [suspending, setSuspending] = useState<BankTransactionDto | null>(null)
  const [refunding, setRefunding] = useState<BankTransactionDto | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <StatCard label="รายการทั้งหมด" value={kpiValue(ready ? data.summary.total : null, fmtCount)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ยังไม่จับคู่" value={kpiValue(ready ? data.summary.unmatched : null, fmtCount)} hint="ต้องเป็น 0 ก่อนส่งงวด" />
        <StatCard
          label="เงินรับรอตรวจสอบคงค้าง"
          value={kpiValue(ready ? data.summary.suspenseOutstandingSatang : null, fmtSatangSymbol)}
          hint={`${kpiValue(ready ? data.summary.suspenseOutstandingCount : null, fmtCount)} รายการ · ทุกงวด`}
        />
        <StatCard label="เงินเข้ารวม" value={kpiValue(ready ? data.summary.totalInSatang : null, fmtSatangSymbol)} hint="ตามตัวกรอง" />
        <StatCard label="เงินออกรวม" value={kpiValue(ready ? data.summary.totalOutSatang : null, fmtSatangSymbol)} hint="ตามตัวกรอง" />
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

      {data.summary.suspenseOutstandingCount > 0 && (
        <InlineAlert
          tone="info"
          title={`มีเงินรับรอตรวจสอบคงค้าง ${fmtCount(data.summary.suspenseOutstandingCount)} รายการ (${fmtSatangSymbol(data.summary.suspenseOutstandingSatang)})`}
        >
          ยังไม่รับรู้เป็นรายได้และไม่ลดยอดค้างชำระ — ทราบที่มาแล้วให้จับคู่กับรอบวางบิล หรือบันทึกคืนเงินผู้โอน ·
          ปิดงวดได้ แต่ระบบจะแสดงเตือนยอดคงค้างนี้
        </InlineAlert>
      )}

      <MatchProposalsPanel canManage={canManage} version={proposalsVersion} onMatched={() => void reload()} />

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
            onRetry={() => void reload()}
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
                  {/* เลขรอบจ่าย/เอกสารไม่ตัดบรรทัดที่ขีด (preship R5-002) */}
                  <Td className="font-mono text-xs whitespace-nowrap text-slate-600">{row.matchedRef ?? '—'}</Td>
                  <Td
                    className="max-w-[160px] truncate text-xs text-slate-500"
                    title={row.matchNote ?? row.refundNote ?? row.suspenseNote ?? ''}
                  >
                    {row.matchStatus === 'suspense_refunded'
                      ? `คืนเงิน ${fmtDate(row.refundDate)} — ${row.refundNote ?? ''}`
                      : (row.matchNote ?? row.suspenseNote ?? '—')}
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
                    {row.matchStatus === 'suspense' && row.suspendedAt !== null && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        รอตรวจสอบตั้งแต่ {fmtDate(row.suspendedAt)}
                        {row.suspendedByName !== null ? ` · ${row.suspendedByName}` : ''}
                      </p>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {row.matchStatus === 'unmatched' && canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setMatching(row)}>
                            จับคู่ Manual
                          </Button>
                          {canMoveToSuspense(row.matchStatus, row.amountSatang) && (
                            <Button size="sm" variant="ghost" onClick={() => setSuspending(row)}>
                              เงินรอตรวจสอบ
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setResolving(row)}>
                            ปิดรายการ
                          </Button>
                        </>
                      )}
                      {row.matchStatus === 'suspense' && canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setMatching(row)}>
                            จับคู่ Manual
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRefunding(row)}>
                            คืนเงินผู้โอน
                          </Button>
                        </>
                      )}
                      {row.matchStatus === 'suspense_refunded' && (
                        <span className="text-[10px] text-slate-400 italic">คืนเงินผู้โอนแล้ว</span>
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

      <InlineAlert tone="info" title="หลักการ">
        ระบบจับคู่อัตโนมัติเฉพาะรายการที่ยอดตรงเป๊ะและมีคู่ที่เป็นไปได้<b>เพียงรายการเดียว</b> ·
        จับคู่เองที่ยอดไม่ตรงต้องกรอกหมายเหตุเสมอ · จับคู่สำเร็จ ระบบสร้างเงินรับ หรือยืนยัน
        รอบจ่ายเป็น &ldquo;จ่ายแล้ว&rdquo; ให้อัตโนมัติ
      </InlineAlert>

      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refresh} />

      <ManualMatchModal
        key={`match-${matching?.id ?? 'none'}`}
        transaction={matching}
        onClose={() => setMatching(null)}
        onMatched={refresh}
      />

      <ResolveUnmatchedModal
        key={`resolve-${resolving?.id ?? 'none'}`}
        transaction={resolving}
        onClose={() => setResolving(null)}
        onResolved={refresh}
      />

      <MatchDetailModal transaction={viewing} onClose={() => setViewing(null)} />

      <SuspenseModal
        key={`suspend-${suspending?.id ?? 'none'}`}
        transaction={suspending}
        mode="suspend"
        onClose={() => setSuspending(null)}
        onDone={refresh}
      />

      <SuspenseModal
        key={`refund-${refunding?.id ?? 'none'}`}
        transaction={refunding}
        mode="refund"
        onClose={() => setRefunding(null)}
        onDone={refresh}
      />
    </div>
  )
}
