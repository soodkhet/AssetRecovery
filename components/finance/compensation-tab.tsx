'use client'

import { useState } from 'react'
import { CalcDetailModal } from '@/components/finance/calc-detail-modal'
import { BulkApproveSummary } from '@/components/finance/bulk-approve-summary'
import { ExpenseDetailModal } from '@/components/finance/expense-detail-modal'
import { useApprovalActions } from '@/components/finance/use-approval-actions'
import { PaymentInfoIncompleteBadge } from '@/components/payees/payment-info-incomplete-badge'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { REASON_MAX } from '@/lib/api/validation'
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
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
  bulkApprovableIds,
  bulkApproveSummary,
  claimRefLabel,
  claimStatusLabel,
  claimTypeLabel,
  expenseRowActions,
  expenseRowHighlight,
  isResubmittedClaim,
  whtAmountLabel,
} from '@/lib/compensation/approval-ui'
import { expenseStatusBadgeGroup } from '@/lib/field/expense-ui'
import { fmtSatangSymbol } from '@/lib/format/money'
import { SubstituteReceiptPanel } from '@/components/substitute-receipts/substitute-receipt-panel'
import { RejectReasonNotes } from '@/components/finance/reject-reason-notes'

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
  const { items, loading, error, reload, isBusy, canApprove, approve, approveMany, reject } =
    useApprovalActions('/api/compensation')
  // mytester F-02 (staging E-045 ฝั่งผู้จัดการ) — เลือกหลายแถวแล้วอนุมัติครั้งเดียว · ตัวช่วยชุดเดียวกับคิวการเงิน
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const approvableIds = bulkApprovableIds(items, canApprove)
  const selectedForApproval = items.filter((item) => approvableIds.includes(item.id) && selected.has(item.id))
  const bulkSummary = bulkApproveSummary(selectedForApproval)
  const allApprovableSelected = approvableIds.length > 0 && selectedForApproval.length === approvableIds.length
  const toggle = (id: string, checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const [formulaTarget, setFormulaTarget] = useState<CompensationApprovalDto | null>(null)
  // มติ PO U152 — กดแถวเห็นหมายเหตุ/คำชี้แจง/ใบเสร็จ/ผู้พักร่วมก่อนอนุมัติ
  const [detailTarget, setDetailTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectTarget, setRejectTarget] = useState<CompensationApprovalDto | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ค่าตอบแทนจากเคส (Compensation) — อนุมัติหลายขั้น</h2>
          <p className="mt-1 text-xs text-slate-500">
            รายการที่ระบบคิดให้จากงานภาคสนาม เดินตามสายอนุมัติของ Approval Matrix
          </p>
        </div>
        {selectedForApproval.length > 0 && (
          <Button size="sm" onClick={() => setBulkConfirmOpen(true)}>
            อนุมัติที่เลือก ({selectedForApproval.length})
          </Button>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <p>ขั้นตอน: รอขั้น 1 (ผู้จัดการ) → รอขั้น 2 (การเงิน) → อนุมัติแล้ว — เกินเพดานเพิ่มขั้นบริหารตาม Approval Matrix</p>
        <p className="mt-1">ตีกลับ: กลับไป “ต้องแก้ไข” แล้วเริ่มขั้น 1 ใหม่ทั้งหมด ไม่ทำต่อจากขั้นที่ตีกลับ</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              {approvableIds.length > 0 && (
                <Th className="w-8">
                  <input
                    type="checkbox"
                    aria-label="เลือกทุกรายการที่อนุมัติได้"
                    checked={allApprovableSelected}
                    onChange={() => setSelected(allApprovableSelected ? new Set() : new Set(approvableIds))}
                    className="focus-ring h-4 w-4 rounded border-slate-300"
                  />
                </Th>
              )}
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
            colSpan={approvableIds.length > 0 ? 7 : 6}
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
                    {approvableIds.length > 0 && (
                      <Td onClick={(event) => event.stopPropagation()}>
                        {approvableIds.includes(item.id) && (
                          <input
                            type="checkbox"
                            aria-label={`เลือก ${item.caseRef ?? item.payeeName}`}
                            checked={selected.has(item.id)}
                            onChange={(event) => toggle(item.id, event.target.checked)}
                            className="focus-ring h-4 w-4 rounded border-slate-300"
                          />
                        )}
                      </Td>
                    )}
                    <Td>
                      {/* เลขเคสไม่ตัดบรรทัดที่ขีด (preship R5-002) */}
                      <p>
                        <RefText className="font-semibold">{claimRefLabel(item)}</RefText>
                      </p>
                      <p className="text-xs text-slate-500">{item.payeeName}</p>
                      {item.agentName !== null && <p className="text-[10px] text-slate-400">ผู้ปฏิบัติงาน: {item.agentName}</p>}
                      {item.payeeInfoIncomplete && (
                        <div className="mt-1">
                          <PaymentInfoIncompleteBadge title="เติมข้อมูลรับเงินในหน้าผู้ใช้งานก่อนถึงรอบจ่าย" />
                        </div>
                      )}
                    </Td>
                    <Td>{claimTypeLabel(item)}</Td>
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
                        label={claimStatusLabel(item)}
                      />
                      <div className="mt-1">
                        <Badge className={approvalStepTone(item.status) === 'neutral' ? undefined : 'bg-white'}>
                          {approvalStepText(item)}
                        </Badge>
                      </div>
                      {/* staging E-045 — ส่งใหม่หลังถูกตีกลับ (mytester F-02 ฝั่งผู้จัดการ) */}
                      {isResubmittedClaim(item) && (
                        <div className="mt-1">
                          <StatusBadge status="resubmitted" group="info" label="ส่งใหม่" />
                        </div>
                      )}
                      <RejectReasonNotes item={item} />
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

      <ConfirmModal
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => {
          setBulkConfirmOpen(false)
          void approveMany(selectedForApproval).then(() => setSelected(new Set()))
        }}
        title={`อนุมัติ ${bulkSummary.count} รายการ`}
        description="ระบบอนุมัติทีละรายการตามขั้นที่รออยู่ — รายการที่อนุมัติไม่ได้จะแจ้งชื่อไว้ ส่วนที่เหลือยังอนุมัติตามปกติ"
        confirmLabel={`ยืนยันอนุมัติ ${bulkSummary.count} รายการ`}
        confirmVariant="primary"
      >
        {/* mytester2 F2-01 — ยอดสุทธิคิดชุดที่เลือกรวมกลุ่มต่อผู้รับแบบรอบจ่าย (server) · ประมาณการ */}
        {bulkConfirmOpen && (
          <BulkApproveSummary ids={selectedForApproval.map((item) => item.id)} grossSatang={bulkSummary.grossSatang} />
        )}
      </ConfirmModal>

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
