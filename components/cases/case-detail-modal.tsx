'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { FieldEvidenceSection } from '@/components/cases/field-evidence-section'
import { FileViewerModal, type ViewableFile } from '@/components/cases/file-viewer-modal'
import { TeamSuggestionPanel } from '@/components/cases/team-suggestion-panel'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { REASON_MAX } from '@/lib/api/validation'
import {
  Badge,
  Button,
  ConfirmModal,
  ErrorState,
  Field,
  InlineAlert,
  LoadingState,
  Modal,
  RefText,
  StatusBadge,
  Textarea,
  useToast,
  type ModalSize,
} from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { countDocuments, DOCUMENT_SLOT_LABEL, documentModeOf, type DocumentSlot } from '@/lib/cases/case'
import { caseDetailMode, caseModalActions, showsReasonBox, type CaseActionButton } from '@/lib/cases/case-actions'
import { isImageMime } from '@/lib/cases/document-upload'
import {
  assetTypeLabel,
  caseReviewNoteNotice,
  caseSourceBadgeClass,
  caseSourceLabel,
  caseStatusBadgeGroup,
  caseStatusLabel,
} from '@/lib/cases/status-display'
import { canRejectFieldEvidence } from '@/lib/field/evidence-review-ui'
import { closeFailReasonText } from '@/lib/field/fail-reasons'
import { FIELD_REJECT_EVIDENCE_CAPABILITY } from '@/lib/field/permissions'
import type { FieldActionResultDto } from '@/lib/field/types'
import type {
  CaseDetailDto,
  CaseDocumentDto,
  CaseStatusChangeResultDto,
  CaseTeamOptionDto,
  CaseTeamOptionsDto,
} from '@/lib/cases/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { debtorDocumentsPurgedText } from '@/lib/settings/data-retention'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * **Case Detail / Review Modal (consolidated — `38` §7.5)**
 * modal เดียวใช้ทั้ง "ดูรายละเอียด" และ "พิจารณาเคส" — พฤติกรรมเปลี่ยนตามสถานะ 4 โหมด
 * (`caseDetailMode()` · ปุ่มมาจาก `caseModalActions()` ซึ่งอ่าน state machine + capability)
 *
 * **shared component** — ไฟล์ 40 (Assignment Modal) และ 41 (3 จุด) ใช้ตัวนี้ซ้ำ
 * เรียกด้วย `caseId` อย่างเดียว (โหลด detail เอง) เพื่อให้โมดูลอื่นไม่ต้องรู้รูปร่าง DTO
 *
 * กติกาที่ผูกไว้:
 * - ปุ่ม/สิทธิ์เป็นแค่ UX — `PATCH /api/cases/:id/status` ตรวจซ้ำทุกครั้ง (DEC-002)
 * - เปลี่ยนทีม **ต้องมีเหตุผล** ก่อนยืนยัน (`38` §7.4) แล้วส่งไปกับ action `accept`
 * - กล่องประมาณการรายได้อยู่ **ติดกับกล่องทีม** และระบุชัดว่าเป็น "ถ้าสำเร็จ" ไม่ใช่รายได้จริง (§7.5)
 */

export function CaseDetailModal({
  open,
  caseId,
  onClose,
  onChanged,
  size = 'lg',
  title,
  description,
  headerSlot,
  extraSection,
  footerActions,
  hideWorkflowActions = false,
}: {
  open: boolean
  caseId: string | null
  onClose: () => void
  /** เรียกเมื่อสถานะเคสเปลี่ยนสำเร็จ — ผู้เรียกใช้รีโหลดรายการของตัวเอง */
  onChanged?: (detail: CaseDetailDto) => void
  size?: ModalSize
  /** แทนหัวเรื่อง/คำอธิบายเริ่มต้น (ไฟล์ 40 เปิด modal นี้ในบริบท "มอบหมายงาน") */
  title?: ReactNode
  description?: ReactNode
  /** กล่องแจ้งเตือนเหนือรายละเอียดเคส (เช่น คำเตือนเรื่องขอความยินยอมของ `40` §7.3) */
  headerSlot?: ReactNode
  /**
   * section ต่อท้ายรายละเอียดเคสภายใน modal เดียวกัน — `40` §7.3 บังคับว่า Agent Picker ต้องอยู่
   * หน้าเดียวกับรายละเอียดเคส (ห้ามสลับ modal/หน้าใหม่)
   */
  extraSection?: ReactNode
  /** ปุ่มของโมดูลผู้เรียก (มอบหมาย/เปลี่ยนผู้รับผิดชอบ) — วางต่อจากปุ่ม "ปิดหน้าต่าง" */
  footerActions?: ReactNode
  /** ซ่อนปุ่ม workflow ของไฟล์ 38 (รับเคส/ไม่รับ/ขอข้อมูลเพิ่ม) เมื่อเปิดจากโมดูลอื่น */
  hideWorkflowActions?: boolean
}) {
  const { can } = usePermission()
  const { showToast } = useToast()

  const [detail, setDetail] = useState<CaseDetailDto | null>(null)
  const [loadError, setLoadError] = useState<ApiCallError | null>(null)
  // ปุ่ม "ลองใหม่" บน ErrorState — เพิ่มตัวนับให้ effect โหลดซ้ำ (R3-027)
  const [retryKey, setRetryKey] = useState(0)
  const [teamOptions, setTeamOptions] = useState<readonly CaseTeamOptionDto[]>([])

  const [reason, setReason] = useState('')
  /** ปุ่ม "ไม่รับเคส" ที่รอยืนยัน (R3-013) */
  const [confirmingReject, setConfirmingReject] = useState<CaseActionButton | null>(null)
  const [busyAction, setBusyAction] = useState<CaseActionButton['action'] | null>(null)
  const [actionError, setActionError] = useState<ApiCallError | null>(null)

  const [teamPick, setTeamPick] = useState<CaseTeamOptionDto | null>(null)
  const [teamReason, setTeamReason] = useState('')
  const [chosenTeam, setChosenTeam] = useState<{ id: string; reason: string } | null>(null)
  // เอกสารชุดเดียว (มติ PO 04/10/2569) — ผู้ตรวจต้องติ๊กยืนยันว่าในชุดมีสัญญา + บัตรประชาชนครบก่อนรับเคส
  const [bundleConfirmed, setBundleConfirmed] = useState(false)
  // error ของการยืนยันเอกสารชุด แสดงติดช่องติ๊ก (ไม่ใช่บนสุดของ modal ที่ผู้ใช้เลื่อนลงมาแล้ว — UAT BUG-142)
  const [bundleError, setBundleError] = useState<string | null>(null)
  const actionErrorRef = useRef<HTMLDivElement>(null)
  const bundleConfirmRef = useRef<HTMLDivElement>(null)

  // error ใด ๆ ที่โผล่ ต้องเลื่อนมาให้เห็นทันที — modal มักถูกเลื่อนลงไปถึงปุ่มด้านล่างแล้ว
  useEffect(() => {
    if (actionError !== null) actionErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [actionError])
  useEffect(() => {
    if (bundleError !== null) bundleConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [bundleError])

  const [viewing, setViewing] = useState<ViewableFile | null>(null)

  // ตีกลับหลักฐานปิดงาน (UAT BUG-045 · `41` §8 `reject_evidence`) — ปุ่มซ่อนเมื่อไม่มีสิทธิ์
  const [rejectEvidenceOpen, setRejectEvidenceOpen] = useState(false)
  const [rejectEvidenceReason, setRejectEvidenceReason] = useState('')
  const [rejectingEvidence, setRejectingEvidence] = useState(false)

  const load = useCallback(async (id: string) => await callApi<CaseDetailDto>(apiPath('case.detail', { id })), [])

  useEffect(() => {
    if (!open || caseId === null) return
    let cancelled = false
    void (async () => {
      const [response, teams] = await Promise.all([
        load(caseId),
        callApi<CaseTeamOptionsDto>(apiPath('case.teamOptions')),
      ])
      if (cancelled) return
      setDetail(response.data ?? null)
      setLoadError(response.error ?? null)
      setTeamOptions(teams.data?.teams ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, caseId, load, retryKey])

  const status = detail?.status ?? ''
  const mode = caseDetailMode(status)
  const actions =
    detail === null || hideWorkflowActions
      ? []
      : caseModalActions(status, (capability) => can('manage', capability))

  async function runAction(button: CaseActionButton): Promise<void> {
    if (detail === null) return
    setActionError(null)
    setBundleError(null)
    setBusyAction(button.action)
    try {
      const teamChanged = button.action === 'accept' && chosenTeam !== null
      const response = await callApi<CaseStatusChangeResultDto>(
        apiPath('case.changeStatus', { id: detail.id }),
        jsonRequest('PATCH', {
          action: button.action,
          reason,
          ...(teamChanged ? { teamId: chosenTeam.id, teamChangeReason: chosenTeam.reason } : {}),
          ...(button.action === 'accept' ? { bundleDocumentsConfirmed: bundleConfirmed } : {}),
        }),
      )

      if (response.error?.code === 'CASE_BUNDLE_CONFIRMATION_REQUIRED') {
        setBundleError(response.error.message)
        return
      }
      if (response.error !== undefined || response.data === undefined) {
        setActionError(response.error ?? { title: 'ทำรายการไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }

      showToast({
        tone: button.tone === 'danger' ? 'error' : 'success',
        title: `${button.label}แล้ว`,
        description: `${response.data.case.caseRef} → ${caseStatusLabel(response.data.case.status)}`,
      })
      // มติ PO U129 — เตือนเท่านั้น (ไม่บล็อก)
      if (response.data.case.activeAssetImeiWarning !== null) {
        showToast({
          tone: 'warning',
          title: 'IMEI ซ้ำกับเครื่องที่ยังไม่ส่งมอบ',
          description: response.data.case.activeAssetImeiWarning,
        })
      }
      setDetail(response.data.case)
      setReason('')
      setChosenTeam(null)
      onChanged?.(response.data.case)
      onClose()
    } finally {
      setBusyAction(null)
    }
  }

  const showRejectEvidence =
    detail !== null &&
    can('manage', FIELD_REJECT_EVIDENCE_CAPABILITY) &&
    canRejectFieldEvidence(detail.fieldEvidence)

  async function rejectEvidence(): Promise<void> {
    if (detail === null) return
    setActionError(null)
    setRejectingEvidence(true)
    try {
      const response = await callApi<FieldActionResultDto>(
        apiPath('case.rejectEvidence', { id: detail.id }),
        jsonRequest('POST', { reason: rejectEvidenceReason }),
      )
      setRejectEvidenceOpen(false)
      if (response.error !== undefined || response.data === undefined) {
        setActionError(response.error ?? { title: 'ตีกลับหลักฐานไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }
      showToast({
        tone: 'success',
        title: 'ตีกลับหลักฐานปิดงานแล้ว',
        description: `${detail.caseRef} — แจ้งพนักงานให้แก้ไขหลักฐานในหน้าติดตามภาคสนามแล้ว`,
      })
      setRejectEvidenceReason('')
      const reloaded = await load(detail.id)
      if (reloaded.data !== undefined) {
        setDetail(reloaded.data)
        onChanged?.(reloaded.data)
      }
    } finally {
      setRejectingEvidence(false)
    }
  }

  const selectedTeamId = chosenTeam?.id ?? detail?.assignedTeamId ?? detail?.suggestedTeamId ?? null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size={size}
        title={
          title ??
          (detail === null ? 'รายละเอียดเคส' : `เคส ${detail.caseRef} · รอบที่ ${detail.trackingRound}`)
        }
        description={
          description ??
          (mode === 'review'
            ? 'ตรวจข้อมูล เอกสาร และทีมที่ระบบเสนอ แล้วตัดสินใจได้ในหน้าเดียว'
            : mode === 'recycle_review'
              ? 'พิจารณาคำขอรีไซเกิล — อนุมัติแล้วเคสจะขึ้นรอบใหม่และกลับเข้าคิวมอบหมายทันที'
              : mode === 'recycle_request'
                ? 'เคสปิดแบบไม่สำเร็จ — ขอรีไซเกิลได้เมื่อไฟแนนซ์ต้องการให้ลองติดตามใหม่'
                : 'ดูรายละเอียดเคส (สถานะนี้แก้ไขจากหน้านี้ไม่ได้)')
        }
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busyAction !== null}>
              ปิดหน้าต่าง
            </Button>
            {actions.map((button) => (
              <Button
                key={button.action}
                variant={button.tone === 'danger' ? 'danger' : button.tone === 'secondary' ? 'secondary' : 'primary'}
                loading={busyAction === button.action}
                disabled={busyAction !== null || (button.reasonRequired && reason.trim() === '')}
                title={button.reasonRequired && reason.trim() === '' ? 'ต้องกรอกเหตุผล/หมายเหตุก่อน' : undefined}
                // "ไม่รับเคส" เป็นสถานะสุดท้าย ย้อนกลับไม่ได้ ⇒ ยืนยันก่อนเสมอ (preship R3-013)
                onClick={() => (button.confirmRequired ? setConfirmingReject(button) : void runAction(button))}
              >
                {button.label}
              </Button>
            ))}
            {showRejectEvidence && (
              <Button
                variant="danger"
                disabled={busyAction !== null || rejectingEvidence}
                onClick={() => {
                  setRejectEvidenceReason('')
                  setRejectEvidenceOpen(true)
                }}
              >
                ตีกลับหลักฐานปิดงาน
              </Button>
            )}
            {footerActions}
          </>
        }
      >
        {loadError !== null ? (
          <ErrorState
            title={loadError.title}
            message={loadError.message}
            onRetry={() => {
              setLoadError(null)
              setRetryKey((key) => key + 1)
            }}
          />
        ) : detail === null ? (
          <LoadingState message="กำลังโหลดรายละเอียดเคส..." />
        ) : (
          <div className="space-y-5">
            {actionError !== null && (
              <div ref={actionErrorRef}>
                <InlineAlert tone="error" title={actionError.title}>
                  {actionError.message}
                </InlineAlert>
              </div>
            )}

            {headerSlot}

            <ReviewNoteAlert detail={detail} />
            <CaseSummary detail={detail} />

            {/* กล่องประมาณการรายได้ + กล่องทีม อยู่ติดกันตาม §7.5 */}
            <ProjectedRevenueBox detail={detail} />

            <TeamSuggestionPanel
              province={detail.province}
              teams={teamOptions}
              selectedTeamId={selectedTeamId}
              disabled={busyAction !== null}
              // ปุ่มเปลี่ยนทีม active เฉพาะตอน pending_review และเฉพาะคนที่กด "รับเคส" ได้จริง (§7.5)
              onSelect={
                actions.some((button) => button.action === 'accept')
                  ? (team) => {
                      setTeamPick(team)
                      setTeamReason('')
                    }
                  : undefined
              }
            />

            <ContactSection detail={detail} />

            <DocumentSection
              detail={detail}
              onView={setViewing}
              bundleConfirmRef={bundleConfirmRef}
              bundleConfirm={
                actions.some((button) => button.action === 'accept')
                  ? {
                      checked: bundleConfirmed,
                      onChange: (checked: boolean) => {
                        setBundleConfirmed(checked)
                        if (checked) setBundleError(null)
                      },
                      disabled: busyAction !== null,
                      error: bundleError,
                    }
                  : undefined
              }
            />

            {detail.fieldEvidence !== null && (
              <FieldEvidenceSection evidence={detail.fieldEvidence} onView={setViewing} />
            )}

            {/* ผู้ไม่เห็นกล่องหลักฐาน (เช่นบริษัทไฟแนนซ์) ยังเห็นเหตุผลที่ไม่สำเร็จ — UAT Q16 */}
            {detail.fieldEvidence === null && detail.closeFailReason !== null && (
              <CloseFailReasonSection reason={detail.closeFailReason} />
            )}

            {detail.recycleHistory.length > 0 && <RecycleHistorySection detail={detail} />}

            {showsReasonBox(status) && (
              <section>
                <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
                  เหตุผล / หมายเหตุ
                </h3>
                <Field
                  id="case-review-reason"
                  label={mode === 'review' ? 'จำเป็นเมื่อไม่รับเคส หรือขอข้อมูลเพิ่ม' : 'จำเป็นสำหรับคำขอ/การไม่อนุมัติรีไซเกิล'}
                >
                  <Textarea
                    maxLength={1000}
                    id="case-review-reason"
                    value={reason}
                    placeholder="ระบุเหตุผลให้ผู้เกี่ยวข้องเข้าใจตรงกัน — ถูกบันทึกลง audit log"
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              </section>
            )}

            {/* ส่วนของโมดูลผู้เรียก — `40` §7.3 วาง Agent Picker ต่อท้ายในหน้าเดียวกัน */}
            {extraSection}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmingReject !== null}
        onClose={() => setConfirmingReject(null)}
        onConfirm={() => {
          const button = confirmingReject
          setConfirmingReject(null)
          if (button !== null) void runAction(button)
        }}
        title={`ไม่รับเคส ${detail?.caseRef ?? ''}`}
        description="เคสจะถูกปิดเป็น “ไม่รับเคส” ทันทีและย้อนกลับไม่ได้ — บริษัทไฟแนนซ์จะเห็นสถานะนี้พร้อมเหตุผล ถ้าต้องการให้แก้ข้อมูลแล้วส่งใหม่ ให้ใช้ “ขอข้อมูลเพิ่ม” แทน"
        confirmLabel="ยืนยันไม่รับเคส"
        confirmVariant="danger"
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="mb-1 font-semibold text-slate-800">เหตุผลที่จะบันทึก</p>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{reason.trim()}</p>
        </div>
      </ConfirmModal>

      <ReasonConfirmModal
        maxLength={REASON_MAX}
        open={teamPick !== null}
        title={`เปลี่ยนทีมเป็น “${teamPick?.name ?? ''}”`}
        description="การเปลี่ยนทีมจากที่ระบบเสนอถูกบันทึกไว้ในประวัติเคส — ระบุเหตุผลก่อนยืนยัน"
        confirmLabel="ยืนยันเปลี่ยนทีม"
        confirmVariant="primary"
        reason={teamReason}
        onReasonChange={setTeamReason}
        onClose={() => setTeamPick(null)}
        onConfirm={() => {
          if (teamPick === null) return
          setChosenTeam({ id: teamPick.id, reason: teamReason })
          setTeamPick(null)
        }}
        placeholder="เช่น ทีมภาคใต้มีคิวเต็ม ให้ทีมภูเก็ตรับแทน"
      />

      <ReasonConfirmModal
        maxLength={1000}
        open={rejectEvidenceOpen}
        title={`ตีกลับหลักฐานปิดงาน — ${detail?.caseRef ?? ''}`}
        description="เคสจะถูกส่งกลับให้พนักงานแก้ไขหลักฐานในหน้าติดตามภาคสนาม — เช็คอินและผลการติดตามล็อกไว้ตามเดิม แก้ได้เฉพาะรูป/วิดีโอ/เสียง/รูปสินค้า"
        confirmLabel="ยืนยันตีกลับ"
        loading={rejectingEvidence}
        reason={rejectEvidenceReason}
        onReasonChange={setRejectEvidenceReason}
        onClose={() => setRejectEvidenceOpen(false)}
        onConfirm={() => void rejectEvidence()}
        placeholder="เช่น รูปหลักฐานไม่ชัด ดูไม่เหมือนสถานที่จริงตามที่อยู่ลูกหนี้ (5–1,000 ตัวอักษร)"
      />

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </>
  )
}

/** เหตุผลขอข้อมูลเพิ่ม/ไม่รับเคสของผู้ตรวจ (staging E-003) — เดิมเห็นเฉพาะในแจ้งเตือน */
function ReviewNoteAlert({ detail }: { detail: CaseDetailDto }) {
  const notice = caseReviewNoteNotice(detail.status, detail.reviewNote)
  if (notice === null) return null
  return (
    <InlineAlert tone={notice.tone} title={notice.title}>
      <p className="whitespace-pre-line">{notice.message}</p>
    </InlineAlert>
  )
}

function CaseSummary({ detail }: { detail: CaseDetailDto }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold text-slate-800">สรุปเคส</h3>
        <StatusBadge group={caseStatusBadgeGroup(detail.status)} label={caseStatusLabel(detail.status)} />
        <Badge className={caseSourceBadgeClass(detail.sourceChannel)}>{caseSourceLabel(detail.sourceChannel)}</Badge>
        <Badge className="bg-slate-100 text-slate-600">รอบที่ {detail.trackingRound}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row label="ลูกหนี้" value={detail.debtorName ?? '—'} />
        <Row label="เลขที่สัญญา" value={<RefText className="font-bold">{detail.caseRef}</RefText>} />
        <Row label="บริษัทไฟแนนซ์" value={detail.financeCompanyName} />
        <Row label="จังหวัด (ที่อยู่ปัจจุบัน)" value={detail.province ?? 'ยังไม่ระบุ'} />
        <Row
          label="ทรัพย์"
          value={`${assetTypeLabel(detail.assetType)} · ${detail.assetBrandModel ?? '—'}`}
        />
        {/* มติ PO U166 — ความจุ/สีตามสัญญา (ข้อความ snapshot บนเคส) */}
        <Row label="ความจุ" value={detail.assetCapacity ?? '—'} />
        <Row label="สี" value={detail.assetColor ?? '—'} />
        <Row
          label="IMEI / Serial"
          value={
            <span>
              <span className="font-mono">{detail.assetImeiSerial ?? '—'}</span>
              {detail.assetIdentifierWarning !== null && (
                <span className="mt-0.5 block text-[11px] font-semibold text-amber-600">
                  {detail.assetIdentifierWarning}
                </span>
              )}
              {/* มติ PO U129 — IMEI ชนเครื่องที่ยังไม่ส่งมอบ: เตือนเท่านั้น (ปิดงานสำเร็จจะถูกบล็อกจนกว่าจะตรวจสอบ) */}
              {detail.activeAssetImeiWarning !== null && (
                <span className="mt-0.5 block text-[11px] font-semibold text-amber-600">
                  {detail.activeAssetImeiWarning}
                </span>
              )}
            </span>
          }
        />
        <Row
          label="มูลหนี้คงเหลือ"
          value={<span className="font-mono font-semibold">{fmtSatangSymbol(detail.outstandingDebtSatang)}</span>}
        />
        <Row label="สร้างเมื่อ" value={`${fmtDateTime(detail.createdAt)} · ${detail.createdByName}`} />
        {detail.closedAt !== null && (
          <Row
            label="ปิดงานเมื่อ"
            value={
              <>
                {fmtDateTime(detail.closedAt)}
                {detail.resubmittedAt !== null && (
                  <span className="block text-xs text-slate-500">
                    ส่งหลักฐานใหม่เมื่อ {fmtDateTime(detail.resubmittedAt)}
                  </span>
                )}
              </>
            }
          />
        )}
      </dl>
    </section>
  )
}

function ProjectedRevenueBox({ detail }: { detail: CaseDetailDto }) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <div className="text-[11px] font-semibold text-sky-700">ประมาณการรายได้ (ถ้าติดตามสำเร็จ)</div>
      <div className="mt-1 font-mono text-lg font-bold text-slate-800">
        {fmtSatangSymbol(detail.projectedRevenueSatang, 'ยังคำนวณไม่ได้')}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {detail.projectedRevenueSource === null
          ? // ระบบคำนวณตอนส่งตรวจสอบ — เคสร่างยังไม่มีผลแม้ข้อมูลครบแล้ว อย่าบอกว่าขาดข้อมูล (staging S-018)
            detail.status === 'draft'
            ? 'ระบบคำนวณให้เมื่อส่งตรวจสอบ (ใช้เทมเพลตค่าบริการของบริษัทไฟแนนซ์และมูลหนี้)'
            : 'ต้องมีเทมเพลตค่าบริการของบริษัทไฟแนนซ์และมูลหนี้ก่อน'
          : `คำนวณจาก${detail.projectedRevenueSourceLabel ?? 'เทมเพลตค่าบริการของบริษัทไฟแนนซ์'}`}{' '}
        · เป็นประมาณการก่อนรับเคส ไม่ใช่รายได้ที่ยืนยันแล้ว (รายได้จริงเกิดเมื่อรายการเบิกอนุมัติและคลังยืนยันส่งมอบ)
      </p>
    </div>
  )
}

function ContactSection({ detail }: { detail: CaseDetailDto }) {
  return (
    <section>
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ช่องทางติดต่อ</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row
          label="มือถือ"
          value={
            detail.debtorPhoneMobile === null ? (
              '—'
            ) : (
              <a className="focus-ring rounded font-mono text-sky-700 underline" href={`tel:${detail.debtorPhoneMobile}`}>
                {detail.debtorPhoneMobile}
              </a>
            )
          }
        />
        <Row label="ที่ทำงาน" value={<span className="font-mono">{detail.debtorPhoneWork ?? '—'}</span>} />
        <Row label="LINE" value={detail.debtorLineId ?? '—'} />
        <Row label="Facebook" value={detail.debtorFacebook ?? '—'} />
      </dl>

      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-slate-600">ผู้ติดต่ออื่น</div>
        {detail.contacts.length === 0 ? (
          <p className="text-xs text-slate-400">ไม่มีผู้ติดต่ออื่น</p>
        ) : (
          <ul className="space-y-1">
            {detail.contacts.map((contact) => (
              <li key={contact.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs">
                <span className="font-semibold text-slate-700">{contact.contactName}</span>
                <span className="text-slate-500"> ({contact.relationship}) · </span>
                <span className="font-mono text-slate-700">{contact.contactPhone ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

const VIEW_SLOTS: readonly DocumentSlot[] = ['contract_doc', 'national_id_doc', 'other_doc']
/** เคสโหมดเอกสารชุด — แสดงชุดก่อน ตามด้วยไฟล์แยกที่อาจมี (ช่องที่ไม่มีไฟล์ของโหมดอื่นไม่ต้องแสดง) */
const BUNDLE_VIEW_SLOTS: readonly DocumentSlot[] = ['bundle_doc', 'other_doc']

function DocumentSection({
  detail,
  onView,
  bundleConfirm,
  bundleConfirmRef,
}: {
  detail: CaseDetailDto
  onView: (document: CaseDocumentDto) => void
  /** มีเมื่อผู้ใช้กด "รับเคส" ได้ — ช่องติ๊กยืนยันเอกสารชุด */
  bundleConfirm?: {
    checked: boolean
    onChange: (checked: boolean) => void
    disabled: boolean
    /** error จาก API (`CASE_BUNDLE_CONFIRMATION_REQUIRED`) — แสดงใต้ช่องติ๊กตรงนี้ */
    error: string | null
  }
  /** กล่องช่องติ๊ก — ผู้เรียกเลื่อนมาที่นี่เมื่อมี error */
  bundleConfirmRef?: RefObject<HTMLDivElement | null>
}) {
  const photos = detail.documents.filter((document) => document.documentType === 'product_photo')
  const isBundle = documentModeOf(countDocuments(detail.documents)) === 'bundle'
  const slots = isBundle ? BUNDLE_VIEW_SLOTS : VIEW_SLOTS
  // ติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว" ตอนรับเคส (มติ PO 04/10/2569 v3.4) — มีผลเฉพาะโหมดแยกประเภท
  const photoInContract = !isBundle && detail.productPhotoInContract

  return (
    <section>
      <h3 className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
        เอกสารแนบ
        {isBundle && <Badge className="bg-sky-50 text-sky-700">เอกสารชุด</Badge>}
        {photoInContract && <Badge className="bg-sky-50 text-sky-700">รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว</Badge>}
      </h3>
      {/* PDPA (มติ PO U97) — ไฟล์เอกสารลูกหนี้ถูกลบโดยงานรายวันเมื่อครบระยะเก็บ · ข้อมูลเคสยังอยู่ครบ */}
      {detail.debtorDocumentsPurgedAt !== null && (
        <div className="mb-3">
          <InlineAlert tone="info" title={debtorDocumentsPurgedText(fmtDate(detail.debtorDocumentsPurgedAt))}>
            ไฟล์สัญญา บัตรประชาชน และเอกสารลูกหนี้ของเคสนี้ถูกลบเมื่อครบระยะเก็บหลังปิดเคส — ข้อมูลเคสและประวัติยังอยู่ครบ
          </InlineAlert>
        </div>
      )}
      {isBundle && bundleConfirm !== undefined && (
        <div ref={bundleConfirmRef} className="mb-3">
          <label
          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs text-amber-900 ${
            bundleConfirm.error !== null ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-600"
            checked={bundleConfirm.checked}
            disabled={bundleConfirm.disabled}
            onChange={(event) => bundleConfirm.onChange(event.target.checked)}
          />
          <span>
            <span className="font-semibold">ตรวจเอกสารชุดแล้ว — ในชุดมีสัญญาเช่าซื้อ/ผ่อนชำระ และบัตรประชาชน/Passport ลูกหนี้ครบ</span>
            <span className="mt-0.5 block text-[11px] text-amber-800">ต้องติ๊กก่อนกด “รับเคส”</span>
          </span>
        </label>
          {bundleConfirm.error !== null && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
              {bundleConfirm.error}
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {slots.map((slot) => {
          const files = detail.documents.filter((document) => document.documentType === slot)
          return (
            <div key={slot} className="rounded-lg border border-slate-200 p-2">
              <div className="text-xs font-semibold text-slate-700">{DOCUMENT_SLOT_LABEL[slot]}</div>
              {files.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-400">ยังไม่มีไฟล์ในหมวดนี้</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {files.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        className="focus-ring w-full rounded px-1 py-0.5 text-left text-xs text-sky-700 underline hover:bg-sky-50"
                        onClick={() => onView(file)}
                      >
                        {isImageMime(file.mimeType) ? '🖼' : '📄'} {file.originalName}
                        <span className="ml-1 text-[10px] text-slate-400">({fmtDateTime(file.uploadedAt)})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-slate-600">รูปสินค้า ({photos.length} รูป)</div>
        {photos.length === 0 ? (
          <p className="text-[11px] text-slate-400">ยังไม่มีรูปสินค้า</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="focus-ring flex aspect-square items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-[10px] text-slate-600 hover:border-slate-400"
                onClick={() => onView(photo)}
              >
                <span className="line-clamp-3 break-all">🖼 {photo.originalName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/** เหตุผลปิดงานไม่สำเร็จของรอบล่าสุด (มติ PO 03/10/2569 — UAT Q16) */
function CloseFailReasonSection({ reason }: { reason: { code: string; detail: string | null } }) {
  return (
    <section data-testid="case-close-fail-reason">
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">เหตุผลที่ติดตามไม่สำเร็จ</h3>
      <p className="text-xs whitespace-pre-wrap text-slate-700">{closeFailReasonText(reason.code, reason.detail)}</p>
    </section>
  )
}

function RecycleHistorySection({ detail }: { detail: CaseDetailDto }) {
  return (
    <section>
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ประวัติรีไซเกิล</h3>
      <ul className="space-y-2">
        {detail.recycleHistory.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            <div className="font-semibold text-slate-700">
              รอบ {entry.previousRound ?? '—'} → {entry.newRound ?? '—'} · {entry.status}
            </div>
            <div className="text-slate-600">หมายเหตุคำขอ: {entry.requestNote}</div>
            {entry.decisionNote !== null && <div className="text-slate-600">ผลการพิจารณา: {entry.decisionNote}</div>}
            <div className="text-[11px] text-slate-400">
              {entry.decidedAt === null
                ? `ยื่นเมื่อ ${fmtDateTime(entry.createdAt)}`
                : `${fmtDateTime(entry.decidedAt)} · ${entry.decidedByName ?? '—'}`}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 pb-1">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-xs text-slate-800">{value}</dd>
    </div>
  )
}
