'use client'

import { useRef } from 'react'
import { IconFile } from '@/components/field/field-icons'

/**
 * ช่องเลือกไฟล์แบบ "พักไว้ก่อน" (มติ PO U143/U150) — เลือกไฟล์แล้วยังไม่อัปโหลดจนผู้เรียกสั่ง (ตอนกดบันทึก)
 * หรืออัปโหลดทันทีผ่าน `onChange` ของผู้เรียก · ใช้แทนช่องพิมพ์ path/URL เอง (ห้ามมีช่องพิมพ์ path อีก)
 *
 * หน้าตาเดียวกับช่องแนบใบเสร็จของฟอร์มเบิกค่าที่พัก (กรอบเส้นประ + ชื่อไฟล์) · ปุ่ม "เอาออก" เมื่อเลือกแล้ว
 */
export function StagedFileInput({
  fileName,
  accept,
  placeholder,
  disabled = false,
  onPick,
  onClear,
}: {
  /** ชื่อไฟล์ที่เลือก/แนบไว้ — `null` = ยังไม่มี */
  fileName: string | null
  accept: string
  placeholder: string
  disabled?: boolean
  onPick: (file: File) => void
  onClear?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-3 text-left text-slate-500 hover:border-slate-400 disabled:opacity-60"
      >
        <IconFile className="h-5 w-5 shrink-0" />
        <span className="truncate text-xs font-semibold">{fileName ?? placeholder}</span>
      </button>
      {fileName !== null && onClear !== undefined && (
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="focus-ring rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          เอาออก
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) onPick(file)
        }}
      />
    </div>
  )
}
