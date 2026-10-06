'use client'

import { useEffect, useState } from 'react'
import { InlineAlert } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { organizationProfileWarning } from '@/lib/organization/profile'
import type { OrganizationProfileDto } from '@/lib/organization/types'

/**
 * คำเตือน "ข้อมูลองค์กรยังเป็นค่าตัวอย่าง" บนหน้าออกเอกสารภาษี (มติ PO U99) — **เตือน ไม่บล็อก**
 * ข้อมูลผู้ขายที่พิมพ์บนใบมาจากหน้าข้อมูลองค์กร · อ่านไม่ได้ (ไม่มีสิทธิ์/เครือข่าย) = ไม่แสดงอะไร
 */
export function OrganizationProfileNotice() {
  const [issues, setIssues] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<OrganizationProfileDto>('/api/settings/organization')
      if (cancelled || result.data === undefined) return
      setIssues(result.data.issues)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const warning = organizationProfileWarning(issues)
  if (warning === null) return null
  return (
    <InlineAlert tone="warning" title="ข้อมูลผู้ขายยังไม่ครบ">
      {warning}
    </InlineAlert>
  )
}
