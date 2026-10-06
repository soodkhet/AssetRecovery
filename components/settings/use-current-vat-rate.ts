'use client'

import { useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { VatRateDto } from '@/lib/settings/types'
import { resolveVatRateAt } from '@/lib/settings/vat'

/** DTO ของอัตรา VAT → อัตราที่มีผลวันนี้ (ไม่มี = `null`) — ใช้ resolver ตัวเดียวกับการสร้างรายได้ */
export function currentVatRateOf(items: readonly VatRateDto[], at: Date = new Date()): number | null {
  const period = resolveVatRateAt(
    at,
    items.map((item) => ({
      id: item.id,
      ratePct: Number(item.ratePct),
      effectiveFrom: new Date(item.effectiveFrom),
      effectiveTo: item.effectiveTo === null ? null : new Date(item.effectiveTo),
    })),
  )
  return period === null ? null : Number(period.ratePct)
}

/**
 * อัตรา VAT ที่มีผลวันนี้ สำหรับ **ตัวอย่างตัวเลข** ในกล่องคำอธิบาย (U108) — ห้ามใช้ค่าคงที่ 7% (Rule 01)
 * ไม่มีสิทธิ์อ่าน/โหลดไม่ได้ = `null` (กล่องแสดงว่ายังไม่มีอัตรา ไม่เดา)
 */
export function useCurrentVatRate(enabled = true): number | null {
  const [rate, setRate] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const result = await callApi<VatRateDto[]>('/api/settings/vat-rates')
      if (!cancelled && result.error === undefined) setRate(currentVatRateOf(result.data ?? []))
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])
  return rate
}
