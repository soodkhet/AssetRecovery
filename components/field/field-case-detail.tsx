'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { FileViewerModal, type ViewableFile } from '@/components/cases/file-viewer-modal'
import { IconFile, IconImage, IconMapPin, IconPhone, IconUser } from '@/components/field/field-icons'
import { Button, ErrorState, LoadingState, Modal, RefText, StatusBadge } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import {
  assetSummary,
  facebookHref,
  fieldStatusBadgeGroup,
  fieldStatusLabel,
  formatFieldAddress,
  lineHref,
  mapsSearchHref,
  telHref,
} from '@/lib/field/field-ui'
import type { FieldActionResultDto, FieldAddressDto, FieldCaseDetailDto } from '@/lib/field/types'

/**
 * **Case Detail ของ Field Tracker (`41` §7.7)** — เนื้อหาเดียวใช้ซ้ำ **3 ที่**:
 * modal ดูรายละเอียด · ใต้ปฏิทินเลือกวันที่ (§7.4) · กล่องคำขอเปลี่ยนผู้รับผิดชอบ (§7.8 — Phase 2.11)
 *
 * ⚠️ **ทำไมไม่ใช้ `<CaseDetailModal>` ของไฟล์ 38 ซ้ำ**: modal ตัวนั้นโหลดข้อมูลเองจาก
 * `GET /api/cases/:id` + `/api/cases/team-options` ซึ่งบังคับ capability ชุดของงานรับเคส
 * (`CASE_READ_CAPABILITIES`) — พนักงานภาคสนามถือ `perform_field_work` ตัวเดียว (`41` §13)
 * จึงได้ 403 ทุกครั้ง · ฝั่ง BE จึงมี `GET /api/field/cases/:id` ที่คืน `FieldCaseDetailDto`
 * (คอมมิชชั่น/เช็คอิน/คำขอเปลี่ยนผู้รับผิดชอบ) ซึ่งไฟล์ 38 ไม่มี — ตัวเปิดไฟล์ยังใช้
 * `<FileViewerModal>` ตัวเดิมร่วมกัน
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 text-xs font-bold text-slate-600">{title}</div>
      {children}
    </div>
  )
}

function AddressBlock({ label, address }: { label: string; address: FieldAddressDto }) {
  const full = formatFieldAddress(address)
  const maps = mapsSearchHref(address)

  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0">
      <div className="mb-1 text-xs font-bold text-slate-500">{label}</div>
      {full === null ? (
        <div className="text-sm text-slate-400 italic">— ไม่มีข้อมูล —</div>
      ) : (
        <>
          <div className="mb-1.5 text-sm font-semibold text-slate-800">{full}</div>
          {maps !== null && (
            <a
              href={maps}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-600"
            >
              <IconMapPin className="h-4 w-4" /> เปิด Google Maps
            </a>
          )}
        </>
      )}
    </div>
  )
}

function ContactLink({ icon, label, value, href }: { icon: ReactNode; label: string; value: string; href: string }) {
  return (
    <a
      href={href}
      target={href.startsWith('tel:') ? undefined : '_blank'}
      rel="noreferrer"
      className="focus-ring flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      {icon}
      <span className="font-semibold">{label}:</span>
      <span className="font-bold text-blue-600">{value}</span>
    </a>
  )
}

function FileRow({ file, onOpen }: { file: ViewableFile; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
    >
      <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="truncate font-semibold">{file.originalName}</span>
    </button>
  )
}

/** เนื้อหารายละเอียดเคสแบบเต็ม — ไม่มี modal ครอบ เพื่อให้ฝังใต้ปฏิทิน/ในกล่องอื่นได้ (`41` §7.7) */
export function FieldCaseDetailBody({
  detail,
  onRespondReassignment,
}: {
  detail: FieldCaseDetailDto
  /** ปุ่ม "ตอบคำขอนี้" ของกล่องม่วง (`41` §7.8 — ฟอร์มตอบจริงอยู่ Phase 2.11) */
  onRespondReassignment?: (detail: FieldCaseDetailDto) => void
}) {
  const [viewing, setViewing] = useState<ViewableFile | null>(null)

  const mobileHref = telHref(detail.debtorPhoneMobile)
  const workHref = telHref(detail.debtorPhoneWork)
  const line = lineHref(detail.debtorLineId)
  const facebook = facebookHref(detail.debtorFacebook)

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold text-slate-900">{detail.debtorName ?? '—'}</div>
            <div className="mt-0.5 text-xs text-slate-400">
              <RefText>{detail.caseRef}</RefText> · {detail.companyName}
            </div>
          </div>
          <StatusBadge status={fieldStatusLabel(detail.status)} group={fieldStatusBadgeGroup(detail.status)} />
        </div>
        <div className="mt-1.5 text-xs text-slate-400">
          รอบที่ติดตาม: <span className="font-bold text-slate-600">รอบที่ {detail.trackingRound}</span>
          {detail.teamName !== null && <> · ทีม {detail.teamName}</>}
        </div>
      </div>

      {detail.pendingReassignment !== null && (
        <div className="rounded-xl border-2 border-purple-300 bg-purple-50 p-3.5">
          <div className="mb-1.5 text-sm font-extrabold text-purple-700">มีคำขอเปลี่ยนผู้รับผิดชอบรออยู่</div>
          <div className="text-sm text-purple-700">
            <strong>{detail.pendingReassignment.requestedByName}</strong> ขอเปลี่ยนเป็น{' '}
            <strong>{detail.pendingReassignment.newAgentName}</strong>
          </div>
          <div className="mt-1 text-sm text-purple-700">เหตุผล: {detail.pendingReassignment.reason}</div>
          <div className="mt-1.5 text-xs text-purple-500">
            หมดเขตตอบ {fmtDateTime(detail.pendingReassignment.expiresAt)}
          </div>
          {onRespondReassignment !== undefined && (
            <button
              type="button"
              onClick={() => onRespondReassignment(detail)}
              className="focus-ring mt-3 w-full rounded-xl bg-purple-600 py-3 text-sm font-extrabold text-white hover:bg-purple-700"
            >
              ตอบคำขอนี้
            </button>
          )}
        </div>
      )}

      {/* กล่องคอมมิชชั่น — เฉพาะตอนยังไม่รับงาน (`41` §7.7) ยอดตายตัวจากแผนค่าตอบแทนของทีม */}
      {detail.status === 'pending_accept' && detail.commissionSatang !== null && (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3.5">
          <div>
            <div className="text-xs font-extrabold text-emerald-700">จะได้รับ (ถ้าจบงานสำเร็จ)</div>
            <div className="mt-0.5 text-[11px] text-emerald-600">
              ค่าคอมมิชชั่นของทีม — ไม่รวมค่าน้ำมัน/เบี้ยเลี้ยง/ที่พัก
            </div>
          </div>
          <div className="font-mono text-xl font-extrabold whitespace-nowrap text-emerald-700">
            {fmtSatangSymbol(detail.commissionSatang)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="mb-0.5 text-xs text-slate-400">เลขบัตรประชาชน</div>
          <div className="font-mono text-sm font-bold text-slate-800">
            {detail.debtorNationalId ?? detail.debtorPassportNo ?? '—'}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="mb-0.5 text-xs text-slate-400">มูลหนี้คงเหลือ</div>
          <div className="font-mono text-sm font-extrabold text-slate-900">
            {detail.debtAmountSatang === null ? '—' : fmtSatangSymbol(detail.debtAmountSatang)}
          </div>
        </div>
        <div className="col-span-2 rounded-xl bg-slate-50 p-3">
          <div className="mb-0.5 text-xs text-slate-400">ทรัพย์</div>
          <div className="text-sm font-bold text-slate-800">
            {assetSummary({
              assetDescription: detail.assetDescription,
              imei: detail.imei,
              serialNo: detail.serialNo,
            })}
          </div>
        </div>
      </div>

      <Section title="ที่อยู่ทั้งหมด">
        <AddressBlock label="ที่อยู่ปัจจุบัน" address={detail.currentAddress} />
        <AddressBlock label="ที่ทำงาน" address={detail.workAddress} />
        <AddressBlock label="ตามบัตรประชาชน" address={detail.idCardAddress} />
      </Section>

      <Section title="ช่องทางติดต่อลูกหนี้ — แตะเพื่อติดต่อ">
        <div className="space-y-1">
          {mobileHref !== null && (
            <ContactLink
              icon={<IconPhone className="h-4 w-4 text-slate-400" />}
              label="มือถือ"
              value={detail.debtorPhoneMobile ?? ''}
              href={mobileHref}
            />
          )}
          {workHref !== null && (
            <ContactLink
              icon={<IconPhone className="h-4 w-4 text-slate-400" />}
              label="ที่ทำงาน"
              value={detail.debtorPhoneWork ?? ''}
              href={workHref}
            />
          )}
          {line !== null && (
            <ContactLink icon={<span aria-hidden="true">💬</span>} label="LINE" value={detail.debtorLineId ?? ''} href={line} />
          )}
          {facebook !== null && (
            <ContactLink
              icon={<span aria-hidden="true">📘</span>}
              label="Facebook"
              value={detail.debtorFacebook ?? ''}
              href={facebook}
            />
          )}
          {mobileHref === null && workHref === null && line === null && facebook === null && (
            <div className="text-sm text-slate-400 italic">— ไม่มีช่องทางติดต่อ —</div>
          )}
        </div>
      </Section>

      {detail.contacts.length > 0 && (
        <Section title={`ผู้ติดต่ออื่น (${detail.contacts.length} คน)`}>
          <div className="space-y-1">
            {detail.contacts.map((contact) => {
              const href = telHref(contact.phone)
              const name = (
                <span>
                  <span className="font-bold">{contact.contactName}</span>{' '}
                  <span className="text-slate-400">({contact.relation})</span>
                </span>
              )
              return href === null ? (
                <div key={contact.id} className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700">
                  <IconUser className="h-4 w-4 text-slate-400" />
                  {name}
                </div>
              ) : (
                <a
                  key={contact.id}
                  href={href}
                  className="focus-ring flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {name}
                  <span className="font-mono font-bold text-blue-600">{contact.phone}</span>
                </a>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="เอกสารแนบ — แตะเพื่อเปิดดู">
        <div className="space-y-1">
          {detail.documents.length === 0 ? (
            <div className="text-sm text-slate-400 italic">— ไม่มีเอกสารแนบ —</div>
          ) : (
            detail.documents.map((file) => (
              <FileRow key={file.id} file={file} onOpen={() => setViewing(file)} />
            ))
          )}
        </div>
      </Section>

      <Section title={`รูปสินค้า (${detail.productPhotos.length}) — แตะเพื่อดูภาพขยาย`}>
        {detail.productPhotos.length === 0 ? (
          <div className="text-sm text-slate-400 italic">— ไม่มีรูปสินค้า —</div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {detail.productPhotos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setViewing(photo)}
                title={photo.originalName}
                className="focus-ring flex aspect-square items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-200"
              >
                <IconImage className="h-5 w-5" />
              </button>
            ))}
          </div>
        )}
      </Section>

      {detail.checkins.length > 0 && (
        <Section title={`จุดเช็คอิน (${detail.checkins.length})`}>
          <div className="space-y-1">
            {detail.checkins.map((checkin) => (
              <div key={checkin.id} className="flex items-center justify-between gap-2 px-2 py-2 text-sm">
                <span className="truncate text-slate-700">{checkin.addressNote ?? checkin.checkinType}</span>
                <span className="text-xs whitespace-nowrap text-slate-400">{fmtDateTime(checkin.checkedInAt)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {detail.rejectReason !== null && (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3.5">
          <div className="text-sm font-extrabold text-orange-700">หลักฐานถูกตีกลับ — ต้องแก้ไข</div>
          <div className="mt-1 text-sm text-orange-700">เหตุผล: {detail.rejectReason}</div>
        </div>
      )}

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

/** modal ห่อ {@link FieldCaseDetailBody} — โหลดเองด้วย `GET /api/field/cases/:id` (`41` §7.7) */
export function FieldCaseDetailModal({
  open,
  caseId,
  onClose,
  onChanged,
  onRespondReassignment,
  footerActions,
}: {
  open: boolean
  caseId: string | null
  onClose: () => void
  /** เรียกหลังรับงานสำเร็จ — ผู้เรียกรีโหลดรายการของตัวเอง */
  onChanged?: () => void
  onRespondReassignment?: (detail: FieldCaseDetailDto) => void
  footerActions?: ReactNode
}) {
  // ผูกผลลัพธ์ไว้กับ `caseId` ที่โหลดมา — เปิดเคสใหม่จึงไม่เห็นข้อมูลเคสเก่าค้าง โดยไม่ต้อง setState ใน effect
  const [loaded, setLoaded] = useState<{ caseId: string; detail?: FieldCaseDetailDto; error?: ApiCallError } | null>(
    null,
  )
  const [accepting, setAccepting] = useState(false)
  const [actionError, setActionError] = useState<ApiCallError | null>(null)

  useEffect(() => {
    if (!open || caseId === null) return
    let cancelled = false
    void (async () => {
      const response = await callApi<FieldCaseDetailDto>(apiPath('field.caseDetail', { id: caseId }))
      if (cancelled) return
      setLoaded({ caseId, detail: response.data, error: response.error })
    })()
    return () => {
      cancelled = true
    }
  }, [open, caseId])

  const current = loaded !== null && loaded.caseId === caseId ? loaded : null
  const detail = current?.detail ?? null
  const loadError = current?.error ?? null

  const accept = useCallback(async () => {
    if (detail === null) return
    setAccepting(true)
    setActionError(null)
    try {
      const response = await callApi<FieldActionResultDto>(
        apiPath('field.acceptCase', { id: detail.caseId }),
        jsonRequest('POST', {}),
      )
      if (response.error !== undefined) {
        setActionError(response.error)
        return
      }
      onChanged?.()
      onClose()
    } finally {
      setAccepting(false)
    }
  }, [detail, onChanged, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="รายละเอียดเคส"
      description={detail === null ? undefined : `${detail.caseRef} · รอบที่ ${detail.trackingRound}`}
      footer={
        <>
          {detail !== null && detail.status === 'pending_accept' && (
            <Button onClick={accept} loading={accepting}>
              รับงาน
            </Button>
          )}
          {footerActions}
          <Button variant="secondary" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        </>
      }
    >
      {loadError !== null ? (
        <ErrorState title={loadError.title} message={loadError.message} />
      ) : detail === null ? (
        <LoadingState message="กำลังโหลดรายละเอียดเคส..." />
      ) : (
        <>
          {actionError !== null && <ErrorState title={actionError.title} message={actionError.message} />}
          <FieldCaseDetailBody detail={detail} onRespondReassignment={onRespondReassignment} />
          <div className="mt-3 text-xs text-slate-400">มอบหมายเมื่อ {fmtDate(detail.assignedAt)}</div>
        </>
      )}
    </Modal>
  )
}
