'use client'

import { useState } from 'react'
import { AgentPicker } from '@/components/assignments/agent-picker'
import { CaseDetailModal } from '@/components/cases/case-detail-modal'
import { Badge, Button, Field, InlineAlert, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import {
  PENDING_REASSIGNMENT_LABEL,
  reassignConfirmLabel,
  reassignWarning,
  teamSideBadgeClass,
  teamSideLabel,
  type AssignmentTarget,
} from '@/lib/assignments/assignment-ui'
import type { AssignmentActionResultDto, TeamAgentDto } from '@/lib/assignments/types'

/**
 * **Assignment Modal (`40` §7.3)** — รายละเอียดเคสเต็ม + Agent Picker ใน modal เดียว
 *
 * ใช้ `<CaseDetailModal>` ของไฟล์ 38 ซ้ำทั้งดุ้น (REUSE_INDEX — ห้ามสร้าง modal รายละเอียดเคสใหม่)
 * แล้วต่อ Agent Picker เข้าทาง `extraSection` + ปุ่มยืนยันทาง `footerActions`
 * ลำดับจากบนลงล่างตาม §7.3: รายละเอียดเคส → เอกสาร/รูปสินค้า → เลือกพนักงาน → ปุ่มยืนยัน
 *
 * สาขาของ reassign (ทันที / ขอความยินยอม) มาจาก `reassignBranchOf()` ผ่าน `reassignConfirmLabel()`
 * — ห้าม if สถานะเองในไฟล์นี้ · ฝั่ง API ตรวจซ้ำทุกครั้ง (DEC-002)
 */

export function AssignmentModal({
  open,
  target,
  onClose,
  onDone,
}: {
  open: boolean
  target: AssignmentTarget | null
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()

  const [agent, setAgent] = useState<TeamAgentDto | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<ApiCallError | null>(null)
  const [busy, setBusy] = useState(false)
  const [peekCaseId, setPeekCaseId] = useState<string | null>(null)

  if (!open || target === null) return null

  const isAssign = target.state === 'ready_to_assign'
  const confirmLabel = isAssign ? 'ยืนยันมอบหมาย' : reassignConfirmLabel(target.state)
  const warning = isAssign ? null : reassignWarning(target.state)
  const reasonRequired = !isAssign
  const blocked = target.hasPendingReassignment

  function close(): void {
    setAgent(null)
    setReason('')
    setError(null)
    onClose()
  }

  async function submit(): Promise<void> {
    if (target === null || agent === null) return
    setError(null)
    setBusy(true)
    try {
      const response = isAssign
        ? await callApi<AssignmentActionResultDto>(
            apiPath('assignment.assign', { id: target.caseId }),
            jsonRequest('POST', { agentId: agent.agentId }),
          )
        : await callApi<AssignmentActionResultDto>(
            apiPath('assignment.reassign', { id: target.caseId }),
            jsonRequest('POST', { agentId: agent.agentId, reason: reason.trim() }),
          )

      if (response.error !== undefined || response.data === undefined) {
        setError(response.error ?? { title: 'ทำรายการไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }

      showToast({
        tone: 'success',
        title: response.data.pendingReassignment === null ? `${confirmLabel}แล้ว` : 'ส่งคำขอแล้ว',
        description:
          response.data.pendingReassignment === null
            ? `${target.caseRef} → ${agent.fullName}`
            : `${target.caseRef} — รอ ${target.agentName ?? 'พนักงานคนเดิม'} ยืนยันก่อนเปลี่ยนเป็น ${agent.fullName}`,
      })
      onDone()
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CaseDetailModal
        open={open}
        caseId={target.caseId}
        size="xl"
        hideWorkflowActions
        title={`${isAssign ? 'มอบหมายงาน' : 'เปลี่ยนผู้รับผิดชอบ'} — ${target.caseRef}`}
        description="ตรวจรายละเอียดเคสและเปรียบเทียบพนักงานในทีมเดียวกันได้ในหน้าเดียว (`40` §7.3)"
        headerSlot={
          <div className="space-y-2">
            {blocked && (
              <InlineAlert tone="warning" title={PENDING_REASSIGNMENT_LABEL}>
                มีคำขอเปลี่ยนผู้รับผิดชอบค้างอยู่ — ต้องรอ {target.agentName ?? 'พนักงานคนเดิม'} ตอบ
                หรือรอหมดเวลาก่อนจึงจะขอเปลี่ยนใหม่ได้
              </InlineAlert>
            )}
            {warning !== null && !blocked && (
              <InlineAlert tone="info" title="เคสนี้รับงานแล้ว — ต้องขอความยินยอมก่อน">
                {warning}
              </InlineAlert>
            )}
            {error !== null && (
              <InlineAlert tone="error" title={error.title}>
                {error.message}
              </InlineAlert>
            )}
          </div>
        }
        extraSection={
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-800">
                {isAssign ? 'เลือกพนักงาน' : 'เลือกพนักงานคนใหม่'}
              </h3>
              {target.teamName !== null && <span className="text-xs text-slate-500">{target.teamName}</span>}
              {target.teamSide !== null && (
                <Badge className={teamSideBadgeClass(target.teamSide)}>{teamSideLabel(target.teamSide)}</Badge>
              )}
            </div>

            {target.teamId === null ? (
              <InlineAlert tone="warning" title="เคสนี้ยังไม่มีทีมที่รับผิดชอบ">
                ต้องยืนยันทีมที่หน้ารับเคสก่อน จึงจะเลือกพนักงานได้ (`40` §11 — เลือกได้เฉพาะคนในทีมของเคส)
              </InlineAlert>
            ) : blocked ? (
              <p className="py-6 text-center text-sm text-slate-400">เลือกพนักงานไม่ได้ขณะมีคำขอค้างอยู่</p>
            ) : (
              <>
                <AgentPicker
                  teamId={target.teamId}
                  selectedAgentId={agent?.agentId ?? null}
                  currentAgentId={target.agentId}
                  disabled={busy}
                  onSelect={setAgent}
                  onPeekCase={setPeekCaseId}
                />

                {reasonRequired && (
                  <div className="mt-4">
                    <Field id="reassign-reason" label="เหตุผลในการเปลี่ยนผู้รับผิดชอบ (จำเป็น)">
                      <Textarea
                        id="reassign-reason"
                        value={reason}
                        placeholder="ระบุเหตุผล — ถูกบันทึกลง audit log และแจ้งพนักงานคนเดิม"
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
          </section>
        }
        footerActions={
          blocked || target.teamId === null ? null : (
            <Button
              loading={busy}
              disabled={busy || agent === null || (reasonRequired && reason.trim() === '')}
              title={
                agent === null
                  ? 'เลือกพนักงานก่อน'
                  : reasonRequired && reason.trim() === ''
                    ? 'ต้องกรอกเหตุผลก่อน'
                    : undefined
              }
              onClick={() => void submit()}
            >
              {confirmLabel}
            </Button>
          )
        }
        onClose={close}
      />

      {/* เคสที่พนักงานถืออยู่ — อ่านอย่างเดียว ไม่มีปุ่ม assign/reassign ซ้อน (`40` §7.3) */}
      <CaseDetailModal
        open={peekCaseId !== null}
        caseId={peekCaseId}
        hideWorkflowActions
        description="ดูอย่างเดียว — เปิดจากรายการเคสที่พนักงานถืออยู่"
        onClose={() => setPeekCaseId(null)}
      />
    </>
  )
}
