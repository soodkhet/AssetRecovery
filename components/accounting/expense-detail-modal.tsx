'use client'

import { Button, InlineAlert, Modal, StatusBadge } from '@/components/ui'
import { DOCUMENT_STATUS_GROUP, MAPPING_RULE_LABEL } from '@/lib/expenses/expense-record'
import type { ExpenseRecordDto } from '@/lib/expenses/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "รายละเอียดค่าใช้จ่าย" (`32` §8 · mockup `accounting.html` `expense-detail`) — อ่านอย่างเดียว
 * ทุกช่องเป็น snapshot จากรอบจ่ายจริง แก้ที่นี่ไม่ได้ (`32` §10)
 */
export function ExpenseDetailModal({ record, onClose }: { record: ExpenseRecordDto | null; onClose: () => void }) {
  if (record === null) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`รายละเอียดค่าใช้จ่าย — ${record.payeeName}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div>
            <div className="font-bold text-slate-900">{record.payeeName}</div>
            <div className="text-xs text-slate-500">
              {record.category} · {fmtDate(record.paymentDate)}
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-400">{record.payoutBatchName}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-700">{fmtSatangSymbol(record.netSatang)}</div>
            <div className="text-xs text-slate-400">Net จ่ายจริง</div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 p-4 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Gross:</span>
            <span className="font-mono font-semibold">{fmtSatangSymbol(record.grossSatang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">หัก ณ ที่จ่าย (WHT):</span>
            <span className="font-mono font-semibold text-rose-600">{fmtSatangSymbol(record.whtSatang)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 font-bold">
            <span>Net:</span>
            <span className="font-mono text-emerald-700">{fmtSatangSymbol(record.netSatang)}</span>
          </div>
          <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
            <div className="flex justify-between">
              <span className="text-slate-400">รอบบัญชี:</span>
              <span>{record.periodLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cost Center:</span>
              <span>{record.costCenterLabel ?? '— ยังไม่ได้ Map —'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Mapping Rule:</span>
              <span className="font-bold">{MAPPING_RULE_LABEL[record.mappingRule]}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">เอกสารประกอบ:</span>
              <StatusBadge
                status={record.documentStatus}
                group={DOCUMENT_STATUS_GROUP[record.documentStatus]}
                label={record.documentStatusLabel}
              />
            </div>
          </div>
        </div>

        <InlineAlert tone="info" title="ห้ามแก้ไขยอดเงินในหน้านี้">
          ยอดทั้งหมดเป็นข้อมูลจากรอบจ่ายเงินจริง (ไฟล์ 17) — ถ้าต้องแก้ต้องสร้าง Adjustment ผ่านเมนูการเงิน
          (ไฟล์ 20)
        </InlineAlert>
      </div>
    </Modal>
  )
}
