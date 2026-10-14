'use client'

import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { cn } from '@/components/ui'

/**
 * โซนเลือกไฟล์ (กรอบเส้นประ) ที่ใช้คีย์บอร์ดได้ — ตรวจซ้ำ staging SV5-A11Y-A2-01
 *
 * ทั้งกล่องเป็น `<button type="button">` จริง ⇒ Tab ถึง · Enter/Space เปิดหน้าต่างเลือกไฟล์ (ปุ่ม native)
 * · ชื่อปุ่ม = `title` (`aria-labelledby`) · คำอธิบาย = `description` (`aria-describedby`)
 * · `<input type="file">` ซ่อนไว้นอกลำดับ Tab (`tabIndex=-1` + `aria-hidden`) เป็นแค่ตัวเปิดหน้าต่างของ browser
 * · `onDropFile` (ไม่บังคับ) = รับไฟล์ที่ลากมาวาง — ไม่ส่ง = ไม่รับการลากวาง
 * ห้ามเขียน `div onClick` + `input.hidden` เองอีก (โฟกัสไม่ได้ ไม่มีชื่อ) — ช่องแนบไฟล์ในฟอร์มใช้ `<StagedFileInput>`
 */
export function FileDropzone({
  id,
  accept,
  title,
  description,
  disabled = false,
  onPick,
  onDropFile,
  className,
  children,
}: {
  id?: string
  accept: string
  /** ข้อความหลักในกล่อง = ชื่อปุ่ม */
  title: ReactNode
  description?: ReactNode
  disabled?: boolean
  onPick: (file: File) => void
  onDropFile?: (file: File | undefined) => void
  /** คลาสของกล่อง (ต่อท้ายคลาสมาตรฐาน — `cn()` ตัวหลังชนะ) */
  className?: string
  /** ส่วนประกอบหน้าตาเพิ่มในกล่อง (ไม่ใช่ปุ่ม/ลิงก์ — อยู่ในปุ่มแล้ว) */
  children?: ReactNode
}) {
  const autoId = useId()
  const buttonId = id ?? autoId
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const dropHandlers =
    onDropFile === undefined || disabled
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            event.preventDefault()
            setDragging(true)
          },
          onDragLeave: () => setDragging(false),
          onDrop: (event: DragEvent) => {
            event.preventDefault()
            setDragging(false)
            onDropFile(event.dataTransfer.files[0])
          },
        }
  return (
    <>
      <button
        id={buttonId}
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-labelledby={`${buttonId}-title`}
        aria-describedby={description === undefined ? undefined : `${buttonId}-description`}
        {...dropHandlers}
        className={cn(
          'focus-ring block w-full cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          dragging ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-slate-50 hover:bg-slate-100',
          className,
        )}
      >
        <span id={`${buttonId}-title`} className="block text-sm font-bold text-slate-700">
          {title}
        </span>
        {description !== undefined && (
          <span id={`${buttonId}-description`} className="mt-1 block text-xs text-slate-400">
            {description}
          </span>
        )}
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) onPick(file)
        }}
      />
    </>
  )
}
