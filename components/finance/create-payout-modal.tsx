'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { PayoutBatchDto } from '@/lib/payout/types'

/**
 * Modal "สร้างรอบจ่ายเงิน" (`17` §8 · mockup `finance.html` `create-payout`)
 *
 * ผู้ใช้เลือกแค่ **ฝั่ง + วันตัดรอบ** — ระบบดึงรายการที่อนุมัติแล้ว (และเงินทดรองที่ยังไม่จ่าย)
 * มารวมเองทั้งหมด แล้วเปลี่ยน `draft → checking` ทันที (`17` §9 — ไม่มีปุ่มให้กด)
 *
 * ⚠️ ห้ามคิดยอดล่วงหน้าบนหน้าจอ — ยอดของรอบมาจาก API หลังสร้างเสร็จเท่านั้น (Rule 01)
 * ⚠️ `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (browser บังคับ — Rule 01)
 */
export function CreatePayoutModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { showToast } = useToast()
  const [side, setSide] = useState<'outsource' | 'inhouse'>('outsource')
  const [cutoffDate, setCutoffDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function submit(): Promise<void> {
    if (cutoffDate === '') return
    setSaving(true)
    const result = await callApi<PayoutBatchDto>(
      '/api/payout-batches',
      jsonRequest('POST', { side, cutoffDate, name: name.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'สร้างรอบจ่ายเงินแล้ว',
      description: `${result.data?.name ?? ''} — ตรวจสอบยอดก่อนสร้างไฟล์โอน`,
    })
    setCutoffDate('')
    setName('')
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="สร้างรอบจ่ายเงิน (Create Payout Batch)"
      description="ระบบรวบรวมรายการที่อนุมัติแล้วภายในวันตัดรอบให้อัตโนมัติ"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={cutoffDate === ''} onClick={() => void submit()}>
            สร้างรอบจ่าย
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="warning">
          ห้ามรวม Inhouse + Outsource ในรอบเดียวกัน (MIXED_SIDE_BATCH) — ผู้รับเงินที่ยังไม่ยืนยันข้อมูล
          ธนาคาร/ภาษีจะถูกบล็อกทั้งรอบ (UNVERIFIED_PAYEE_IN_PAYOUT)
        </InlineAlert>

        <Field label="ฝั่งของรอบการจ่าย" required>
          <Select value={side} onChange={(event) => setSide(event.target.value === 'inhouse' ? 'inhouse' : 'outsource')}>
            <option value="outsource">Outsource (หัก WHT ตาม Tax Profile ของผู้รับเงิน)</option>
            <option value="inhouse">Inhouse</option>
          </Select>
        </Field>

        <Field label="วันตัดรอบ (Cut-off Date)" required>
          <Input type="date" value={cutoffDate} onChange={(event) => setCutoffDate(event.target.value)} />
        </Field>

        <InlineAlert tone="info">
          ระบบดึงรายการ <b>ที่อนุมัติแล้ว</b> ของผู้รับเงินที่ <b>ยืนยันแล้ว</b> ถึงวันตัดรอบมารวมอัตโนมัติ —
          WHT คิดต่อรายการตาม Tax Profile ของแต่ละคน (เงินทดรองจ่ายไม่หัก WHT)
        </InlineAlert>

        <Field label="ชื่อรอบจ่าย (เว้นว่าง = ระบบตั้งให้จากฝั่ง + วันตัดรอบ)">
          <Input
            placeholder="เช่น รอบจ่าย Outsource ตัดรอบ 30/06/2569"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
