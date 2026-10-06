'use client'

import { useEffect, useState } from 'react'
import { Field, Select } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import type { PayeeOptionDto } from '@/lib/payees/types'

/**
 * ช่อง "บันทึกแทน" (มติ PO U153) — ผู้รับเงินของรายการ · ค่าว่าง = บันทึกของตัวเอง
 *
 * ผู้เรียกแสดงช่องนี้เฉพาะผู้ที่บันทึกแทนได้ (`ON_BEHALF_CAPABILITIES` · Superadmin) — เป็นแค่ UX
 * server ตรวจสิทธิ์บันทึกแทนซ้ำที่ชั้นข้อมูลเสมอ (ไม่มีสิทธิ์ส่ง payeeId มา = 403)
 */
export function OnBehalfPayeeSelect({
  value,
  onChange,
  error,
  hint,
  allowSelf = true,
}: {
  value: string
  onChange: (payeeId: string) => void
  error?: string
  hint?: string
  /**
   * `false` = ผู้ใช้ทำรายการของตัวเองไม่ได้ (เช่น การเงินขอเงินทดรองแทนได้อย่างเดียว — มติ PO U160)
   * ⇒ ช่องนี้บังคับเลือก · ไม่มีตัวเลือก "ของตัวเอง"
   */
  allowSelf?: boolean
}) {
  const [options, setOptions] = useState<PayeeOptionDto[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<PayeeOptionDto[]>('/api/payees/options')
      if (cancelled) return
      if (response.error !== undefined) setLoadError(response.error.message)
      else setOptions(response.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Field
      label="ผู้รับเงิน (บันทึกแทน)"
      required={!allowSelf}
      error={error ?? loadError ?? undefined}
      hint={
        hint ??
        (allowSelf
          ? 'เว้นไว้ = บันทึกของตัวเอง · เลือกผู้รับเมื่อบันทึกแทนพนักงาน (ระบบบันทึกชื่อผู้บันทึกแทนไว้ในประวัติ)'
          : 'เลือกพนักงานที่ขอแทน (ระบบบันทึกชื่อผู้บันทึกแทนไว้ในประวัติ)')
      }
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allowSelf ? '— ของตัวเอง —' : '— เลือกผู้รับเงิน —'}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {option.teamName === null ? '' : ` · ${option.teamName}`}
          </option>
        ))}
      </Select>
    </Field>
  )
}
