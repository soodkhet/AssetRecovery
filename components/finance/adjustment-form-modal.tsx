'use client'

import { useEffect, useState } from 'react'
import {
  Button,
  Field,
  InlineAlert,
  Input,
  Modal,
  RefText,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { ADJUSTMENT_TARGET_LABEL, ADJUSTMENT_TARGET_TYPES, type AdjustmentTargetType } from '@/lib/adjustments/adjustment'
import { periodStatusBadgeGroup, periodStatusLabel } from '@/lib/adjustments/adjustment-ui'
import type { AdjustmentDto, AdjustmentTargetDto } from '@/lib/adjustments/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'

/**
 * Modal "สร้างรายการปรับปรุง" (`20` §8 · mockup `finance.html` `adjustment-form`)
 *
 * ลำดับตามสเปค: **เลือกชนิดเป้าหมาย → ค้นหาจากเลขที่อ้างอิง → เลือกรายการ** แล้วระบบแสดง
 * สถานะรอบบัญชีที่จะถูก snapshot + **ระดับอนุมัติที่ต้องใช้** ก่อนกดสร้าง
 * (ข้อมูลนี้มาจาก `GET /api/adjustments/targets` — หน้าจอคำนวณเองไม่ได้)
 *
 * ⚠️ ยอดกรอกเป็น **บาท** แล้วแปลงด้วย `parseBahtInput()` (Rule 01) · ค่าบวกเสมอ ทิศทางอยู่ที่ประเภท
 * ⚠️ เหตุผลบังคับกรอกทุกครั้ง (`REASON_REQUIRED` — `20` §10 ไม่มีข้อยกเว้น)
 */
export function AdjustmentFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { showToast } = useToast()
  const [targetType, setTargetType] = useState<AdjustmentTargetType>('revenue')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [targets, setTargets] = useState<readonly AdjustmentTargetDto[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<AdjustmentTargetDto | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const params = new URLSearchParams({ targetType, q: query })
      const result = await callApi<AdjustmentTargetDto[]>(`/api/adjustments/targets?${params.toString()}`)
      if (cancelled) return
      setTargets(result.data ?? [])
      setSearching(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, targetType, query])

  if (!open) return null

  const amountSatang = parseBahtInput(amount) ?? Number.NaN
  const validAmount = Number.isInteger(amountSatang) && amountSatang > 0
  const ready = selected !== null && validAmount && reason.trim().length >= 5

  function changeTargetType(value: string): void {
    const next = ADJUSTMENT_TARGET_TYPES.find((item) => item === value) ?? 'revenue'
    setTargetType(next)
    setSelected(null)
    setTargets([])
    setSearch('')
    setQuery('')
  }

  function close(): void {
    setSelected(null)
    setSearch('')
    setQuery('')
    setAmount('')
    setReason('')
    onClose()
  }

  async function submit(): Promise<void> {
    if (selected === null || !validAmount) return
    setSaving(true)
    const result = await callApi<AdjustmentDto>(
      '/api/adjustments',
      jsonRequest('POST', {
        targetType: selected.targetType,
        targetId: selected.targetId,
        adjustmentType,
        amountSatang,
        reason: reason.trim(),
      }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'สร้างรายการปรับปรุงแล้ว',
      description: `${selected.targetRef} — รออนุมัติตามระดับ: ${(result.data?.requiredApproverRoles ?? []).join(' + ')}`,
    })
    onCreated()
    close()
  }

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title="สร้างรายการปรับปรุง (New Adjustment)"
      description="ไม่แก้รายการต้นทาง — สร้างรายการชดเชยใหม่พร้อมร่องรอยตรวจสอบ"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            สร้างรายการ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">
          Adjustment ไม่แก้ source record — สร้างรายการชดเชยใหม่เสมอ ·
          ระดับอนุมัติขึ้นกับ<b>สถานะรอบบัญชีของรายการต้นทาง</b> ที่ระบบ snapshot ให้ตอนสร้าง
        </InlineAlert>

        <Field label="ประเภทรายการต้นทาง" required>
          <Select value={targetType} onChange={(event) => changeTargetType(event.target.value)}>
            {ADJUSTMENT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {ADJUSTMENT_TARGET_LABEL[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ค้นหาเลขที่อ้างอิงของรายการต้นทาง" hint="เว้นว่าง = รายการล่าสุด 20 รายการ">
          <div className="flex gap-2">
            <Input
              value={search}
              placeholder="เช่น CASE-26-0012 · มิถุนายน 2569 · ชื่อรอบจ่าย"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              loading={searching}
              onClick={() => {
                setSearching(true)
                setSelected(null)
                setQuery(search.trim())
              }}
            >
              ค้นหา
            </Button>
          </div>
        </Field>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
          {targets.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">ไม่พบรายการต้นทางตามคำค้นนี้</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {targets.map((target) => (
                <li key={target.targetId}>
                  <button
                    type="button"
                    onClick={() => setSelected(target)}
                    className={cn(
                      'focus-ring flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50',
                      selected?.targetId === target.targetId && 'bg-slate-50',
                    )}
                  >
                    <span>
                      <RefText>{target.targetRef}</RefText>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{target.targetLabel}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-xs font-semibold text-slate-800">
                        {fmtSatangSymbol(target.currentSatang)}
                      </span>
                      <span className="text-[10px] text-slate-400">{fmtDate(target.targetDate)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected !== null && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>สถานะรอบบัญชีของรายการต้นทาง:</span>
              <StatusBadge
                status={selected.periodStatusAtTarget ?? 'collecting'}
                group={periodStatusBadgeGroup(selected.periodStatusAtTarget)}
                label={periodStatusLabel(selected.periodStatusAtTarget)}
              />
            </div>
            <p className="text-xs font-semibold text-slate-800">
              ต้องผ่านการอนุมัติ: {selected.requiredApproverRoles.join(' + ')}
            </p>
            <p className="text-[11px] text-slate-500">{selected.approvalPolicyLabel}</p>
            {selected.directEditBlocked && (
              <InlineAlert tone="warning">
                รายการนี้แก้ยอดตรงไม่ได้แล้ว — รายการปรับปรุงคือช่องทางเดียวที่ใช้แก้ยอดได้
              </InlineAlert>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ประเภทการปรับปรุง" required>
            <Select
              value={adjustmentType}
              onChange={(event) => setAdjustmentType(event.target.value === 'decrease' ? 'decrease' : 'increase')}
            >
              <option value="increase">เพิ่มยอด (increase)</option>
              <option value="decrease">ลดยอด (decrease)</option>
            </Select>
          </Field>

          <Field label="ยอดที่ปรับ (บาท — บวกเสมอ)" required>
            <Input
              numeric
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        </div>

        <Field label="เหตุผล" required hint="บังคับกรอกเสมอ อย่างน้อย 5 ตัวอักษร (REASON_REQUIRED)">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ยอดเดิมคำนวณ % จากฐานผิด ยอดที่ถูกต้องคือ 8,250 บาท"
          />
        </Field>
      </div>
    </Modal>
  )
}
