'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Input, cn } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import type { DeviceAssetKind } from '@/lib/device-catalog/catalog'
import type { DeviceModelOptionDto } from '@/lib/device-catalog/types'

/**
 * ช่อง "ยี่ห้อ/รุ่นเครื่อง" ของฟอร์มรับเคส (มติ PO U155 → U157/U159 · `38` §6.2 · mockup `38-case-submission-mockup.html`)
 *
 * combobox พิมพ์ค้นหา (แบรนด์/รุ่น หลายคำ) จากแคตตาล็อก Model Phone — เฉพาะรายการที่แสดงของประเภททรัพย์นั้น
 * + ตัวเลือก **"ไม่พบในรายการ — ระบุเอง" เสมอ** · ห้ามบล็อกการรับเคส: ค้นไม่เจอ/ค้นไม่สำเร็จ ข้อความที่พิมพ์ก็บันทึกได้
 * (เก็บเป็นข้อความ ไม่อ้างรุ่น) · เลือกจากรายการ = เก็บ id รุ่น + ข้อความ "แบรนด์ รุ่น" (snapshot)
 */

export interface DeviceModelValue {
  deviceModelId: string | null
  text: string
}

export interface DeviceModelPickerProps {
  id: string
  assetKind: DeviceAssetKind | null
  value: DeviceModelValue
  invalid?: boolean
  onChange: (next: DeviceModelValue) => void
}

const SEARCH_DELAY_MS = 250

export function DeviceModelPicker({ id, assetKind, value, invalid = false, onChange }: DeviceModelPickerProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [options, setOptions] = useState<DeviceModelOptionDto[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const query = value.text
  useEffect(() => {
    if (!open || manual) return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ q: query, limit: '20' })
        if (assetKind !== null) params.set('assetKind', assetKind)
        const result = await callApi<DeviceModelOptionDto[]>(`/api/device-catalog/options?${params.toString()}`)
        if (cancelled) return
        setOptions(result.data ?? [])
        setFailed(result.error !== undefined)
        setLoading(false)
        setHighlight(-1)
      })()
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, manual, query, assetKind])

  function pick(option: DeviceModelOptionDto): void {
    onChange({ deviceModelId: option.id, text: option.label })
    setOpen(false)
  }

  function chooseManual(): void {
    setManual(true)
    setOpen(false)
    onChange({ deviceModelId: null, text: value.text })
  }

  if (manual) {
    return (
      <div className="space-y-1">
        <Input
          id={id}
          value={value.text}
          placeholder="พิมพ์ยี่ห้อและรุ่น เช่น Samsung Galaxy A55"
          invalid={invalid}
          onChange={(event) => onChange({ deviceModelId: null, text: event.target.value })}
        />
        <button
          type="button"
          className="text-xs font-medium text-emerald-700 hover:underline"
          onClick={() => {
            setManual(false)
            setLoading(true)
            setOpen(true)
          }}
        >
          เลือกจากรายการแทน
        </button>
      </div>
    )
  }

  const total = options.length + 1 // + "ระบุเอง"
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value.text}
        placeholder="พิมพ์ค้นหา เช่น samsung a55"
        invalid={invalid}
        onFocus={() => {
          setLoading(true)
          setOpen(true)
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150)
        }}
        onChange={(event) => {
          // พิมพ์ใหม่ = ยกเลิกรุ่นที่เลือกไว้ (ข้อความที่พิมพ์ยังบันทึกได้เสมอ)
          onChange({ deviceModelId: null, text: event.target.value })
          setLoading(true)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (!open) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((current) => (current + 1) % total)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((current) => (current <= 0 ? total - 1 : current - 1))
          } else if (event.key === 'Enter' && highlight >= 0) {
            event.preventDefault()
            const option = options[highlight]
            if (option === undefined) chooseManual()
            else pick(option)
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {value.deviceModelId !== null && (
        <p className="mt-1 text-[11px] text-emerald-700">เลือกจากรายการแล้ว</p>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          onMouseDown={() => {
            // กันช่องค้นหาปิดรายการก่อนคลิกเลือก
            if (blurTimer.current !== null) clearTimeout(blurTimer.current)
          }}
        >
          {loading && <li className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา…</li>}
          {!loading && failed && (
            <li className="px-3 py-2 text-xs text-amber-700">ค้นหารายการไม่สำเร็จ — ระบุเองได้</li>
          )}
          {!loading && !failed && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">ไม่พบรุ่นที่ตรงกับคำค้น</li>
          )}
          {!loading &&
            options.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value.deviceModelId}
                className={cn(
                  'cursor-pointer px-3 py-2 hover:bg-slate-50',
                  index === highlight && 'bg-slate-100',
                  option.id === value.deviceModelId && 'font-semibold text-slate-900',
                )}
                onClick={() => pick(option)}
              >
                <span className="text-slate-500">{option.brandName}</span> {option.name}
              </li>
            ))}
          <li
            role="option"
            aria-selected={false}
            className={cn(
              'cursor-pointer border-t border-slate-100 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50',
              highlight === options.length && 'bg-emerald-50',
            )}
            onClick={chooseManual}
          >
            ไม่พบในรายการ — ระบุเอง
          </li>
        </ul>
      )}
    </div>
  )
}
