'use client'

import { useState } from 'react'
import { CalcDetailModal } from '@/components/finance/calc-detail-modal'
import { ExpenseDetailModal } from '@/components/finance/expense-detail-modal'
import { useApprovalActions } from '@/components/finance/use-approval-actions'
import { PaymentInfoIncompleteBadge } from '@/components/payees/payment-info-incomplete-badge'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { REASON_MAX } from '@/lib/api/validation'
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
  whtAmountLabel,
} from '@/lib/compensation/approval-ui'
import { EXPENSE_STATUS_LABEL, EXPENSE_TYPE_LABEL, expenseStatusBadgeGroup } from '@/lib/field/expense-ui'
import { fmtSatangSymbol } from '@/lib/format/money'
import { SubstituteReceiptPanel } from '@/components/substitute-receipts/substitute-receipt-panel'

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
  const { items, loading, error, reload, isBusy, canApprove, approve, reject } = useApprovalActions('/api/compensation')

  const [formulaTarget, setFormulaTarget] = useState<CompensationApprovalDto | null>(null)
  // มติ PO U152 — กดแถวเห็นหมายเหตุ/คำชี้แจง/ใบเสร็จ/ผู้พักร่วมก่อนอนุมัติ
  const [detailTarget, setDetailTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectTarget, setRejectTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">ค่าตอบแทนจากเคส (Compensation) — อนุมัติหลายขั้น</h2>
        <p className="mt-1 text-xs text-slate-500">
          รายการที่ระบบคิดให้จากงานภาคสนาม เดินตามสายอนุมัติของ Approval Matrix
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <p>ขั้นตอน: รอขั้น 1 (ผู้จัดการ) → รอขั้น 2 (การเงิน) → อนุมัติแล้ว — เกินเพดานเพิ่มขั้นบริหารตาม Approval Matrix</p>
        <p className="mt-1">ตีกลับ: กลับไป “ต้องแก้ไข” แล้วเริ่มขั้น 1 ใหม่ทั้งหมด ไม่ resume จากขั้นที่ตีกลับ</p>
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
            onRetry={() => void reload()}
          />
          <TBody>
            {!loading &&
              error === null &&
              items.map((item) => {
                const actions = expenseRowActions({ status: item.status, canApprove: canApprove && item.viewerCanAct })
                const highlight = expenseRowHighlight(item.status)
                return (
                  <Tr
                    key={item.id}
                    interactive
                    className={highlight ?? undefined}
                    onClick={() => setDetailTarget(item)}
                  >
                    <Td>
                      {/* เลขเคสไม่ตัดบรรทัดที่ขีด (preship R5-002) */}
                      <p>
                        <RefText className="font-semibold">{item.caseRef ?? '— ไม่ผูกเคส'}</RefText>
                      </p>
                      <p className="text-xs text-slate-500">{item.payeeName}</p>
                      {item.agentName !== null && <p className="text-[10px] text-slate-400">ผู้ปฏิบัติงาน: {item.agentName}</p>}
                      {item.payeeInfoIncomplete && (
                        <div className="mt-1">
                          <PaymentInfoIncompleteBadge title="เติมข้อมูลรับเงินในหน้าผู้ใช้งานก่อนถึงรอบจ่าย" />
                        </div>
                      )}
                    </Td>
                    <Td>{EXPENSE_TYPE_LABEL[item.expenseType]}</Td>
                    <Td>
                      {/* สูตรยาวตัดบรรทัดในกรอบ ไม่ดันตารางล้นจนคอลัมน์จัดการหลุดจอที่ 1280 (preship R5-002) */}
                      <p className="max-w-xs min-w-40 font-mono text-xs break-words text-slate-700">{item.basisText}</p>
                      {/* มติ PO U103 — ป้าย "ใบรับรองแทนใบเสร็จ CRT-…" + สถานะฉบับเซ็น (ต้องเซ็นแล้วจึงอนุมัติได้) */}
                      {item.substituteReceipt !== null && (
                        <div onClick={(event) => event.stopPropagation()}>
                          <SubstituteReceiptPanel receipt={item.substituteReceipt} compact />
                        </div>
                      )}
                    </Td>
                    <Td numeric>
                      <p className="font-semibold text-slate-800">{fmtSatangSymbol(item.grossSatang)}</p>
                      <p className="text-[11px] text-slate-500">
                        {whtAmountLabel(item)}: {fmtSatangSymbol(item.whtSatang)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        → Net: <span className="font-semibold text-emerald-700">{fmtSatangSymbol(item.netSatang)}</span>
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
                      <div className="inline-flex flex-col items-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => setDetailTarget(item)}>
                          รายละเอียด
                        </Button>
                        {actions.includes('approve') && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={isBusy(item.id)}
                            onClick={() => void approve(item)}
                          >
                            อนุมัติขั้น {item.approvalStepCurrent}
                          </Button>
                        )}
                        {actions.includes('reject') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBusy(item.id)}
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
      <ExpenseDetailModal item={detailTarget} onClose={() => setDetailTarget(null)} />

      <ReasonConfirmModal
        maxLength={REASON_MAX}
        open={rejectTarget !== null}
        title="ตีกลับรายการเบิกให้แก้ไข"
        description="รายการจะกลับไปสถานะ “ต้องแก้ไข” และเริ่มขั้นอนุมัติที่ 1 ใหม่ทั้งหมด — ใช้กับเอกสาร/ใบเสร็จที่ไม่ถูกต้องเท่านั้น ถ้าสงสัยหลักฐานปิดงาน ต้องแจ้งเจ้าหน้าที่อนุมัติเคส"
        confirmLabel="ตีกลับรายการ"
        loading={rejectTarget !== null && isBusy(rejectTarget.id)}
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
