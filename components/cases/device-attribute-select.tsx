'use client'

import { useState } from 'react'
import { Input, Select } from '@/components/ui'
import { NOT_SPECIFIED_IN_CONTRACT, attributeChoiceOf } from '@/lib/device-catalog/device-attributes'

/**
 * ช่อง "ความจุ" / "สี" ของฟอร์มรับเคส (มติ PO U166 · mockup `38-case-submission-mockup.html`)
 * dropdown = ตัวเลือกมาตรฐาน (ผู้ดูแลแก้ได้ในหน้า Model Phone) + "ระบุเอง" (พิมพ์ข้อความ) + "ไม่ระบุในสัญญา"
 * ค่าที่ส่งออกเป็นข้อความ snapshot เสมอ ('' = ยังไม่เลือก — บังคับก่อนส่งตรวจ)
 */

const CUSTOM = '__custom__'
const NOT_SPECIFIED = '__not_specified__'

export interface DeviceAttributeSelectProps {
  id: string
  value: string
  options: readonly string[]
  /** ตัวอย่างในช่อง "ระบุเอง" */
  customPlaceholder: string
  invalid?: boolean
  onChange: (next: string) => void
}

export function DeviceAttributeSelect({ id, value, options, customPlaceholder, invalid = false, onChange }: DeviceAttributeSelectProps) {
  const choice = attributeChoiceOf(value, options)
  const [customMode, setCustomMode] = useState(choice.kind === 'custom')
  const custom = customMode || choice.kind === 'custom'
  const selectValue = custom
    ? CUSTOM
    : choice.kind === 'option'
      ? choice.value
      : choice.kind === 'not_specified'
        ? NOT_SPECIFIED
        : ''

  return (
    <div className="space-y-1">
      <Select
        id={id}
        value={selectValue}
        invalid={invalid}
        onChange={(event) => {
          const next = event.target.value
          if (next === CUSTOM) {
            setCustomMode(true)
            onChange(choice.kind === 'custom' ? choice.value : '')
            return
          }
          setCustomMode(false)
          onChange(next === NOT_SPECIFIED ? NOT_SPECIFIED_IN_CONTRACT : next)
        }}
      >
        <option value="">— เลือก —</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={CUSTOM}>ระบุเอง…</option>
        <option value={NOT_SPECIFIED}>{NOT_SPECIFIED_IN_CONTRACT}</option>
      </Select>
      {custom && (
        <Input
          id={`${id}-custom`}
          aria-label="ระบุเอง"
          value={value}
          maxLength={50}
          placeholder={customPlaceholder}
          invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}
