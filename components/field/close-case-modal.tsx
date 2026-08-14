'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { signedFileUrl } from '@/lib/cases/upload-client'
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconClose,
  IconCompass,
  IconImage,
  IconMap,
  IconMapPin,
  IconMic,
  IconPackage,
  IconPlus,
  IconTrash,
  IconVideo,
} from '@/components/field/field-icons'
import { Button, ErrorState, LoadingState, Modal, Textarea, useToast } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import {
  EMPTY_CLOSE_FORM,
  appendMedia,
  canSubmitCloseForm,
  closeCasePayload,
  closeDraftPayload,
  closeFormFromDetail,
  closeFormMissing,
  closeFormMode,
  closeMissingSummary,
  hasCloseFormRevision,
  removeMediaAt,
  resubmitClosePayload,
  type CloseFormState,
} from '@/lib/field/close-form'
import { currentPosition, GeolocationError } from '@/lib/field/geolocation'
import { formatCoordinates, panCenter, staticMapUrl } from '@/lib/field/map-pan'
import {
  FIELD_MEDIA_ACCEPT,
  FIELD_MEDIA_CAPTURE,
  FIELD_MEDIA_LABEL,
  type FieldMediaKind,
} from '@/lib/field/media-upload'
import { uploadFieldMedia, FieldUploadError } from '@/lib/field/upload-client'
import type {
  FieldActionResultDto,
  FieldCaseDetailDto,
  FieldCheckinResultDto,
  FieldCloseDraftResultDto,
} from '@/lib/field/types'
import { fmtDateTime } from '@/lib/format/datetime'
import type { CaseOutcome } from '@/lib/generated/prisma/enums'

/**
 * **ฟอร์มปิดงาน** (`41` §7.6) — เปิดจากปุ่ม "เริ่มงาน"/"จบงาน"/"แก้ไขหลักฐาน" ของแท็บกำลังติดตาม
 *
 * 3 ส่วนตามสเปค:
 * - **A** จุดเริ่มเดินทาง — ดึง GPS อัตโนมัติ**ทันทีที่เปิดฟอร์มครั้งแรก** + ลากปรับบนแผนที่ได้
 *   แสดง**เฉพาะทีม `PER_KM`** (§6.4.1) · ไม่ใช่หลักฐาน จึงปรับได้เสมอแม้ในโหมดตีกลับ
 * - **B** หลักฐาน — เช็คอิน (Geolocation ของอุปกรณ์จริง **ไม่มีช่องกรอกพิกัดมือ** §11)
 *   + รูป/วิดีโอ/รูปสินค้า/เสียง (กล้องหรือเลือกไฟล์ก็ได้ §8 `add_photo`/`add_video`)
 * - **C** ปุ่มท้ายฟอร์ม — "บันทึก Draft" + "ยืนยันปิดงาน" · โหมด `needs_revision` เหลือปุ่มเดียว
 *
 * ⚠️ ผู้เรียกต้องส่ง `key={caseId}` — state ของฟอร์มรีเซ็ตด้วยการ remount (ไม่ setState ใน effect)
 * ⚠️ เช็คอินบันทึกทันทีที่กด (ล็อกตลอด แก้ไม่ได้ — §6.4) ส่วนสื่อ/outcome เก็บลง draft
 */

interface MediaSection {
  kind: FieldMediaKind
  list: 'photos' | 'videos' | 'productPhotos'
  title: string
  hint: string
  icon: (props: { className?: string }) => React.ReactNode
}

const MEDIA_SECTIONS: readonly MediaSection[] = [
  { kind: 'photo', list: 'photos', title: 'รูปถ่าย', hint: 'บังคับ — อย่างน้อย 1 รูป', icon: IconCamera },
  { kind: 'video', list: 'videos', title: 'วิดีโอ', hint: 'บังคับ — อย่างน้อย 1 คลิป', icon: IconVideo },
  {
    kind: 'product_photo',
    list: 'productPhotos',
    title: 'รูปสินค้ายืนยัน',
    hint: 'บังคับเมื่อปิดงานสำเร็จ',
    icon: IconPackage,
  },
]

const OUTCOME_CHOICES: readonly { outcome: CaseOutcome; label: string; emoji: string; tone: string }[] = [
  { outcome: 'closed_success', label: 'สำเร็จ', emoji: '✅', tone: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { outcome: 'closed_fail', label: 'ไม่สำเร็จ', emoji: '❌', tone: 'border-slate-500 bg-slate-100 text-slate-700' },
]

/** zoom ของแผนที่จุดเริ่มเดินทาง — ต้องคงที่เพราะใช้แปลงพิกเซล↔พิกัดตอนลาก */
const ORIGIN_MAP_ZOOM = 15
const ORIGIN_MAP_SIZE = { width: 400, height: 160 }

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="text-xs font-extrabold text-slate-600">{children}</div>
      {note !== undefined && <span className="text-[11px] font-bold text-orange-600">{note}</span>}
    </div>
  )
}

/** เปิดไฟล์ที่อัปโหลดไว้แล้ว (bucket เป็น private ⇒ ต้องขอ signed URL ก่อน) */
async function openStoredFile(path: string): Promise<boolean> {
  const url = await signedFileUrl(path)
  if (url === null) return false
  window.open(url, '_blank', 'noreferrer')
  return true
}

function MediaGrid({
  section,
  urls,
  busy,
  onAdd,
  onRemove,
  onOpen,
}: {
  section: MediaSection
  urls: readonly string[]
  busy: boolean
  onAdd: (files: FileList) => void
  onRemove: (index: number) => void
  onOpen: (url: string) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)
  const Icon = section.icon
  const capture = FIELD_MEDIA_CAPTURE[section.kind]

  return (
    <div>
      <SectionTitle>
        {section.title} <span className="font-bold text-slate-400">({section.hint})</span>
      </SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {urls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-emerald-300 bg-slate-100"
          >
            <button
              type="button"
              onClick={() => onOpen(url)}
              title="เปิดดูไฟล์"
              className="focus-ring flex h-full w-full items-center justify-center rounded-xl text-emerald-600"
            >
              <Icon className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label={`ลบ${section.title}ลำดับที่ ${index + 1}`}
              onClick={() => onRemove(index)}
              className="focus-ring absolute -top-1.5 -right-1.5 rounded-full bg-slate-900 p-1 text-white"
            >
              <IconTrash className="h-3 w-3" />
            </button>
          </div>
        ))}

        {capture !== null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="focus-ring flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 disabled:opacity-50"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[11px] font-extrabold">ถ่ายใหม่</span>
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => pickerRef.current?.click()}
          className="focus-ring flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 disabled:opacity-50"
        >
          <IconPlus className="h-5 w-5" />
          <span className="text-[11px] font-extrabold">เลือกไฟล์</span>
        </button>
      </div>

      {capture !== null && (
        <input
          ref={cameraRef}
          type="file"
          accept={FIELD_MEDIA_ACCEPT[section.kind]}
          capture={capture}
          className="hidden"
          onChange={(event) => {
            if (event.target.files !== null) onAdd(event.target.files)
            event.target.value = ''
          }}
        />
      )}
      <input
        ref={pickerRef}
        type="file"
        multiple
        accept={FIELD_MEDIA_ACCEPT[section.kind]}
        className="hidden"
        onChange={(event) => {
          if (event.target.files !== null) onAdd(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}

function AudioSection({
  url,
  busy,
  onAdd,
  onRemove,
  onOpen,
}: {
  url: string | null
  busy: boolean
  onAdd: (files: FileList) => void
  onRemove: () => void
  onOpen: (url: string) => void
}) {
  const pickerRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <SectionTitle>
        {FIELD_MEDIA_LABEL.audio} <span className="font-bold text-slate-400">(ไม่บังคับ)</span>
      </SectionTitle>
      {url === null ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => pickerRef.current?.click()}
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-xs font-extrabold text-slate-500 disabled:opacity-50"
        >
          <IconMic className="h-4 w-4" /> แนบไฟล์เสียง
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5">
          <IconMic className="h-4 w-4 text-emerald-600" />
          <button
            type="button"
            onClick={() => onOpen(url)}
            className="focus-ring flex-1 text-left text-xs font-extrabold text-emerald-700"
          >
            แนบไฟล์เสียงแล้ว — แตะเพื่อเปิดฟัง
          </button>
          <button
            type="button"
            aria-label="ลบไฟล์เสียง"
            onClick={onRemove}
            className="focus-ring rounded-lg p-1 text-slate-400 hover:bg-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
      <input
        ref={pickerRef}
        type="file"
        accept={FIELD_MEDIA_ACCEPT.audio}
        className="hidden"
        onChange={(event) => {
          if (event.target.files !== null) onAdd(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}

export function CloseCaseModal({
  caseId,
  onClose,
  onDone,
}: {
  caseId: string
  onClose: () => void
  /** เรียกหลังบันทึก draft/ปิดงานสำเร็จ — ผู้เรียกรีโหลดรายการเคส */
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [detail, setDetail] = useState<FieldCaseDetailDto | null>(null)
  const [loadError, setLoadError] = useState<ApiCallError | null>(null)
  const [form, setForm] = useState<CloseFormState>(EMPTY_CLOSE_FORM)
  const [busy, setBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [originError, setOriginError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  /** บันทึก draft เงียบ ๆ ทุกครั้งที่ฟอร์มเปลี่ยน (mockup `saveDraftSilently`) — โหมดตีกลับไม่มี draft */
  const persistDraft = useCallback(
    async (next: CloseFormState, options?: { revision?: boolean }): Promise<void> => {
      if (options?.revision === true) return
      const response = await callApi<FieldCloseDraftResultDto>(
        apiPath('field.closeDraft', { id: caseId }),
        jsonRequest('POST', closeDraftPayload(next)),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
      }
    },
    [caseId, showToast],
  )

  // โหลดรายละเอียด + ดึง GPS เป็นจุดเริ่มเดินทางทันทีที่เปิดฟอร์มครั้งแรกของเคส (`41` §7.6/§8)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<FieldCaseDetailDto>(apiPath('field.caseDetail', { id: caseId }))
      if (cancelled) return
      if (response.error !== undefined || response.data === undefined) {
        setLoadError(response.error ?? { title: 'โหลดเคสไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }

      const loaded = response.data
      setDetail(loaded)
      setForm(closeFormFromDetail(loaded))

      const needsOrigin = loaded.fuelMode === 'PER_KM' && loaded.travelOrigin === null
      if (!needsOrigin) return

      try {
        const position = await currentPosition()
        if (cancelled) return
        const saved = await callApi<FieldCloseDraftResultDto>(
          apiPath('field.closeDraft', { id: caseId }),
          jsonRequest(
            'POST',
            closeDraftPayload(closeFormFromDetail(loaded), {
              latitude: position.latitude,
              longitude: position.longitude,
              source: 'gps_auto',
            }),
          ),
        )
        if (cancelled) return
        if (saved.error !== undefined || saved.data === undefined) {
          setOriginError(saved.error?.message ?? 'บันทึกจุดเริ่มเดินทางไม่สำเร็จ')
          return
        }
        setDetail({ ...loaded, travelOrigin: saved.data.travelOrigin })
      } catch (error) {
        if (cancelled) return
        setOriginError(
          error instanceof GeolocationError ? error.message : 'ดึงพิกัด GPS ไม่สำเร็จ — ลองใหม่อีกครั้ง',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [caseId])

  const mode = detail === null ? null : closeFormMode(detail)
  const missing = detail === null ? [] : closeFormMissing(form, detail)
  const missingSummary = closeMissingSummary(missing)
  const canSubmit = detail !== null && canSubmitCloseForm(form, detail)

  function updateForm(next: CloseFormState): void {
    setForm(next)
    setShowMissing(false)
    void persistDraft(next, { revision: mode?.revision === true })
  }

  function selectOutcome(outcome: CaseOutcome): void {
    updateForm({ ...form, outcome })
  }

  async function addMedia(section: MediaSection, files: FileList): Promise<void> {
    setBusy(true)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        try {
          uploaded.push(await uploadFieldMedia(caseId, section.kind, file))
        } catch (error) {
          showToast({
            tone: 'error',
            title: `เพิ่ม${section.title}ไม่สำเร็จ`,
            description: error instanceof FieldUploadError ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ',
          })
        }
      }
      if (uploaded.length === 0) return
      updateForm({ ...form, [section.list]: appendMedia(form[section.list], uploaded) })
    } finally {
      setBusy(false)
    }
  }

  async function addAudio(files: FileList): Promise<void> {
    const file = files.item(0)
    if (file === null) return
    setBusy(true)
    try {
      const path = await uploadFieldMedia(caseId, 'audio', file)
      updateForm({ ...form, audioUrl: path })
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'แนบไฟล์เสียงไม่สำเร็จ',
        description: error instanceof FieldUploadError ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ',
      })
    } finally {
      setBusy(false)
    }
  }

  async function openFile(path: string): Promise<void> {
    const opened = await openStoredFile(path)
    if (!opened) showToast({ tone: 'error', title: 'เปิดไฟล์ไม่สำเร็จ', description: 'ลองใหม่อีกครั้ง' })
  }

  /** เช็คอิน = พิกัดจากอุปกรณ์จริงเท่านั้น บันทึกทันทีและล็อกตลอด (`41` §6.4 · §11) */
  async function addCheckin(): Promise<void> {
    if (detail === null) return
    setBusy(true)
    try {
      const position = await currentPosition()
      const response = await callApi<FieldCheckinResultDto>(
        apiPath('field.checkin', { id: caseId }),
        jsonRequest('POST', {
          latitude: position.latitude,
          longitude: position.longitude,
          checkinType: 'address',
          addressNote: detail.checkins.length === 0 ? 'ที่อยู่ปัจจุบันของลูกหนี้' : `ตำแหน่งที่ ${detail.checkins.length + 1}`,
        }),
      )
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'เช็คอินไม่สำเร็จ',
          description: response.error?.message ?? 'ลองใหม่อีกครั้ง',
        })
        return
      }
      setDetail({ ...detail, checkins: [...detail.checkins, response.data.checkin] })
      setShowMissing(false)
      showToast({ tone: 'success', title: 'เช็คอินตำแหน่งปัจจุบันแล้ว' })
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'เช็คอินไม่สำเร็จ',
        description: error instanceof GeolocationError ? error.message : 'ดึงพิกัดจากอุปกรณ์ไม่สำเร็จ',
      })
    } finally {
      setBusy(false)
    }
  }

  /** บันทึกจุดเริ่มเดินทางใหม่ — ดึง GPS ใหม่ (`gps_auto`) หรือหลังลากปรับ (`manual_adjusted`) */
  async function saveTravelOrigin(
    point: { latitude: number; longitude: number },
    source: 'gps_auto' | 'manual_adjusted',
  ): Promise<void> {
    if (detail === null) return
    setBusy(true)
    try {
      const response = await callApi<FieldCloseDraftResultDto>(
        apiPath('field.closeDraft', { id: caseId }),
        jsonRequest('POST', closeDraftPayload(form, { ...point, source })),
      )
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'บันทึกจุดเริ่มเดินทางไม่สำเร็จ',
          description: response.error?.message ?? 'ลองใหม่อีกครั้ง',
        })
        return
      }
      setDetail({ ...detail, travelOrigin: response.data.travelOrigin })
      setOriginError(null)
      setShowMissing(false)
    } finally {
      setBusy(false)
    }
  }

  async function retryOrigin(): Promise<void> {
    try {
      const position = await currentPosition()
      await saveTravelOrigin({ latitude: position.latitude, longitude: position.longitude }, 'gps_auto')
    } catch (error) {
      setOriginError(error instanceof GeolocationError ? error.message : 'ดึงพิกัด GPS ไม่สำเร็จ')
    }
  }

  async function saveDraftAndClose(): Promise<void> {
    setSubmitting(true)
    try {
      await persistDraft(form)
      showToast({ tone: 'success', title: 'บันทึก Draft แล้ว', description: 'กลับมาทำต่อได้ทีหลัง' })
      onDone()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  async function submit(): Promise<void> {
    if (detail === null || mode === null) return
    if (!canSubmit) {
      setShowMissing(true)
      if (mode.revision && !hasCloseFormRevision(form, detail)) {
        showToast({
          tone: 'error',
          title: 'ยังไม่ได้แก้ไขหลักฐาน',
          description: 'ต้องเพิ่ม/ลบ/แทนที่รูป วิดีโอ เสียง หรือรูปสินค้าอย่างน้อย 1 รายการก่อนส่งกลับ',
        })
      }
      return
    }

    setSubmitting(true)
    try {
      const response = mode.revision
        ? await callApi<FieldActionResultDto>(
            apiPath('field.resubmitClose', { id: caseId }),
            jsonRequest('POST', resubmitClosePayload(form)),
          )
        : await callApi<FieldActionResultDto>(
            apiPath('field.closeCase', { id: caseId }),
            jsonRequest('POST', closeCasePayload(form)),
          )

      if (response.error !== undefined) {
        setShowMissing(true)
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: mode.revision ? 'ส่งหลักฐานกลับให้ตรวจอีกครั้งแล้ว' : 'ปิดงานเรียบร้อย',
        description: mode.revision
          ? 'รายการเบิกของรอบเดิมจะถูกแทนที่ด้วยรายการใหม่'
          : 'ระบบสร้างรายการเบิกค่าน้ำมัน/เบี้ยเลี้ยงให้อัตโนมัติ',
      })
      onDone()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const origin = detail?.travelOrigin ?? null
  const originCenter = origin === null ? null : { latitude: origin.latitude, longitude: origin.longitude }

  function endDrag(): void {
    const start = dragStart.current
    dragStart.current = null
    const offset = dragOffset
    setDragOffset(null)
    if (start === null || offset === null || originCenter === null) return
    if (Math.abs(offset.x) < 4 && Math.abs(offset.y) < 4) return
    const next = panCenter(originCenter, ORIGIN_MAP_ZOOM, offset.x, offset.y)
    void saveTravelOrigin({ latitude: next.latitude, longitude: next.longitude }, 'manual_adjusted')
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={mode?.revision === true ? 'แก้ไขหลักฐานปิดงาน' : 'ปิดงาน'}
      description={detail === null ? undefined : `${detail.debtorName ?? '—'} · ${detail.caseRef}`}
      footer={
        detail === null || mode === null ? null : (
          <>
            {mode.canSaveDraft && (
              <Button variant="secondary" onClick={saveDraftAndClose} disabled={submitting || busy}>
                บันทึก Draft
              </Button>
            )}
            <Button onClick={submit} loading={submitting} disabled={busy}>
              {mode.submitLabel}
            </Button>
          </>
        )
      }
    >
      {loadError !== null ? (
        <ErrorState title={loadError.title} message={loadError.message} code={loadError.code} />
      ) : detail === null || mode === null ? (
        <LoadingState message="กำลังโหลดฟอร์มปิดงาน..." />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[15px] font-bold text-slate-800">{detail.debtorName ?? '—'}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {detail.caseRef} · รอบที่ {detail.trackingRound}
            </div>
          </div>

          {mode.revision && detail.rejectReason !== null && (
            <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-orange-800">
                <IconAlert className="h-4 w-4" /> หลักฐานปิดงานถูกตีกลับ — ต้องแก้ไข
              </div>
              <div className="mt-1.5 text-sm text-orange-700">เหตุผล: {detail.rejectReason}</div>
              <div className="mt-1 text-[11px] text-orange-500">
                แก้ไขได้เฉพาะรูป/วิดีโอ/เสียง/รูปสินค้า — เช็คอินและผลการติดตามล็อกไว้ตามรอบเดิม
              </div>
            </div>
          )}

          {/* ── A. จุดเริ่มเดินทาง (เฉพาะทีม PER_KM — `41` §6.4.1) ── */}
          {mode.showTravelOrigin && (
            <div>
              <SectionTitle>
                <span className="inline-flex items-center gap-1.5">
                  <IconCompass className="h-4 w-4" /> จุดเริ่มเดินทาง
                  <span className="font-bold text-slate-400">(สำหรับคำนวณค่าน้ำมัน)</span>
                </span>
              </SectionTitle>

              {origin === null || originCenter === null ? (
                <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-rose-300 px-3 py-4 text-rose-500">
                  <IconAlert className="h-5 w-5" />
                  <span className="text-center text-xs font-extrabold">
                    {originError ?? 'กำลังดึงตำแหน่ง GPS ของอุปกรณ์...'}
                  </span>
                  <button
                    type="button"
                    onClick={retryOrigin}
                    disabled={busy}
                    className="focus-ring text-xs font-extrabold text-rose-600 underline disabled:opacity-50"
                  >
                    ลองดึงตำแหน่งอีกครั้ง
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border-2 border-blue-300 bg-white">
                  <div
                    className="relative h-40 touch-none overflow-hidden bg-slate-100 select-none"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      dragStart.current = { x: event.clientX, y: event.clientY }
                      setDragOffset({ x: 0, y: 0 })
                    }}
                    onPointerMove={(event) => {
                      const start = dragStart.current
                      if (start === null) return
                      setDragOffset({ x: event.clientX - start.x, y: event.clientY - start.y })
                    }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- รูปแผนที่นิ่งจากบริการภายนอก (โดเมนไม่ผ่าน next/image) */}
                    <img
                      src={staticMapUrl(originCenter, {
                        zoom: ORIGIN_MAP_ZOOM,
                        width: ORIGIN_MAP_SIZE.width,
                        height: ORIGIN_MAP_SIZE.height,
                        marker: 'blue-pushpin',
                      })}
                      alt="แผนที่จุดเริ่มเดินทาง"
                      draggable={false}
                      className="h-full w-full object-cover"
                      style={
                        dragOffset === null
                          ? undefined
                          : { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }
                      }
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-slate-700 shadow">
                        ลากแผนที่เพื่อปรับตำแหน่ง
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-3">
                    <IconMapPin className="h-4 w-4 shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold text-blue-700">
                        {origin.source === 'manual_adjusted' ? 'ปรับตำแหน่งเองแล้ว' : 'ดึงจาก GPS อัตโนมัติ'}
                      </div>
                      <div className="truncate font-mono text-[11px] text-blue-600">
                        {formatCoordinates(originCenter)} · {fmtDateTime(origin.setAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={retryOrigin}
                      disabled={busy}
                      className="focus-ring rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-extrabold text-blue-600 disabled:opacity-50"
                    >
                      ดึง GPS ใหม่
                    </button>
                  </div>
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">
                จุดนี้ใช้คำนวณระยะทางเท่านั้น ไม่ใช่หลักฐานปิดงาน — ปรับให้ตรงจุดออกเดินทางจริงได้เสมอ
              </p>
            </div>
          )}

          {/* ── ผลการติดตาม (ล็อกในโหมดตีกลับ — `41` §10.1) ── */}
          <div>
            <SectionTitle note={mode.outcomeLocked ? 'ล็อกไว้ตามรอบเดิม — แก้ไม่ได้' : undefined}>
              ผลการติดตาม
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              {OUTCOME_CHOICES.map((choice) => {
                const selected = form.outcome === choice.outcome
                return (
                  <button
                    key={choice.outcome}
                    type="button"
                    disabled={mode.outcomeLocked}
                    onClick={() => selectOutcome(choice.outcome)}
                    className={cn(
                      'focus-ring flex flex-col items-center gap-1.5 rounded-2xl border-2 py-6 text-base font-extrabold',
                      selected ? choice.tone : 'border-slate-200 text-slate-500',
                      mode.outcomeLocked && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {choice.emoji}
                    </span>
                    <span>{choice.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {form.outcome === null ? (
            <p className="text-center text-xs text-slate-400">เลือกผลการติดตามก่อน แล้วจึงแนบหลักฐาน</p>
          ) : (
            <>
              {/* ── B. หลักฐาน ── */}
              <div>
                <SectionTitle note={mode.checkinLocked ? 'ล็อกไว้ตามรอบเดิม' : undefined}>
                  <span className="inline-flex items-center gap-1.5">
                    <IconMapPin className="h-4 w-4" /> เช็คอิน{' '}
                    <span className="font-bold text-slate-400">(บังคับ — อย่างน้อย 1 จุด)</span>
                  </span>
                </SectionTitle>

                <div className="space-y-2">
                  {detail.checkins.map((checkin, index) => (
                    <div key={checkin.id} className="overflow-hidden rounded-xl border-2 border-emerald-300 bg-white">
                      <a
                        href={`https://www.google.com/maps?q=${checkin.latitude},${checkin.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring relative block h-28 bg-slate-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- รูปแผนที่นิ่งจากบริการภายนอก (โดเมนไม่ผ่าน next/image) */}
                        <img
                          src={staticMapUrl(checkin, { zoom: 15, width: 400, height: 150 })}
                          alt={`แผนที่จุดเช็คอินที่ ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-slate-700 shadow">
                            <IconMap className="h-3.5 w-3.5" /> เปิดใน Google Maps
                          </span>
                        </span>
                      </a>
                      <div className="flex items-center gap-2.5 p-3">
                        <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-extrabold text-emerald-700">
                            จุดที่ {index + 1}: {checkin.addressNote ?? checkin.checkinType}
                          </div>
                          <div className="text-[11px] text-emerald-600">
                            {fmtDateTime(checkin.checkedInAt)} · พิกัดล็อกไว้ แก้ไขไม่ได้
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {!mode.checkinLocked && (
                    <button
                      type="button"
                      onClick={addCheckin}
                      disabled={busy}
                      className="focus-ring flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 py-4 text-slate-500 disabled:opacity-50"
                    >
                      <IconMapPin className="h-5 w-5" />
                      <span className="text-xs font-extrabold">
                        {detail.checkins.length === 0 ? 'แตะเพื่อเช็คอินตำแหน่งปัจจุบัน' : '+ เช็คอินอีกจุด'}
                      </span>
                    </button>
                  )}
                  {detail.checkins.length === 0 && mode.checkinLocked && (
                    <div className="text-sm text-slate-400 italic">— ไม่มีจุดเช็คอินของรอบเดิม —</div>
                  )}
                </div>
              </div>

              {MEDIA_SECTIONS.filter(
                (section) => section.kind !== 'product_photo' || form.outcome === 'closed_success',
              ).map((section) => (
                <MediaGrid
                  key={section.kind}
                  section={section}
                  urls={form[section.list]}
                  busy={busy}
                  onAdd={(files) => void addMedia(section, files)}
                  onRemove={(index) =>
                    updateForm({ ...form, [section.list]: removeMediaAt(form[section.list], index) })
                  }
                  onOpen={(url) => void openFile(url)}
                />
              ))}

              <AudioSection
                url={form.audioUrl}
                busy={busy}
                onAdd={(files) => void addAudio(files)}
                onRemove={() => updateForm({ ...form, audioUrl: null })}
                onOpen={(url) => void openFile(url)}
              />

              <div>
                <SectionTitle>บันทึกเพิ่มเติม (ไม่บังคับ)</SectionTitle>
                <Textarea
                  rows={2}
                  value={form.note ?? ''}
                  onChange={(event) => setForm({ ...form, note: event.target.value === '' ? null : event.target.value })}
                  onBlur={() => void persistDraft(form, { revision: mode.revision })}
                  placeholder="รายละเอียดที่อยากบันทึกไว้กับการปิดงานครั้งนี้"
                />
              </div>

              {/* ── C. สรุปสิ่งที่ยังขาด — §20 บังคับให้บอกครบในครั้งเดียว ── */}
              {showMissing && missingSummary !== null && (
                <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {missingSummary}
                </div>
              )}
              <p className="text-center text-[11px] text-slate-400">
                {mode.revision
                  ? 'แก้ไขได้เฉพาะรูป/วิดีโอ/เสียง/รูปสินค้า — เช็คอินและผลการติดตามล็อกไว้ตามรอบเดิม'
                  : 'บันทึก Draft ได้ก่อนครบทุกหลักฐาน — กลับมาทำต่อได้ทีหลัง'}
              </p>
            </>
          )}

          {busy && (
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
              <IconImage className="h-4 w-4" /> กำลังทำงาน...
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
