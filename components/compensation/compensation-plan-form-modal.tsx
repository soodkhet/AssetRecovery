'use client'

import { useState } from 'react'
import {
  Button,
  Field,
  InlineAlert,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { compensationPlanCreateSchema } from '@/lib/compensation/schemas'
import type { CompensationPlanListDto } from '@/lib/compensation/types'
import type { FuelMode, TeamSide } from '@/lib/compensation/plan'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'
import { toInputDate } from '@/lib/format/datetime'

/**
 * ฟอร์มสร้าง/แก้ไขแผนค่าตอบแทน — โครงตาม mockup `settings.html` (modal `create-comp`/`edit-comp`)
 *
 * - **Fuel toggle 2 โหมด** (`11` §8): สลับโหมดแล้วซ่อนฟิลด์ของอีกโหมดทั้งหมด ไม่ทิ้งไว้ให้สับสน
 * - `commission` / `no_success_fee` เป็น 2 ช่องแยกพร้อม label เงื่อนไข (`11` §8)
 * - ช่องเงินกรอกเป็น **บาท** แล้วแปลงเป็นสตางค์ด้วย `parseBahtInput()` ก่อนส่ง (Rule 01)
 * - แก้ไขแผนที่ใช้งานอยู่ = **สร้างเวอร์ชันใหม่** ไม่ทับของเดิม (`11` §10) — เตือนบนฟอร์มให้เห็นชัด
 *
 * validation ใช้ Zod schema ตัวเดียวกับ API (`lib/compensation/schemas.ts`) — UI เป็นแค่ UX
 */

interface FormState {
  name: string
  side: TeamSide
  fuelMode: FuelMode
  fuelRatePerKm: string
  fuelMaxPerCase: string
  fuelDailyFlat: string
  allowance: string
  commission: string
  noSuccessFee: string
  hotelMaxPerNight: string
  hotelReceiptRequired: boolean
  whtPct: string
  effectiveFrom: string
  reason: string
}

function emptyForm(): FormState {
  return {
    name: '',
    side: 'inhouse',
    fuelMode: 'PER_KM',
    fuelRatePerKm: '',
    fuelMaxPerCase: '',
    fuelDailyFlat: '',
    allowance: '0.00',
    commission: '0.00',
    noSuccessFee: '0.00',
    hotelMaxPerNight: '',
    hotelReceiptRequired: true,
    whtPct: '3',
    effectiveFrom: toInputDate(new Date()),
    reason: '',
  }
}

function formOf(plan: CompensationPlanListDto): FormState {
  return {
    name: plan.name,
    side: plan.side,
    fuelMode: plan.fuelMode,
    fuelRatePerKm: toBahtInput(plan.fuelRatePerKmSatang),
    fuelMaxPerCase: toBahtInput(plan.fuelMaxPerCaseSatang),
    fuelDailyFlat: toBahtInput(plan.fuelDailyFlatSatang),
    allowance: toBahtInput(plan.allowanceSatang),
    commission: toBahtInput(plan.commissionSatang),
    noSuccessFee: toBahtInput(plan.noSuccessFeeSatang),
    hotelMaxPerNight: toBahtInput(plan.hotelMaxPerNightSatang),
    hotelReceiptRequired: plan.hotelReceiptRequired,
    whtPct: String(plan.whtPct),
    effectiveFrom: plan.effectiveFrom,
    reason: '',
  }
}

/** ช่องว่าง = ไม่กำหนด (null) · ค่าที่ไม่ใช่ตัวเลขปล่อยเป็น `NaN` ให้ Zod ปฏิเสธพร้อมข้อความ */
function satangOf(value: string): number | null {
  return parseBahtInput(value)
}

/** ฟิลด์ของโหมดที่ไม่ได้เลือกต้องเป็น `null` เสมอ ไม่ใช่แค่ซ่อนใน UI (`11` §7.1) */
function payloadOf(form: FormState): Record<string, unknown> {
  const perKm = form.fuelMode === 'PER_KM'
  return {
    name: form.name.trim(),
    side: form.side,
    fuelMode: form.fuelMode,
    fuelRatePerKmSatang: perKm ? satangOf(form.fuelRatePerKm) : null,
    fuelMaxPerCaseSatang: perKm ? satangOf(form.fuelMaxPerCase) : null,
    fuelDailyFlatSatang: perKm ? null : satangOf(form.fuelDailyFlat),
    allowanceSatang: satangOf(form.allowance) ?? 0,
    commissionSatang: satangOf(form.commission) ?? 0,
    noSuccessFeeSatang: satangOf(form.noSuccessFee) ?? 0,
    hotelMaxPerNightSatang: satangOf(form.hotelMaxPerNight),
    hotelReceiptRequired: form.hotelReceiptRequired,
    whtPct: Number(form.whtPct),
    effectiveFrom: form.effectiveFrom,
    reason: form.reason.trim(),
  }
}

const TOGGLE_BASE = 'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors'

export function CompensationPlanFormModal({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean
  /** null = สร้างใหม่ */
  plan: CompensationPlanListDto | null
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(plan === null ? emptyForm() : formOf(plan))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isEdit = plan !== null

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    const parsed = compensationPlanCreateSchema.safeParse(payloadOf(form))
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || '_'
        if (fields[path] === undefined) fields[path] = issue.message
      }
      setErrors(fields)
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<CompensationPlanListDto>(
        isEdit ? `/api/compensation-plans/${plan.id}` : '/api/compensation-plans',
        jsonRequest(isEdit ? 'PATCH' : 'POST', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: isEdit ? 'บันทึกเป็นเวอร์ชันใหม่แล้ว' : 'สร้างแผนค่าตอบแทนแล้ว',
        description: form.name.trim(),
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const perKm = form.fuelMode === 'PER_KM'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `แก้ไขแผนค่าตอบแทน — ${plan.name}` : 'สร้างแผนค่าตอบแทน'}
      description={
        isEdit
          ? `บันทึกแล้วระบบจะสร้างเวอร์ชัน ${plan.version + 1} ใหม่ ไม่ทับของเดิม (ไฟล์ 11 §10)`
          : 'ค่าตอบแทนที่จ่ายออกให้ทีมงาน — ผูกกับทีมในขั้นตอนจัดการทีม'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {isEdit ? 'บันทึกเป็นเวอร์ชันใหม่' : 'สร้างแผน'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isEdit && plan.teamCount > 0 && (
          <InlineAlert tone="warning" title={`มี ${plan.teamCount} ทีมผูกอยู่กับแผนนี้`}>
            ทีมทั้งหมดจะถูกย้ายมาใช้เวอร์ชันใหม่ทันที — ค่าใช้จ่ายที่บันทึกไว้แล้วยังอ้างเวอร์ชันเดิมเสมอ
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="plan-name" label="ชื่อแผน" required error={errors.name}>
            <Input
              id="plan-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="เช่น แผนทีมอินเฮ้าส์ 2569"
            />
          </Field>

          <Field id="plan-side" label="ฝั่งทีม" required error={errors.side}>
            <Select id="plan-side" value={form.side} onChange={(event) => set('side', event.target.value as TeamSide)}>
              <option value="inhouse">Inhouse</option>
              <option value="outsource">Outsource</option>
            </Select>
          </Field>
        </div>

        {/* Fuel Rule — เลือกได้โหมดเดียว (`11` §7.1) */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-700">⛽ ค่าน้ำมัน — เลือก 1 ใน 2 โหมด</span>
            <div className="flex w-56 gap-1 rounded-lg bg-slate-200 p-1">
              <button
                type="button"
                onClick={() => set('fuelMode', 'PER_KM')}
                className={cn(TOGGLE_BASE, perKm ? 'bg-white text-slate-900 shadow' : 'text-slate-500')}
              >
                ตามระยะทาง
              </button>
              <button
                type="button"
                onClick={() => set('fuelMode', 'DAILY_FLAT')}
                className={cn(TOGGLE_BASE, perKm ? 'text-slate-500' : 'bg-white text-slate-900 shadow')}
              >
                เหมาจ่ายรายวัน
              </button>
            </div>
          </div>

          {perKm ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="fuel-rate" label="อัตราต่อกิโลเมตร (บาท)" required error={errors.fuelRatePerKmSatang}>
                <Input
                  id="fuel-rate"
                  numeric
                  inputMode="decimal"
                  value={form.fuelRatePerKm}
                  onChange={(event) => set('fuelRatePerKm', event.target.value)}
                  placeholder="7.00"
                />
              </Field>
              <Field
                id="fuel-max"
                label="เพดานต่อเคส (บาท)"
                hint="เว้นว่าง = ไม่จำกัดเพดาน"
                error={errors.fuelMaxPerCaseSatang}
              >
                <Input
                  id="fuel-max"
                  numeric
                  inputMode="decimal"
                  value={form.fuelMaxPerCase}
                  onChange={(event) => set('fuelMaxPerCase', event.target.value)}
                  placeholder="1,000.00"
                />
              </Field>
            </div>
          ) : (
            <Field
              id="fuel-daily"
              label="เหมาจ่ายต่อวัน (บาท)"
              required
              hint="ไม่คำนวณตามระยะทาง — คนละตัวกับเพดานของโหมดตามระยะทาง"
              error={errors.fuelDailyFlatSatang}
            >
              <Input
                id="fuel-daily"
                numeric
                inputMode="decimal"
                value={form.fuelDailyFlat}
                onChange={(event) => set('fuelDailyFlat', event.target.value)}
                placeholder="400.00"
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="plan-allowance" label="เบี้ยเลี้ยง (บาท/วัน)" required error={errors.allowanceSatang}>
            <Input
              id="plan-allowance"
              numeric
              inputMode="decimal"
              value={form.allowance}
              onChange={(event) => set('allowance', event.target.value)}
            />
          </Field>

          <Field
            id="plan-hotel"
            label="ค่าที่พักสูงสุด (บาท/คืน)"
            hint="เว้นว่าง = ไม่กำหนดเพดาน"
            error={errors.hotelMaxPerNightSatang}
          >
            <Input
              id="plan-hotel"
              numeric
              inputMode="decimal"
              value={form.hotelMaxPerNight}
              onChange={(event) => set('hotelMaxPerNight', event.target.value)}
            />
          </Field>

          <Field
            id="plan-commission"
            label="ค่าคอมมิชชั่น (บาท/เคส)"
            required
            hint="จ่ายเมื่อปิดเคส **สำเร็จ**"
            error={errors.commissionSatang}
          >
            <Input
              id="plan-commission"
              numeric
              inputMode="decimal"
              value={form.commission}
              onChange={(event) => set('commission', event.target.value)}
            />
          </Field>

          <Field
            id="plan-no-success"
            label="เบี้ยเสี่ยง (บาท/เคส)"
            required
            hint="จ่ายเมื่อปิดเคส **ไม่สำเร็จ** — เคสหนึ่งได้อย่างใดอย่างหนึ่งเท่านั้น"
            error={errors.noSuccessFeeSatang}
          >
            <Input
              id="plan-no-success"
              numeric
              inputMode="decimal"
              value={form.noSuccessFee}
              onChange={(event) => set('noSuccessFee', event.target.value)}
            />
          </Field>

          <Field
            id="plan-wht"
            label="หัก ณ ที่จ่าย (%)"
            required
            hint="ใช้เมื่อ payee ไม่มี tax profile — Payee-level ชนะเสมอ (ไฟล์ 18 §6.3)"
            error={errors.whtPct}
          >
            <Input
              id="plan-wht"
              numeric
              inputMode="decimal"
              value={form.whtPct}
              onChange={(event) => set('whtPct', event.target.value)}
            />
          </Field>

          <Field id="plan-effective" label="เริ่มมีผลวันที่" required error={errors.effectiveFrom}>
            <Input
              id="plan-effective"
              type="date"
              value={form.effectiveFrom}
              onChange={(event) => set('effectiveFrom', event.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.hotelReceiptRequired}
            onChange={(event) => set('hotelReceiptRequired', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          บังคับแนบใบเสร็จค่าที่พัก (มีผลต่อการตรวจรายการเบิก — ไฟล์ 11 §10)
        </label>

        <Field id="plan-reason" label="เหตุผล" required hint="บันทึกลง audit log ถาวร (ไฟล์ 90 §13 — หมวดเงิน)" error={errors.reason}>
          <Textarea
            id="plan-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น ปรับอัตราค่าน้ำมันตามมติที่ประชุม 14/08/2569"
          />
        </Field>
      </div>
    </Modal>
  )
}
