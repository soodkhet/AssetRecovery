'use client'

import type { ViewableFile } from '@/components/cases/file-viewer-modal'
import { InlineAlert, StatusBadge } from '@/components/ui'
import type { CaseFieldEvidenceDto } from '@/lib/cases/types'
import { checkinTypeLabel, fieldEvidenceFile } from '@/lib/field/evidence-review-ui'
import { closeFailReasonText } from '@/lib/field/fail-reasons'
import { fieldStatusBadgeGroup, fieldStatusLabel, mapsPointHref } from '@/lib/field/field-ui'
import { FIELD_MEDIA_LABEL, type FieldMediaKind } from '@/lib/field/media-upload'
import { fmtDateTime } from '@/lib/format/datetime'
import type { AssignmentStatus } from '@/lib/generated/prisma/enums'

/**
 * กล่อง "หลักฐานปิดงาน" ในรายละเอียดเคสของเจ้าหน้าที่อนุมัติเคส (UAT BUG-045 · `41` §8/§10.1 ·
 * ตำแหน่งตาม mockup `reference/38-case-submission-mockup.html` — modal รายละเอียดเคส)
 *
 * แสดงชุดหลักฐานล่าสุด (รูป/วิดีโอ/รูปสินค้า/เสียง) + เช็คอินของรอบนั้น — อ่านอย่างเดียว
 * ไฟล์เปิดผ่าน `<FileViewerModal>` ซึ่งขอ signed URL ตอนเปิดทุกครั้ง (bucket ส่วนตัว)
 * ปุ่ม "ตีกลับหลักฐานปิดงาน" อยู่ที่ footer ของ modal ผู้เรียก (ไม่อยู่ในกล่องนี้)
 */
export function FieldEvidenceSection({
  evidence,
  onView,
}: {
  evidence: CaseFieldEvidenceDto
  onView: (file: ViewableFile) => void
}) {
  const groups: ReadonlyArray<{ kind: FieldMediaKind; files: readonly string[] }> = [
    { kind: 'photo', files: evidence.photos },
    { kind: 'video', files: evidence.videos },
    { kind: 'product_photo', files: evidence.productPhotos },
    { kind: 'audio', files: evidence.audioUrl === null ? [] : [evidence.audioUrl] },
  ]
  const status = evidence.assignmentStatus as AssignmentStatus
  const failReason = closeFailReasonText(evidence.failReason, evidence.failReasonDetail)

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold text-slate-800">หลักฐานปิดงาน</h3>
        <StatusBadge group={fieldStatusBadgeGroup(status)} label={fieldStatusLabel(status)} />
      </div>

      <p className="mb-3 text-xs text-slate-600">
        ส่งโดย <span className="font-semibold text-slate-800">{evidence.agentName}</span> · ปิดงานเมื่อ{' '}
        {fmtDateTime(evidence.firstSubmittedAt)}
        {evidence.resubmittedAt !== null && (
          <span className="block" data-testid="evidence-resubmitted-at">
            ส่งหลักฐานใหม่เมื่อ {fmtDateTime(evidence.resubmittedAt)}
          </span>
        )}
      </p>

      {evidence.evidenceStatus === 'approved' && (
        <div className="mb-3" data-testid="evidence-approved">
          <InlineAlert tone="success" title="หลักฐานชุดนี้ผ่านแล้ว">
            {evidence.outcome === 'closed_success'
              ? 'ผ่านอัตโนมัติเมื่อคลังรับเครื่องเข้า — ตีกลับไม่ได้แล้ว'
              : 'ผ่านอัตโนมัติเมื่อค่าตอบแทนของเคสได้รับอนุมัติ — ตีกลับไม่ได้แล้ว'}
            {evidence.reviewedAt !== null && (
              <span className="mt-1 block text-[11px]">{fmtDateTime(evidence.reviewedAt)}</span>
            )}
          </InlineAlert>
        </div>
      )}

      {evidence.evidenceStatus === 'rejected' && evidence.rejectReason !== null && (
        <div className="mb-3">
          <InlineAlert tone="warning" title="หลักฐานชุดนี้ถูกตีกลับแล้ว">
            {evidence.rejectReason}
            {evidence.reviewedAt !== null && (
              <span className="mt-1 block text-[11px]">
                {fmtDateTime(evidence.reviewedAt)} · {evidence.reviewedByName ?? '—'}
              </span>
            )}
          </InlineAlert>
        </div>
      )}

      {failReason !== null && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid="evidence-fail-reason">
          <div className="text-xs font-semibold text-slate-700">เหตุผลที่ไม่สำเร็จ</div>
          <p className="mt-1 text-xs whitespace-pre-wrap text-slate-700">{failReason}</p>
        </div>
      )}

      {evidence.note !== null && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid="evidence-note">
          <div className="text-xs font-semibold text-slate-700">บันทึกเพิ่มเติม</div>
          <p className="mt-1 text-xs whitespace-pre-wrap text-slate-700">{evidence.note}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {groups.map(({ kind, files }) => (
          <div key={kind} className="rounded-lg border border-slate-200 p-2">
            <div className="text-xs font-semibold text-slate-700">
              {FIELD_MEDIA_LABEL[kind]} ({files.length})
            </div>
            {files.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">ไม่มีไฟล์</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {files.map((path) => {
                  const file = fieldEvidenceFile(path, kind)
                  return (
                    <li key={path}>
                      <button
                        type="button"
                        className="focus-ring w-full break-all rounded px-1 py-0.5 text-left text-xs text-sky-700 underline hover:bg-sky-50"
                        onClick={() => onView(file)}
                      >
                        {file.originalName}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-slate-600">เช็คอิน ({evidence.checkins.length} จุด)</div>
        {evidence.checkins.length === 0 ? (
          <p className="text-[11px] text-slate-400">ไม่มีเช็คอิน</p>
        ) : (
          <ul className="space-y-1">
            {evidence.checkins.map((checkin) => (
              <li key={checkin.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-700">
                    {checkinTypeLabel(checkin.checkinType)}
                    {checkin.addressNote !== null && (
                      <span className="font-normal text-slate-500"> · {checkin.addressNote}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500">{fmtDateTime(checkin.checkedInAt)}</span>
                </div>
                {checkin.note !== null && <div className="text-slate-600">{checkin.note}</div>}
                <a
                  className="focus-ring rounded font-mono text-[11px] text-sky-700 underline"
                  href={mapsPointHref(checkin.latitude, checkin.longitude)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {checkin.latitude.toFixed(5)}, {checkin.longitude.toFixed(5)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
