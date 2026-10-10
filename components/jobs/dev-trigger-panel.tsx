'use client'

import { useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { Button, Card, Field, InlineAlert, Input, Select, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { MANAGE_JOBS } from '@/lib/jobs/access'
import { DEV_TRIGGER_JOB_TYPES, jobTypeLabel, type JobTypeCode } from '@/lib/jobs/job-types'

/**
 * แผงสั่งงานเบื้องหลังทันที — **เฉพาะระบบทดสอบ** (staging E-013 · เปิดเมื่อ `isDevToolsEnabled()` = true)
 * Vercel Preview ไม่มี cron ⇒ สั่งงานรายวัน (เช่น สรุปวันลงพื้นที่) จากหน้านี้แทน · production ไม่แสดงและ API ตอบ 404
 */
export function DevTriggerPanel({ onTriggered }: { onTriggered: () => void }) {
  const { showToast } = useToast()
  const [jobType, setJobType] = useState<JobTypeCode>(DEV_TRIGGER_JOB_TYPES[0] ?? 'daily_field_allowance')
  const [date, setDate] = useState('')
  const [running, setRunning] = useState(false)

  const needsDate = jobType === 'daily_field_allowance' || jobType === 'advance_overdue'

  async function run(): Promise<void> {
    setRunning(true)
    const payload =
      date === '' ? {} : jobType === 'daily_field_allowance' ? { date } : jobType === 'advance_overdue' ? { asOf: date } : {}
    const result = await callApi<{ outcome: string }>('/api/dev/trigger-job', jsonRequest('POST', { jobType, payload }))
    setRunning(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: `สั่งงาน "${jobTypeLabel(jobType)}" แล้ว`, description: 'ดูผลในตารางด้านล่าง' })
    onTriggered()
  }

  return (
    <Can action="manage" resource={MANAGE_JOBS}>
      <Card>
        <InlineAlert tone="warning" title="ระบบทดสอบ — สั่งงานเบื้องหลังทันที">
          ระบบทดสอบไม่มีตัวตั้งเวลาอัตโนมัติ ใช้แผงนี้สั่งงานแทน (ระบบจริงทำให้เองตามเวลา และไม่มีแผงนี้)
        </InlineAlert>
        <div className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
          <Field label="งาน">
            <Select value={jobType} onChange={(event) => setJobType(event.target.value as JobTypeCode)}>
              {DEV_TRIGGER_JOB_TYPES.map((code) => (
                <option key={code} value={code}>
                  {jobTypeLabel(code)}
                </option>
              ))}
            </Select>
          </Field>
          {needsDate && (
            <Field
              label={jobType === 'daily_field_allowance' ? 'วันที่ลงพื้นที่ที่จะสรุป' : 'จำลองว่าวันนี้คือ'}
              hint={jobType === 'daily_field_allowance' ? 'เว้นว่าง = ทุกวันที่จบแล้วที่ยังไม่สรุป · ใส่วันนี้ได้ (สรุปวันนี้ทันที)' : 'เว้นว่าง = วันนี้'}
            >
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
          )}
          <div>
            <Button loading={running} onClick={() => void run()}>
              รันตอนนี้
            </Button>
          </div>
        </div>
      </Card>
    </Can>
  )
}
