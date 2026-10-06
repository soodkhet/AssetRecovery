'use client'

import { useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import { DEFAULT_CAPACITY_OPTIONS, DEFAULT_COLOR_OPTIONS } from '@/lib/device-catalog/device-attributes'
import type { DeviceAttributeOptionsDto } from '@/lib/device-catalog/types'

const DEFAULT_OPTIONS: DeviceAttributeOptionsDto = {
  capacityOptions: [...DEFAULT_CAPACITY_OPTIONS],
  colorOptions: [...DEFAULT_COLOR_OPTIONS],
}

/**
 * ตัวเลือกความจุ/สีของฟอร์มรับเคส (มติ PO U166) — โหลดครั้งเดียวเมื่อเปิดฟอร์ม · เรียกไม่สำเร็จ = ค่าเริ่มต้น (ไม่บล็อก)
 */
export function useDeviceAttributeOptions(open: boolean): DeviceAttributeOptionsDto {
  const [options, setOptions] = useState<DeviceAttributeOptionsDto>(DEFAULT_OPTIONS)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const response = await callApi<DeviceAttributeOptionsDto>('/api/device-catalog/attributes')
      if (cancelled || response.data === undefined) return
      setOptions(response.data)
    })()
    return () => {
      cancelled = true
    }
  }, [open])
  return options
}
