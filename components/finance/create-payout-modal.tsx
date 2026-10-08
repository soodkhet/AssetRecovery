'use client'

import { useEffect, useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, useToast } from '@/components/ui'
import {
  ClosedPeriodCutoffAlert,
  isClosedPeriodCutoffError,
  isCutoffInClosedPeriod,
  ClosedPeriodsUnavailableNote,
  useClosedPeriods,
} from '@/components/finance/closed-period-cutoff-alert'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { PayoutBatchDto } from '@/lib/payout/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { cycleCoversSide, pickMatchingCycle, suggestCutoffDate, suggestOpenCutoffDate } from '@/lib/settings/cycles'
import type { CycleDto } from '@/lib/settings/types'

/** รอบ AP ในรูปที่ใช้ตัดสินขอบเขต (มติ PO U133) */
function scopeOf(cycle: CycleDto) {
  return { ...cycle, companyIds: [] }
}

/** ค่า select "ไม่ใช้รอบ" */
const NO_CYCLE = 'none'

/**
 * Modal "สร้างรอบจ่ายเงิน" (`17` §8 · mockup `finance.html` `create-payout`)
 *
 * ผู้ใช้เลือกแค่ **ฝั่ง + วันตัดรอบ** — ระบบดึงรายการที่อนุมัติแล้ว (และเงินทดรองที่ยังไม่จ่าย)
 * มารวมเองทั้งหมด แล้วเปลี่ยน `draft → checking` ทันที (`17` §9 — ไม่มีปุ่มให้กด)
 *
 * ⚠️ ห้ามคิดยอดล่วงหน้าบนหน้าจอ — ยอดของรอบมาจาก API หลังสร้างเสร็จเท่านั้น (Rule 01)
 * ⚠️ `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (browser บังคับ — Rule 01)
 * ⚠️ มติ PO U133: ระบบเลือกรอบจ่าย (AP) ที่ใช้กับฝั่งนั้นให้อัตโนมัติ (แก้ได้ รวมถึง "ไม่ใช้รอบ") — กำหนดจ่าย
 *    คำนวณฝั่ง server จากเงื่อนไขของรอบ (หน้าจอไม่คิดเอง)
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
  /**
   * วันตัดรอบที่ผู้ใช้แก้เอง — `null` = ใช้วันที่ระบบเสนอตามรอบจ่าย (เติมให้ตั้งแต่เปิด เหมือน modal รอบวางบิล ·
   * preship R9-005 — เดิมเปิดมาว่างแล้วมีแค่ลิงก์ให้กด)
   */
  const [cutoffOverride, setCutoffOverride] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  /** วันตัดรอบที่ server ปฏิเสธเพราะงวดปิดแล้ว — แสดงคำแนะนำใต้ช่องจนกว่าจะเปลี่ยนวัน (R7-009) */
  const [closedCutoff, setClosedCutoff] = useState<string | null>(null)
  const closedPeriods = useClosedPeriods(open)
  const isPeriodClosed = closedPeriods.isClosed
  const [cycles, setCycles] = useState<readonly CycleDto[]>([])
  /** `null` = ให้ระบบเลือกตามฝั่ง · `NO_CYCLE` = ไม่ใช้รอบ · อื่น = id รอบที่ผู้ใช้เลือกเอง */
  const [cycleChoice, setCycleChoice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const result = await callApi<CycleDto[]>('/api/settings/cycles?type=AP&status=active')
      if (!cancelled) setCycles(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const matchingCycles = cycles.filter((cycle) => cycleCoversSide(scopeOf(cycle), side))
  const autoCycleId = pickMatchingCycle(cycles.map(scopeOf), { side })?.id ?? NO_CYCLE
  const selectedCycle = cycleChoice ?? autoCycleId
  // มติ PO U146 — รอบเป็นที่กำหนดวันตัดรอบ: เสนอวันตัดรอบล่าสุดตามกติกาของรอบที่เลือก (กดใช้ได้ · แก้ได้)
  // ไม่เสนอวันในงวดที่ปิดแล้ว — เสนอวันนี้แทน (P11 · R7-009)
  const cycleForCutoff = cycles.find((cycle) => cycle.id === selectedCycle) ?? null
  const today = new Date(`${toInputDate(new Date())}T00:00:00Z`)
  const suggestedCutoff =
    cycleForCutoff === null
      ? null
      : suggestOpenCutoffDate(cycleForCutoff, today, isPeriodClosed).toISOString().slice(0, 10)
  // วันตามกติกาของรอบอยู่ในงวดปิด ⇒ ค่าที่เสนอคือวันนี้ — ป้ายปุ่มต้องบอกตามจริง (R8-002)
  const suggestedIsFallback =
    cycleForCutoff !== null && suggestedCutoff !== suggestCutoffDate(cycleForCutoff, today).toISOString().slice(0, 10)
  const cutoffDate = cutoffOverride ?? suggestedCutoff ?? ''
  const showClosedAlert =
    (closedCutoff !== null && closedCutoff === cutoffDate) || isCutoffInClosedPeriod(cutoffDate, isPeriodClosed)

  async function submit(): Promise<void> {
    if (cutoffDate === '') return
    setSaving(true)
    const result = await callApi<PayoutBatchDto>(
      '/api/payout-batches',
      jsonRequest('POST', {
        side,
        cutoffDate,
        name: name.trim(),
        cycleId: selectedCycle === NO_CYCLE ? null : selectedCycle,
      }),
    )
    setSaving(false)
    if (isClosedPeriodCutoffError(result.error)) {
      setClosedCutoff(cutoffDate)
      return
    }
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'สร้างรอบจ่ายเงินแล้ว',
      description: `${result.data?.name ?? ''} — ตรวจสอบยอดก่อนสร้างไฟล์โอน`,
    })
    // `WHT_RATE_FALLBACK_TO_PLAN` = เตือนไม่บล็อก ⇒ รอบสร้างสำเร็จแล้ว แต่ต้องแจ้งว่าใครใช้อัตราสำรอง
    // (`18` §6.3 — ห้ามคิดอัตราจากแผนเงียบ ๆ) · แยก toast ต่างหากเพื่อไม่ให้กลืนไปกับข้อความสำเร็จ
    if (result.warning !== undefined) {
      showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
    }
    setCutoffOverride(null)
    setName('')
    setCycleChoice(null)
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
          <Button variant="secondary" onClick={onClose}>
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
          ห้ามรวม Inhouse + Outsource ในรอบเดียวกัน — ผู้รับเงินที่ยังไม่ยืนยันข้อมูล
          ธนาคาร/ภาษีจะถูกบล็อกทั้งรอบ
        </InlineAlert>

        <Field label="ฝั่งของรอบการจ่าย" required>
          <Select
            value={side}
            onChange={(event) => {
              setSide(event.target.value === 'inhouse' ? 'inhouse' : 'outsource')
              // เปลี่ยนฝั่ง = ให้ระบบเลือกรอบที่ตรงฝั่งใหม่ และใช้วันตัดรอบที่รอบนั้นเสนอ
              setCycleChoice(null)
              setCutoffOverride(null)
            }}
          >
            <option value="outsource">Outsource (หัก WHT ตาม Tax Profile ของผู้รับเงิน)</option>
            <option value="inhouse">Inhouse</option>
          </Select>
        </Field>

        <Field label="วันตัดรอบ (Cut-off Date)" required>
          <Input type="date" value={cutoffDate} onChange={(event) => setCutoffOverride(event.target.value)} />
          {cutoffOverride === null && suggestedIsFallback && (
            <p className="mt-1 text-[11px] text-slate-500">วันตัดรอบตามรอบจ่ายอยู่ในงวดที่ปิดแล้ว — ระบบใช้วันนี้แทน (แก้ได้)</p>
          )}
          {/* วันตามรอบจ่ายที่ server เพิ่งปฏิเสธ (งวดปิด) ไม่เสนอซ้ำ (R7-009) · คำเตือนงวดปิดมีปุ่มใช้วันนี้อยู่แล้ว
              ไม่แสดงปุ่มซ้ำ (R8-002) */}
          {suggestedCutoff !== null && suggestedCutoff !== cutoffDate && suggestedCutoff !== closedCutoff && !showClosedAlert && (
            <button
              type="button"
              className="focus-ring mt-1 inline-flex items-center text-left text-[11px] font-semibold text-emerald-700 hover:underline pointer-coarse:min-h-11"
              onClick={() => setCutoffOverride(null)}
            >
              {suggestedIsFallback
                ? `ใช้วันนี้ (${fmtDate(`${suggestedCutoff}T00:00:00Z`)}) — วันตัดรอบตามรอบจ่ายอยู่ในงวดที่ปิดแล้ว`
                : `ใช้วันตัดรอบตามรอบจ่าย (${fmtDate(`${suggestedCutoff}T00:00:00Z`)})`}
            </button>
          )}
          {closedPeriods.status === 'error' && <ClosedPeriodsUnavailableNote />}
        </Field>

        {showClosedAlert && <ClosedPeriodCutoffAlert onUseToday={setCutoffOverride} />}

        <Field
          label="รอบจ่าย (AP) ที่ใช้กำหนดวันจ่าย"
          hint={
            matchingCycles.length === 0
              ? 'ยังไม่มีรอบจ่ายที่ใช้กับฝั่งนี้ — ตั้งได้ที่ตั้งค่า > รอบบิล/รอบจ่าย'
              : 'ระบบเลือกรอบที่ใช้กับฝั่งนี้ให้แล้ว — กำหนดจ่ายคิดจากวันตัดรอบตามเงื่อนไขของรอบ'
          }
        >
          <Select
            value={selectedCycle}
            onChange={(event) => {
              setCycleChoice(event.target.value)
              setCutoffOverride(null)
            }}
          >
            <option value={NO_CYCLE}>— ไม่ใช้รอบ (ไม่มีกำหนดจ่าย) —</option>
            {matchingCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name} · {cycle.dueRule}
              </option>
            ))}
          </Select>
        </Field>

        {/* มติ PO 03/10/2569 (UAT Q5 · R6-G) — เกณฑ์ WHT ต่อ payee ต่อรอบจ่าย ไม่ใช่ต่อรายการ */}
        <InlineAlert tone="info">
          ระบบดึงรายการ <b>ที่อนุมัติแล้ว</b> ของผู้รับเงินที่ <b>ยืนยันแล้ว</b> ถึงวันตัดรอบมารวมอัตโนมัติ —
          WHT คิดจากยอดรวมของผู้รับเงินแต่ละคนในรอบจ่ายนี้ ตาม Tax Profile ของคนนั้น — หักเมื่อยอดรวมถึงเกณฑ์
          ขั้นต่ำ (เงินทดรองจ่ายไม่หัก WHT)
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
