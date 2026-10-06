'use client'

import { useState } from 'react'
import { StagedFileInput } from '@/components/uploads/staged-file-input'
import { StoredFileButton } from '@/components/uploads/stored-file-button'
import { Field, StatusBadge } from '@/components/ui'
import { PAYEE_ID_DOCUMENT_ACCEPT } from '@/lib/payees/id-document'
import { uploadPayeeIdDocument } from '@/lib/payees/upload-client'
import { StorageUploadError } from '@/lib/uploads/client'

/**
 * ช่อง "เอกสารยืนยันตัวตน" ของผู้รับเงิน (มติ PO U150) — **อัปโหลดไฟล์จริง** แทนช่องพิมพ์ URL
 *
 * เลือกไฟล์ ⇒ อัปโหลดทันที (path ผูกกับองค์กร · ฟอร์มผู้ใช้ใหม่ยังไม่มีผู้รับ) แล้วเก็บ path ในฟอร์ม
 * server ตรวจไฟล์ + SHA-256 อีกชั้นตอนบันทึก · เปิดดูผ่าน signed URL (ลง audit การเปิดไฟล์ข้อมูลส่วนบุคคล)
 * เอกสารเดิมที่เป็น URL พิมพ์เอง = ป้าย "ไม่ผ่านการตรวจ" (ถือว่าไม่มีเอกสารตอนยืนยัน) — แนบไฟล์ใหม่แทน
 */
export function PayeeIdDocumentField({
  path,
  verified,
  error,
  onUploaded,
  onClear,
}: {
  path: string
  /** เอกสารที่โหลดมากับผู้รับผ่านการตรวจแล้ว (ไฟล์ที่เพิ่งอัปโหลดในฟอร์มนี้ถือว่าตรวจแล้วเสมอ) */
  verified: boolean
  error?: string
  onUploaded: (path: string) => void
  onClear: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // ไฟล์ที่อัปโหลดผ่านช่องนี้ = ผ่านกลไกอัปโหลดของ server (ตรวจ + hash อีกชั้นตอนบันทึก)
  const [uploadedPath, setUploadedPath] = useState<string | null>(null)
  const hasFile = path.trim() !== ''
  const isVerified = verified || (uploadedPath !== null && uploadedPath === path)

  async function pick(file: File): Promise<void> {
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await uploadPayeeIdDocument(file)
      setUploadedPath(uploaded)
      onUploaded(uploaded)
    } catch (failure) {
      setUploadError(failure instanceof StorageUploadError ? failure.message : 'อัปโหลดเอกสารไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field
      id="payee-id-document"
      label="เอกสารยืนยันตัวตน"
      hint="สำเนาบัตรประชาชน / หนังสือรับรองบริษัท — รูปภาพหรือ PDF ไม่เกิน 10 MB · บังคับเมื่อองค์กรเปิด “ต้องแนบเอกสารยืนยันตัวตนก่อนยืนยัน Payee”"
      error={uploadError ?? error}
    >
      <div className="space-y-2">
        {hasFile && (
          <div className="flex flex-wrap items-center gap-2">
            {isVerified ? (
              <StatusBadge group="success" label="แนบแล้ว · ตรวจไฟล์แล้ว" />
            ) : (
              <StatusBadge group="pending" label="เอกสารเดิมไม่ผ่านการตรวจ — แนบไฟล์ใหม่" />
            )}
            {isVerified && <StoredFileButton path={path} label="เปิดดู" title="เอกสารยืนยันตัวตน" />}
          </div>
        )}
        <StagedFileInput
          fileName={uploading ? 'กำลังอัปโหลด…' : null}
          accept={PAYEE_ID_DOCUMENT_ACCEPT}
          placeholder={hasFile ? 'แตะเพื่อแนบไฟล์ใหม่แทน' : 'แตะเพื่อเลือกไฟล์เอกสาร'}
          disabled={uploading}
          onPick={(file) => void pick(file)}
        />
        {hasFile && (
          <button
            type="button"
            className="focus-ring text-xs font-semibold text-slate-500 underline"
            onClick={() => {
              setUploadError(null)
              onClear()
            }}
          >
            เอาเอกสารออก
          </button>
        )}
      </div>
    </Field>
  )
}
