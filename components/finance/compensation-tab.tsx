'use client'

import { useState } from 'react'
import { CalcDetailModal } from '@/components/finance/calc-detail-modal'
import { useApprovalActions } from '@/components/finance/use-approval-actions'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Badge,
  Button,
  Card,
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
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import {
  approvalStepText,
  approvalStepTone,
  expenseRowActions,
  expenseRowHighlight,
} from '@/lib/compensation/approval-ui'
import { EXPENSE_STATUS_LABEL, EXPENSE_TYPE_LABEL, expenseStatusBadgeGroup } from '@/lib/field/expense-ui'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "ค่าตอบแทน" (ไฟล์ 16 §8 · mockup `finance.html` แท็บ `comp`)
 *
 * ตาราง: เคส · ทีม/พนักงาน · ประเภท · สูตร/ฐานคิด · Gross/WHT/Net · สถานะ+stepper · ปุ่ม
 * — ปุ่มมาจาก `expenseRowActions()` (state machine `23` §6.3) **ห้าม if สถานะเองใน JSX**
 *
 * ⚠️ ตีกลับ (`reject_expense`) แตะแค่รายการเบิก **ไม่ใช่ `reject_evidence`** ของเจ้าหน้าที่อนุมัติเคส
 * (`16` §6.2 · `41` §10.1 — สองสิทธิ์แยกกันเด็ดขาด) · ข้อความบน modal ต้องสื่อให้ชัด
 */

export function CompensationTab() {
  const { items, loading, error, busyId, canApprove, approve, reject } = useApprovalActions('/api/compensation')

  const [formulaTarget, setFormulaTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectTarget, setRejectTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">ค่าตอบแทนจากเคส (Compensation) — อนุมัติหลายขั้น</h2>
        <p className="mt-1 text-xs text-slate-500">
          รายการที่ระบบคิดให้จากงานภาคสนาม (ไฟล์ 41) เดินตามสายอนุมัติของ Approval Matrix (`13` §6.2)
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <p>ขั้นตอน: รอขั้น 1 (ผู้จัดการ) → รอขั้น 2 (การเงิน) → อนุมัติแล้ว — เกินเพดานเพิ่มขั้นบริหารตาม Approval Matrix</p>
        <p className="mt-1">ตีกลับ: กลับไป “ต้องแก้ไข” แล้วเริ่มขั้น 1 ใหม่ทั้งหมด ไม่ resume จากขั้นที่ตีกลับ (`16` §9)</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>เคส / ผู้รับเงิน</Th>
              <Th>ประเภท</Th>
              <Th>สูตร / ฐานคิด</Th>
              <Th numeric>Gross / WHT / Net</Th>
              <Th>สถานะ / ขั้น</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ยังไม่มีรายการค่าตอบแทน"
            colSpan={6}
          />
          <TBody>
            {!loading &&
              error === null &&
              items.map((item) => {
                const actions = expenseRowActions({ status: item.status, canApprove })
                const highlight = expenseRowHighlight(item.status)
                return (
                  <Tr key={item.id} className={highlight ?? undefined}>
                    <Td>
                      <p className="font-mono text-xs font-semibold text-slate-700">{item.caseRef ?? '— ไม่ผูกเคส'}</p>
                      <p className="text-xs text-slate-500">{item.payeeName}</p>
                      {item.agentName !== null && <p className="text-[10px] text-slate-400">ผู้ปฏิบัติงาน: {item.agentName}</p>}
                    </Td>
                    <Td>{EXPENSE_TYPE_LABEL[item.expenseType]}</Td>
                    <Td>
                      <RefText>{item.basisText}</RefText>
                    </Td>
                    <Td numeric>
                      <p className="font-semibold text-slate-800">{fmtSatangSymbol(item.grossSatang)}</p>
                      <p className="text-[11px] text-slate-500">
                        WHT: {fmtSatangSymbol(item.whtSatang)} → Net:{' '}
                        <span className="font-semibold text-emerald-700">{fmtSatangSymbol(item.netSatang)}</span>
                      </p>
                    </Td>
                    <Td>
                      <StatusBadge
                        status={item.status}
                        group={expenseStatusBadgeGroup(item.status)}
                        label={EXPENSE_STATUS_LABEL[item.status]}
                      />
                      <div className="mt-1">
                        <Badge className={approvalStepTone(item.status) === 'neutral' ? undefined : 'bg-white'}>
                          {approvalStepText(item)}
                        </Badge>
                      </div>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end gap-1">
                        {actions.includes('approve') && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busyId === item.id}
                            onClick={() => void approve(item)}
                          >
                            อนุมัติขั้น {item.approvalStepCurrent}
                          </Button>
                        )}
                        {actions.includes('reject') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectTarget(item)
                              setRejectReason('')
                            }}
                          >
                            ตีกลับ
                          </Button>
                        )}
                        {actions.includes('view_formula') && (
                          <Button size="sm" variant="ghost" onClick={() => setFormulaTarget(item)}>
                            ดูสูตร
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                )
              })}
          </TBody>
        </Table>
      </div>

      <CalcDetailModal item={formulaTarget} onClose={() => setFormulaTarget(null)} />

      <ReasonConfirmModal
        open={rejectTarget !== null}
        title="ตีกลับรายการเบิกให้แก้ไข"
        description="รายการจะกลับไปสถานะ “ต้องแก้ไข” และเริ่มขั้นอนุมัติที่ 1 ใหม่ทั้งหมด — ใช้กับเอกสาร/ใบเสร็จที่ไม่ถูกต้องเท่านั้น ถ้าสงสัยหลักฐานปิดงาน ต้องแจ้งเจ้าหน้าที่อนุมัติเคส (`16` §6.2)"
        confirmLabel="ตีกลับรายการ"
        loading={rejectTarget !== null && busyId === rejectTarget.id}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget === null) return
          void reject(rejectTarget, rejectReason).then((ok) => {
            if (ok) {
              setRejectTarget(null)
              setRejectReason('')
            }
          })
        }}
        placeholder="เช่น ใบเสร็จไม่ชัด ขอให้ถ่ายใหม่"
      />
    </Card>
  )
}
