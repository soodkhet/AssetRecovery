'use client'

import { useState } from 'react'
import { FileViewerModal } from '@/components/cases/file-viewer-modal'
import { Button } from '@/components/ui'

/** เดาชนิดจากนามสกุล — ช่องที่ใช้ตัวนี้รับแค่ PDF/รูป (ไม่เก็บ mime) */
function mimeOf(path: string): string {
  return /\.pdf$/i.test(path.split(/[?#]/)[0] ?? '') ? 'application/pdf' : 'image/*'
}

/**
 * ปุ่มเปิดไฟล์ที่เก็บใน bucket (มติ PO U150/U152) — ขอ signed URL จาก server ตอนกดทุกครั้ง (ตรวจสิทธิ์ตามเจ้าของ path
 * + ลง audit การเปิดไฟล์ข้อมูลส่วนบุคคล) ผ่าน `<FileViewerModal>` ตัวกลาง
 */
export function StoredFileButton({ path, label, title }: { path: string; label: string; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        {label}
      </Button>
      <FileViewerModal
        open={open}
        document={open ? { fileUrl: path, originalName: title, mimeType: mimeOf(path) } : null}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
