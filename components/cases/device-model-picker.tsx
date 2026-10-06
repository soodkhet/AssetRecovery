'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Input, cn } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import type { DeviceAssetKind } from '@/lib/device-catalog/catalog'
import type { DeviceModelOptionDto, DeviceTacLookupDto } from '@/lib/device-catalog/types'
import { isImeiLikeIdentifier, parseImei } from '@/lib/warehouse/imei'

/**
 * ช่อง "ยี่ห้อ/รุ่นเครื่อง" ของฟอร์มรับเคส (มติ PO U155 → U157/U159 · `38` §6.2 · mockup `38-case-submission-mockup.html`)
 *
 * combobox พิมพ์ค้นหา (แบรนด์/รุ่น หลายคำ) จากแคตตาล็อก Model Phone — เฉพาะรายการที่แสดงของประเภททรัพย์นั้น
 * + ตัวเลือก **"ไม่พบในรายการ — ระบุเอง" เสมอ** · ห้ามบล็อกการรับเคส: ค้นไม่เจอ/ค้นไม่สำเร็จ ข้อความที่พิมพ์ก็บันทึกได้
 * (เก็บเป็นข้อความ ไม่อ้างรุ่น) · เลือกจากรายการ = เก็บ id รุ่น + ข้อความ "แบรนด์ รุ่น" (snapshot)
 *
 * มติ PO U166 — **กรอก IMEI/Serial ก่อน** (ช่องนี้ปิดจนกว่าจะกรอก) · IMEI 15 หลัก ⇒ ค้นฐาน TAC (8 หลักแรก)
 * แล้วเติมยี่ห้อ/รุ่นให้ ("พบจาก IMEI" — แก้ได้) · ไม่พบ ⇒ เลือกจากรายการ/ระบุเอง แล้วระบบจำ TAC → รุ่นตอนบันทึก
 * เติมอัตโนมัติเฉพาะเมื่อช่องว่างหรือยังเป็นค่าที่เติมจาก IMEI ก่อนหน้า (ไม่ทับที่ผู้ใช้แก้เอง) · Serial = เลือกเอง
 */

export interface DeviceModelValue {
  deviceModelId: string | null
  text: string
}

export interface DeviceModelPickerProps {
  id: string
  assetKind: DeviceAssetKind | null
  value: DeviceModelValue
  /** ค่าในช่อง "IMEI / Serial" (ค่าดิบ) — ว่าง = ปิดช่องนี้ (U166) */
  identifier: string
  invalid?: boolean
  onChange: (next: DeviceModelValue) => void
}

type TacState =
  | { status: 'idle' }
  | { status: 'loading'; imei: string }
  | { status: 'found'; imei: string; tac: string; label: string }
  | { status: 'not_found'; imei: string; tac: string }
  | { status: 'error'; imei: string }

/** IMEI ที่ใช้ค้น TAC ได้ — Serial/รูปแบบผิด = `null` */
function imeiOf(identifier: string): string | null {
  const trimmed = identifier.trim()
  return trimmed !== '' && isImeiLikeIdentifier(trimmed) ? parseImei(trimmed) : null
}

const SEARCH_DELAY_MS = 250

export function DeviceModelPicker({ id, assetKind, value, identifier, invalid = false, onChange }: DeviceModelPickerProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [options, setOptions] = useState<DeviceModelOptionDto[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tacState, setTacState] = useState<TacState>({ status: 'idle' })
  // ข้อความล่าสุดที่เติมจาก IMEI — ผู้ใช้แก้แล้ว (ไม่ตรง) = ไม่เติมทับอีก
  const autoLabel = useRef<string | null>(null)
  const latest = useRef({ value, onChange })
  useEffect(() => {
    latest.current = { value, onChange }
  })

  const imei = imeiOf(identifier)
  const disabled = identifier.trim() === ''

  useEffect(() => {
    if (imei === null) return
    let cancelled = false
    const timer = setTimeout(() => {
      setTacState({ status: 'loading', imei })
      void (async () => {
        const result = await callApi<DeviceTacLookupDto>(`/api/device-catalog/tac-lookup?imei=${encodeURIComponent(imei)}`)
        if (cancelled) return
        const dto = result.data
        if (result.error !== undefined || dto === undefined) {
          setTacState({ status: 'error', imei })
          return
        }
        if (!dto.found || dto.label === null) {
          setTacState({ status: 'not_found', imei, tac: dto.tac })
          return
        }
        setTacState({ status: 'found', imei, tac: dto.tac, label: dto.label })
        const current = latest.current.value
        if (current.text.trim() === '' || current.text === autoLabel.current) {
          autoLabel.current = dto.label
          setManual(false)
          latest.current.onChange({ deviceModelId: dto.deviceModelId, text: dto.label })
        }
      })()
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [imei])

  const tacFor = tacState.status !== 'idle' && imei !== null && tacState.imei === imei ? tacState : null
  const tacNote =
    tacFor === null ? null : tacFor.status === 'loading' ? (
      <p className="mt-1 text-[11px] text-slate-400">กำลังค้นยี่ห้อ/รุ่นจาก IMEI…</p>
    ) : tacFor.status === 'found' && value.text === tacFor.label ? (
      <p className="mt-1 text-[11px] font-semibold text-emerald-700">
        พบจาก IMEI (TAC <span className="font-mono">{tacFor.tac}</span>) — แก้ได้ถ้าไม่ตรง
      </p>
    ) : tacFor.status === 'not_found' ? (
      <p className="mt-1 text-[11px] font-semibold text-amber-600">
        ไม่พบรุ่นจาก IMEI นี้ — เลือกจากรายการหรือระบุเอง แล้วระบบจะจำไว้ใช้ครั้งต่อไป
      </p>
    ) : tacFor.status === 'error' ? (
      <p className="mt-1 text-[11px] text-amber-600">ค้นจาก IMEI ไม่สำเร็จ — เลือกจากรายการหรือระบุเองได้</p>
    ) : null

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

  if (disabled) {
    return (
      <div className="space-y-1">
        <Input id={id} value={value.text} disabled placeholder="กรอก IMEI / Serial ก่อน" invalid={invalid} readOnly />
        <p className="text-[11px] text-slate-400">กรอก IMEI แล้วระบบเติมยี่ห้อ/รุ่นให้ · เครื่องที่มีแต่ Serial เลือกเอง</p>
      </div>
    )
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
        {tacNote}
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
      {tacNote}
      {value.deviceModelId !== null && (tacFor === null || tacFor.status !== 'found' || value.text !== tacFor.label) && (
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
