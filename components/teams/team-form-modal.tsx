'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { CompensationPlanListDto } from '@/lib/compensation/types'
import { PROVINCE_DATA } from '@/lib/teams/provinces'
import { teamCreateSchema } from '@/lib/teams/schemas'
import type { TeamSide, TeamStatus } from '@/lib/teams/team'
import type { EligibleMemberDto, TeamDto } from '@/lib/teams/types'

/**
 * ฟอร์มสร้าง/แก้ไขทีม — โครงตาม mockup `settings.html` (modal `create-team`/`edit-team`)
 *
 * จุดบังคับ: **ต้องเลือกแผนค่าตอบแทนเสมอ** (`09` §7) · ผู้จัดการเลือกได้หลายคน (N:N) แต่
 * หัวหน้าทีมเลือกได้คนเดียวและคนนั้นต้องยังไม่เป็นหัวหน้าของทีมอื่น (`09` §7.1 — ฟอร์มเตือน
 * ล่วงหน้าเป็น UX เท่านั้น API ปฏิเสธซ้ำเสมอด้วย `SUPERVISOR_ALREADY_ASSIGNED`)
 */

interface FormState {
  name: string
  side: TeamSide
  compensationPlanId: string
  supervisorId: string
  managerIds: string[]
  provinces: string[]
  status: TeamStatus
  reason: string
}

function emptyForm(defaultPlanId: string): FormState {
  return {
    name: '',
    side: 'inhouse',
    compensationPlanId: defaultPlanId,
    supervisorId: '',
    managerIds: [],
    provinces: [],
    status: 'active',
    reason: '',
  }
}

function formOf(team: TeamDto): FormState {
  return {
    name: team.name,
    side: team.side,
    compensationPlanId: team.compensationPlanId,
    supervisorId: team.supervisor?.id ?? '',
    managerIds: team.managers.map((manager) => manager.id),
    provinces: [...team.provinces],
    status: team.status,
    reason: '',
  }
}

function payloadOf(form: FormState): Record<string, unknown> {
  return {
    name: form.name.trim(),
    side: form.side,
    compensationPlanId: form.compensationPlanId === '' ? undefined : form.compensationPlanId,
    supervisorId: form.supervisorId === '' ? null : form.supervisorId,
    managerIds: form.managerIds,
    provinces: form.provinces,
    status: form.status,
    reason: form.reason.trim(),
  }
}

export function TeamFormModal({
  open,
  team,
  plans,
  members,
  onClose,
  onSaved,
}: {
  open: boolean
  /** null = สร้างใหม่ */
  team: TeamDto | null
  plans: readonly CompensationPlanListDto[]
  members: readonly EligibleMemberDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(
    team === null ? emptyForm(plans[0]?.id ?? '') : formOf(team),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isEdit = team !== null
  const supervisorConflict = members.find(
    (member) =>
      member.id === form.supervisorId &&
      member.supervisedTeamId !== null &&
      member.supervisedTeamId !== team?.id,
  )

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggle(key: 'managerIds' | 'provinces', value: string): void {
    setForm((current) => {
      const list = current[key]
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      }
    })
  }

  async function save(): Promise<void> {
    const parsed = teamCreateSchema.safeParse(payloadOf(form))
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
      const result = await callApi<TeamDto>(
        isEdit ? `/api/teams/${team.id}` : '/api/teams',
        jsonRequest(isEdit ? 'PATCH' : 'POST', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: isEdit ? 'บันทึกข้อมูลทีมแล้ว' : 'สร้างทีมแล้ว',
        description: form.name.trim(),
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `แก้ไขทีม — ${team.name}` : 'สร้างทีมติดตามทรัพย์'}
      description="ทุกทีมต้องผูกแผนค่าตอบแทนเสมอ (ไฟล์ 09 §7) — ผู้จัดการดูแลได้หลายทีม ส่วนหัวหน้าทีมสังกัดได้ทีมเดียว"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {isEdit ? 'บันทึกการแก้ไข' : 'สร้างทีม'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {plans.length === 0 && (
          <InlineAlert tone="warning" title="ยังไม่มีแผนค่าตอบแทนที่ใช้งานอยู่">
            สร้างแผนค่าตอบแทนที่หน้า “แผนค่าตอบแทน” ก่อน — ทีมที่ไม่มีแผนสร้างไม่ได้ (ไฟล์ 09 §7)
          </InlineAlert>
        )}

        <Field id="team-name" label="ชื่อทีม" required error={errors.name}>
          <Input
            id="team-name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder='เช่น "ทีมกรุงเทพ 1"'
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="team-side" label="ฝั่ง (Group)" required error={errors.side}>
            <Select id="team-side" value={form.side} onChange={(event) => set('side', event.target.value as TeamSide)}>
              <option value="inhouse">Inhouse</option>
              <option value="outsource">Outsource</option>
            </Select>
          </Field>

          <Field id="team-plan" label="แผนค่าตอบแทน" required error={errors.compensationPlanId}>
            <Select
              id="team-plan"
              value={form.compensationPlanId}
              onChange={(event) => set('compensationPlanId', event.target.value)}
            >
              <option value="">— เลือกแผนค่าตอบแทน —</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.side} · v{plan.version})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="team-supervisor"
            label="หัวหน้าทีมติดตามทรัพย์ (เลือกได้ 1 คน)"
            error={errors.supervisorId}
            hint="หัวหน้าทีม 1 คนสังกัดได้ทีมเดียวเท่านั้น"
          >
            <Select
              id="team-supervisor"
              value={form.supervisorId}
              onChange={(event) => set('supervisorId', event.target.value)}
            >
              <option value="">— ยังไม่กำหนด —</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} ({member.roleName})
                  {member.supervisedTeamId !== null && member.supervisedTeamId !== team?.id
                    ? ` — เป็นหัวหน้าทีม ${member.supervisedTeamName ?? ''} อยู่แล้ว`
                    : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="team-status" label="สถานะทีม" required error={errors.status}>
            <Select
              id="team-status"
              value={form.status}
              onChange={(event) => set('status', event.target.value as TeamStatus)}
            >
              <option value="active">ใช้งานปกติ (Active)</option>
              <option value="inactive">ปิดใช้งาน (Inactive)</option>
            </Select>
          </Field>
        </div>

        {supervisorConflict !== undefined && (
          <InlineAlert tone="warning" title="หัวหน้าทีมคนนี้สังกัดทีมอื่นอยู่แล้ว">
            {supervisorConflict.fullName} เป็นหัวหน้าทีม “{supervisorConflict.supervisedTeamName ?? '-'}” — ต้องถอดออกจากทีมเดิมก่อน
            ไม่งั้นระบบจะปฏิเสธด้วย `SUPERVISOR_ALREADY_ASSIGNED`
          </InlineAlert>
        )}

        {isEdit && team.activeCaseCount > 0 && form.status === 'inactive' && (
          <InlineAlert tone="warning" title={`ทีมนี้ยังมี ${team.activeCaseCount} เคสที่ยังไม่ปิด`}>
            ย้ายเคสไปทีมอื่นให้หมดก่อน ไม่งั้นระบบจะปฏิเสธด้วย `TEAM_HAS_ACTIVE_CASES` (ไฟล์ 09 §10)
          </InlineAlert>
        )}

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">
            ผู้จัดการทีม (เลือกได้มากกว่า 1 คน) — {form.managerIds.length} คน
          </legend>
          {members.length === 0 ? (
            <p className="p-2 text-xs text-slate-400">ยังไม่มีผู้ใช้ในกลุ่ม Inhouse/Outsource ให้เลือก</p>
          ) : (
            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto p-1 sm:grid-cols-2">
              {members.map((member) => (
                <label key={member.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="focus-ring rounded"
                    checked={form.managerIds.includes(member.id)}
                    onChange={() => toggle('managerIds', member.id)}
                  />
                  <span>
                    {member.fullName} <span className="text-xs text-slate-400">({member.roleName})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {errors.managerIds !== undefined && <p className="mt-1 text-xs text-red-600">{errors.managerIds}</p>}
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">
            จังหวัดที่ดูแล (เลือกได้มากกว่า 1) — {form.provinces.length} จังหวัด
          </legend>
          <div className="max-h-56 space-y-4 overflow-y-auto p-1">
            {PROVINCE_DATA.map((region) => (
              <div key={region.region}>
                <div className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold text-slate-800">
                  {region.region}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {region.provinces.map((province) => (
                    <label
                      key={`${region.region}-${province}`}
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="focus-ring rounded"
                        checked={form.provinces.includes(province)}
                        onChange={() => toggle('provinces', province)}
                      />
                      {province}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {errors.provinces !== undefined && <p className="mt-1 text-xs text-red-600">{errors.provinces}</p>}
        </fieldset>

        <Field id="team-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            id="team-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น ตั้งทีมใหม่รองรับพื้นที่ภาคเหนือ"
          />
        </Field>
      </div>
    </Modal>
  )
}
