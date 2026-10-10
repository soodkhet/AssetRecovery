'use client'

import { useEffect, useState } from 'react'
import { signedFileUrl } from '@/lib/cases/upload-client'
import { cn } from '@/components/ui/cn'

/**
 * ภาพย่อของรูปที่เก็บใน bucket private (staging E-041 · `44` §8.2 "Preview thumbnail") — ขอ signed URL ทุกครั้ง
 * (ไม่เก็บลิงก์ถาวรในหน้า) · ขอไม่ได้ ⇒ กรอบว่างพร้อมข้อความ ไม่ทำให้ฟอร์มล้ม
 */
export function StoredPhotoThumb({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const signed = await signedFileUrl(path)
      if (cancelled) return
      setUrl(signed)
      setFailed(signed === null)
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  if (url === null) {
    return (
      <span
        className={cn(
          'flex aspect-square w-full items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400',
          className,
        )}
      >
        {failed ? 'แสดงภาพย่อไม่ได้' : 'กำลังโหลด…'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URL ชั่วคราวจาก Storage (ไม่ผ่าน next/image optimizer)
    <img src={url} alt={alt} className={cn('aspect-square w-full rounded-md object-cover', className)} />
  )
}
