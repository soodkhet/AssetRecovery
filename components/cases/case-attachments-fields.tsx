'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, InlineAlert } from '@/components/ui'
import {
  assertProductPhotoCapacity,
  DOCUMENT_SLOT_LABEL,
  PRODUCT_PHOTO_MAX,
  type DocumentSlot,
} from '@/lib/cases/case'
import { acceptAttribute, checkUploadCandidate, isPdfMime } from '@/lib/cases/document-upload'
import { CaseError } from '@/lib/cases/errors'
import type { CaseDocumentDto } from '@/lib/cases/types'

/**
 * เอกสารแนบ + รูปสินค้า (`38` §6.3 · §6.3.1 · §7.3) — ส่วนของ **ฟอร์ม**
 *
 * - แต่ละ slot บอกสถานะ "อัปโหลดแล้ว ✓ (n ไฟล์)" / "ยังไม่อัปโหลด" แยกต่อประเภท (§7.3)
 * - รูปสินค้าเป็น **dropzone drag-and-drop + คลิกเลือกไฟล์** พร้อม thumbnail grid ทันทีที่เลือก
 *   และปุ่ม ✕ ต่อรูปเพื่อนำออก **ก่อน submit** · สูงสุด 8 รูป (§6.3.1)
 * - ไฟล์ที่เลือกยัง **ไม่ถูกอัปโหลดจนกว่าจะกดบันทึก** เพราะเคสใหม่ยังไม่มี `case_id` ให้ผูกไฟล์
 *   (ผู้เรียกอัปโหลดต่อด้วย `uploadCaseFile()` หลังบันทึกเคสสำเร็จ)
 */

export interface StagedFile {
  key: string
  slot: DocumentSlot
  file: File
  /** object URL ของรูป — ใช้ทำ thumbnail ก่อนอัปโหลด (ไฟล์ PDF เป็น `null`) */
  previewUrl: string | null
}

const DOCUMENT_SLOT_HINT: Partial<Record<DocumentSlot, string>> = {
  contract_doc: 'PDF หรือรูปถ่ายสัญญา — บังคับก่อนส่งตรวจสอบ',
  national_id_doc: 'หน้า-หลังแนบได้หลายไฟล์ — บังคับก่อนส่งตรวจสอบ',
  other_doc: 'ใบรับรองสินค้า / ใบเสร็จ ฯลฯ — ไม่บังคับ',
}

const FORM_SLOTS: readonly DocumentSlot[] = ['contract_doc', 'national_id_doc', 'other_doc']

export function CaseAttachmentsFields({
  documents,
  staged,
  onChange,
}: {
  /** ไฟล์ที่อัปโหลดไว้แล้ว (โหมดแก้ไข) */
  documents: readonly CaseDocumentDto[]
  staged: readonly StagedFile[]
  onChange: (next: StagedFile[]) => void
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const photoInput = useRef<HTMLInputElement | null>(null)

  // คืนหน่วยความจำของ object URL ตอนปิดฟอร์ม (ไฟล์ที่ยังไม่ได้อัปโหลดถูกทิ้งไปพร้อมกัน)
  const stagedRef = useRef<readonly StagedFile[]>(staged)
  useEffect(() => {
    stagedRef.current = staged
  }, [staged])
  useEffect(
    () => () => {
      for (const item of stagedRef.current) {
        if (item.previewUrl !== null) URL.revokeObjectURL(item.previewUrl)
      }
    },
    [],
  )

  function countOf(slot: DocumentSlot): number {
    return (
      documents.filter((document) => document.documentType === slot).length +
      staged.filter((item) => item.slot === slot).length
    )
  }

  function addFiles(slot: DocumentSlot, files: FileList | null): void {
    if (files === null || files.length === 0) return
    const incoming = [...files]
    const problems: string[] = []
    const accepted: StagedFile[] = []

    for (const file of incoming) {
      const problem = checkUploadCandidate(slot, { name: file.name, type: file.type, size: file.size })
      if (problem !== null) {
        problems.push(problem)
        continue
      }
      accepted.push({
        key: crypto.randomUUID(),
        slot,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })
    }

    if (slot === 'product_photo' && accepted.length > 0) {
      try {
        assertProductPhotoCapacity(countOf('product_photo'), accepted.length)
      } catch (error) {
        if (!(error instanceof CaseError)) throw error
        for (const item of accepted) {
          if (item.previewUrl !== null) URL.revokeObjectURL(item.previewUrl)
        }
        setNotice(error.userMessage)
        return
      }
    }

    setNotice(problems.length === 0 ? null : problems.join(' · '))
    if (accepted.length > 0) onChange([...staged, ...accepted])
  }

  function remove(key: string): void {
    const target = staged.find((item) => item.key === key)
    if (target?.previewUrl != null) URL.revokeObjectURL(target.previewUrl)
    onChange(staged.filter((item) => item.key !== key))
    setNotice(null)
  }

  const photos = staged.filter((item) => item.slot === 'product_photo')
  const existingPhotos = documents.filter((document) => document.documentType === 'product_photo')
  const photoCount = photos.length + existingPhotos.length
  const photoFull = photoCount >= PRODUCT_PHOTO_MAX

  return (
    <>
      <section>
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">เอกสารแนบ</h3>
        {notice !== null && (
          <div className="mb-3">
            <InlineAlert tone="warning" title="ไฟล์บางรายการใช้ไม่ได้">
              {notice}
            </InlineAlert>
          </div>
        )}
        <div className="space-y-3">
          {FORM_SLOTS.map((slot) => {
            const count = countOf(slot)
            const slotFiles = staged.filter((item) => item.slot === slot)
            return (
              <div key={slot} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{DOCUMENT_SLOT_LABEL[slot]}</span>
                      {count > 0 ? (
                        <Badge className="bg-emerald-50 text-emerald-700">อัปโหลดแล้ว ✓ ({count} ไฟล์)</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500">ยังไม่อัปโหลด</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{DOCUMENT_SLOT_HINT[slot]}</p>
                  </div>
                  <label className="focus-ring cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    เลือกไฟล์
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept={acceptAttribute(slot)}
                      onChange={(event) => {
                        addFiles(slot, event.target.files)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>

                {slotFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {slotFiles.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs"
                      >
                        <span className="truncate text-slate-700">
                          {isPdfMime(item.file.type) ? '📄' : '🖼'} {item.file.name}
                        </span>
                        <button
                          type="button"
                          className="focus-ring rounded px-1 font-semibold text-red-600"
                          aria-label={`นำไฟล์ ${item.file.name} ออก`}
                          onClick={() => remove(item.key)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold text-slate-800">รูปสินค้า</h3>
          <span className="text-[11px] text-slate-500">
            {photoCount}/{PRODUCT_PHOTO_MAX} รูป
          </span>
        </div>

        <div
          className={`focus-ring rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            photoFull
              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
              : dragging
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
          onDragOver={(event) => {
            event.preventDefault()
            if (!photoFull) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (!photoFull) addFiles('product_photo', event.dataTransfer.files)
          }}
        >
          <p className="text-sm font-semibold text-slate-700">
            {photoFull ? `ครบ ${PRODUCT_PHOTO_MAX} รูปแล้ว` : 'ลากรูปมาวางที่นี่'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {photoFull ? 'นำรูปเดิมออกก่อนถ้าต้องการเปลี่ยน' : 'หรือกดปุ่มด้านล่างเพื่อเลือกรูปจากเครื่อง'}
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" disabled={photoFull} onClick={() => photoInput.current?.click()}>
              เลือกรูปสินค้า
            </Button>
          </div>
          <input
            ref={photoInput}
            type="file"
            className="hidden"
            multiple
            accept={acceptAttribute('product_photo')}
            onChange={(event) => {
              addFiles('product_photo', event.target.files)
              event.target.value = ''
            }}
          />
        </div>

        {(photos.length > 0 || existingPhotos.length > 0) && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {existingPhotos.map((document) => (
              <div
                key={document.id}
                className="flex aspect-square items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-[10px] text-slate-500"
              >
                อัปโหลดแล้ว ✓<br />
                <span className="truncate">{document.originalName}</span>
              </div>
            ))}
            {photos.map((item) => (
              <div key={item.key} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                {item.previewUrl === null ? (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
                    {item.file.name}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL ของไฟล์ในเครื่อง ยังไม่มี URL จริงให้ next/image
                  <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  className="focus-ring absolute top-1 right-1 rounded-full bg-white/90 px-1.5 text-xs font-bold text-red-600 shadow"
                  aria-label={`นำรูป ${item.file.name} ออก`}
                  onClick={() => remove(item.key)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
