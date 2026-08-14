'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { FileViewerModal } from '@/components/cases/file-viewer-modal'
import { TeamSuggestionPanel } from '@/components/cases/team-suggestion-panel'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Badge,
  Button,
  ErrorState,
  Field,
  InlineAlert,
  LoadingState,
  Modal,
  RefText,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { DOCUMENT_SLOT_LABEL, type DocumentSlot } from '@/lib/cases/case'
import { caseDetailMode, caseModalActions, showsReasonBox, type CaseActionButton } from '@/lib/cases/case-actions'
import { isImageMime } from '@/lib/cases/document-upload'
import {
  assetTypeLabel,
  caseSourceBadgeClass,
  caseSourceLabel,
  caseStatusBadgeGroup,
  caseStatusLabel,
} from '@/lib/cases/status-display'
import type {
  CaseDetailDto,
  CaseDocumentDto,
  CaseStatusChangeResultDto,
  CaseTeamOptionDto,
  CaseTeamOptionsDto,
} from '@/lib/cases/types'
import { fmtDateTime } from '@/lib/format/datetime'
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
}: {
  open: boolean
  caseId: string | null
  onClose: () => void
  /** เรียกเมื่อสถานะเคสเปลี่ยนสำเร็จ — ผู้เรียกใช้รีโหลดรายการของตัวเอง */
  onChanged?: (detail: CaseDetailDto) => void
}) {
  const { can } = usePermission()
  const { showToast } = useToast()

  const [detail, setDetail] = useState<CaseDetailDto | null>(null)
  const [loadError, setLoadError] = useState<ApiCallError | null>(null)
  const [teamOptions, setTeamOptions] = useState<readonly CaseTeamOptionDto[]>([])

  const [reason, setReason] = useState('')
  const [busyAction, setBusyAction] = useState<CaseActionButton['action'] | null>(null)
  const [actionError, setActionError] = useState<ApiCallError | null>(null)

  const [teamPick, setTeamPick] = useState<CaseTeamOptionDto | null>(null)
  const [teamReason, setTeamReason] = useState('')
  const [chosenTeam, setChosenTeam] = useState<{ id: string; reason: string } | null>(null)

  const [viewing, setViewing] = useState<CaseDocumentDto | null>(null)

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
  }, [open, caseId, load])

  const status = detail?.status ?? ''
  const mode = caseDetailMode(status)
  const actions = detail === null ? [] : caseModalActions(status, (capability) => can('manage', capability))

  async function runAction(button: CaseActionButton): Promise<void> {
    if (detail === null) return
    setActionError(null)
    setBusyAction(button.action)
    try {
      const teamChanged = button.action === 'accept' && chosenTeam !== null
      const response = await callApi<CaseStatusChangeResultDto>(
        apiPath('case.changeStatus', { id: detail.id }),
        jsonRequest('PATCH', {
          action: button.action,
          reason,
          ...(teamChanged ? { teamId: chosenTeam.id, teamChangeReason: chosenTeam.reason } : {}),
        }),
      )

      if (response.error !== undefined || response.data === undefined) {
        setActionError(response.error ?? { title: 'ทำรายการไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }

      showToast({
        tone: button.tone === 'danger' ? 'error' : 'success',
        title: `${button.label}แล้ว`,
        description: `${response.data.case.caseRef} → ${caseStatusLabel(response.data.case.status)}`,
      })
      setDetail(response.data.case)
      setReason('')
      setChosenTeam(null)
      onChanged?.(response.data.case)
      onClose()
    } finally {
      setBusyAction(null)
    }
  }

  const selectedTeamId = chosenTeam?.id ?? detail?.assignedTeamId ?? detail?.suggestedTeamId ?? null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={detail === null ? 'รายละเอียดเคส' : `เคส ${detail.caseRef} · รอบที่ ${detail.trackingRound}`}
        description={
          mode === 'review'
            ? 'ตรวจข้อมูล เอกสาร และทีมที่ระบบเสนอ แล้วตัดสินใจได้ในหน้าเดียว (`38` §7.5)'
            : mode === 'recycle_review'
              ? 'พิจารณาคำขอรีไซเกิล — อนุมัติแล้วเคสจะขึ้นรอบใหม่และกลับเข้าคิวมอบหมายทันที'
              : mode === 'recycle_request'
                ? 'เคสปิดแบบไม่สำเร็จ — ขอรีไซเกิลได้เมื่อไฟแนนซ์ต้องการให้ลองติดตามใหม่'
                : 'ดูรายละเอียดเคส (สถานะนี้แก้ไขจากหน้านี้ไม่ได้)'
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
                onClick={() => void runAction(button)}
              >
                {button.label}
              </Button>
            ))}
          </>
        }
      >
        {loadError !== null ? (
          <ErrorState title={loadError.title} message={loadError.message} />
        ) : detail === null ? (
          <LoadingState message="กำลังโหลดรายละเอียดเคส..." />
        ) : (
          <div className="space-y-5">
            {actionError !== null && (
              <InlineAlert tone="error" title={actionError.title}>
                {actionError.message}
              </InlineAlert>
            )}

            <CaseSummary detail={detail} />

            {/* กล่องประมาณการรายได้ + กล่องทีม อยู่ติดกันตาม §7.5 */}
            <ProjectedRevenueBox detail={detail} />

            <TeamSuggestionPanel
              province={detail.province}
              teams={teamOptions}
              selectedTeamId={selectedTeamId}
              disabled={busyAction !== null}
              onSelect={mode === 'review' ? (team) => {
                setTeamPick(team)
                setTeamReason('')
              } : undefined}
            />

            <ContactSection detail={detail} />

            <DocumentSection detail={detail} onView={setViewing} />

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
                    id="case-review-reason"
                    value={reason}
                    placeholder="ระบุเหตุผลให้ผู้เกี่ยวข้องเข้าใจตรงกัน — ถูกบันทึกลง audit log"
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              </section>
            )}
          </div>
        )}
      </Modal>

      <ReasonConfirmModal
        open={teamPick !== null}
        title={`เปลี่ยนทีมเป็น “${teamPick?.name ?? ''}”`}
        description="การเปลี่ยนทีมจากที่ระบบเสนอถูกบันทึกไว้ในประวัติเคส — ระบุเหตุผลก่อนยืนยัน (`38` §7.4)"
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

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </>
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
        <Row label="IMEI / Serial" value={<span className="font-mono">{detail.assetImeiSerial ?? '—'}</span>} />
        <Row
          label="มูลหนี้คงเหลือ"
          value={<span className="font-mono font-semibold">{fmtSatangSymbol(detail.outstandingDebtSatang)}</span>}
        />
        <Row label="สร้างเมื่อ" value={`${fmtDateTime(detail.createdAt)} · ${detail.createdByName}`} />
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
          ? 'ต้องมีเทมเพลตค่าบริการของบริษัทไฟแนนซ์และมูลหนี้ก่อน'
          : `คำนวณจากโมเดล ${detail.projectedRevenueSource}`}{' '}
        · เป็นประมาณการก่อนรับเคส ไม่ใช่รายได้ที่ยืนยันแล้ว (รายได้จริงเกิดตามไฟล์ 19)
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

function DocumentSection({
  detail,
  onView,
}: {
  detail: CaseDetailDto
  onView: (document: CaseDocumentDto) => void
}) {
  const photos = detail.documents.filter((document) => document.documentType === 'product_photo')

  return (
    <section>
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">เอกสารแนบ</h3>
      <div className="space-y-2">
        {VIEW_SLOTS.map((slot) => {
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
