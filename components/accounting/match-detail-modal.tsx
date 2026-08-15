'use client'

import { Button, Modal, StatusBadge } from '@/components/ui'
import { BANK_MATCH_STATUS_GROUP, MATCH_TARGET_LABEL } from '@/lib/bank-recon/matching'
import type { BankTransactionDto } from '@/lib/bank-recon/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "รายละเอียดการจับคู่" (`35` §8 · mockup `accounting.html` `match-detail`) — อ่านอย่างเดียว
 * Rule 05: ผู้จับคู่ + วันเวลาต้องเห็นได้ ไม่ซ่อนไว้ใน audit อย่างเดียว
 */
export function MatchDetailModal({
  transaction,
  onClose,
}: {
  transaction: BankTransactionDto | null
  onClose: () => void
}) {
  if (transaction === null) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`รายละเอียดการจับคู่ — ${fmtDate(transaction.transactionDate)}`}
      footer={<Button onClick={onClose}>ปิดหน้าต่าง</Button>}
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <div className="font-bold text-slate-900">{transaction.description}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {fmtDate(transaction.transactionDate)} · {transaction.bankAccountLabel}
            </div>
          </div>
          <div className="space-y-1 text-right">
            <div
              className={`text-xl font-bold ${transaction.amountSatang >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {transaction.amountSatang >= 0 ? '+' : '-'}
              {fmtSatangSymbol(Math.abs(transaction.amountSatang))}
            </div>
            <StatusBadge
              status={transaction.matchStatus}
              group={BANK_MATCH_STATUS_GROUP[transaction.matchStatus]}
              label={transaction.matchStatusLabel}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 p-4 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">งวดบัญชี:</span>
            <span className="font-bold">{transaction.periodLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">จับคู่กับประเภท:</span>
            <span className="font-bold">
              {transaction.matchedKind === null ? '—' : MATCH_TARGET_LABEL[transaction.matchedKind]}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">รายการที่จับคู่:</span>
            <span className="font-mono font-bold">{transaction.matchedRef ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ผู้ทำรายการ:</span>
            <span className="font-bold">
              {transaction.matchedByName ?? '—'}
              {transaction.matchedAt !== null && ` · ${fmtDateTime(transaction.matchedAt)}`}
            </span>
          </div>
          {transaction.matchNote !== null && (
            <div className="mt-1 border-t border-slate-100 pt-2">
              <span className="text-slate-400">หมายเหตุ:</span>
              <div className="mt-1 text-slate-700">{transaction.matchNote}</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
