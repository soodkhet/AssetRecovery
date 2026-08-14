'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { ROLE_GROUP_LABEL } from '@/lib/roles/role-groups'
import type { RoleListItem } from '@/lib/roles/types'
import type { TeamDto } from '@/lib/teams/types'
import { userCreateSchema } from '@/lib/users/schemas'
import type { UserDto } from '@/lib/users/types'
import { requiredScopeFor } from '@/lib/users/user'

/**
 * ฟอร์มสร้าง/แก้ไขผู้ใช้งาน — โครงตาม mockup `settings.html` (modal `create-user`/`edit-user`)
 *
 * **cascading role select** (`08` §8): เลือกกลุ่ม → role ในกลุ่มนั้น → ทีม (inhouse/outsource)
 * หรือบริษัท (finance_company) · ช่องสังกัดที่ไม่เกี่ยวกับกลุ่มถูก**ซ่อนจริง**ไม่ใช่แค่ disable
 * เพราะค่าที่ค้างอยู่จะทำให้ API ปฏิเสธด้วย `INVALID_USER_SCOPE`
 */

interface FormState {
  roleGroup: RoleGroup
  roleId: string
  email: string
  fullName: string
  phone: string
  employeeCode: string
  teamId: string
  companyId: string
  reason: string
}

function emptyForm(roleGroup: RoleGroup): FormState {
  return {
    roleGroup,
    roleId: '',
    email: '',
    fullName: '',
    phone: '',
    employeeCode: '',
    teamId: '',
    companyId: '',
    reason: '',
  }
}

function formOf(user: UserDto): FormState {
  return {
    roleGroup: user.roleGroup,
    roleId: user.roleId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone ?? '',
    employeeCode: user.employeeCode ?? '',
    teamId: user.teamId ?? '',
    companyId: user.companyId ?? '',
    reason: '',
  }
}

function payloadOf(form: FormState): Record<string, unknown> {
  const scope = requiredScopeFor(form.roleGroup)
  return {
    roleId: form.roleId === '' ? undefined : form.roleId,
    email: form.email.trim(),
    fullName: form.fullName.trim(),
    phone: form.phone.trim() === '' ? null : form.phone.trim(),
    employeeCode: form.employeeCode.trim() === '' ? null : form.employeeCode.trim(),
    teamId: scope === 'team' && form.teamId !== '' ? form.teamId : null,
    companyId: scope === 'company' && form.companyId !== '' ? form.companyId : null,
    reason: form.reason.trim(),
  }
}

export function UserFormModal({
  open,
  user,
  defaultRoleGroup,
  roles,
  teams,
  companies,
  onClose,
  onSaved,
}: {
  open: boolean
  /** null = สร้างใหม่ */
  user: UserDto | null
  defaultRoleGroup: RoleGroup
  roles: readonly RoleListItem[]
  teams: readonly TeamDto[]
  companies: readonly FinanceCompanyDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(user === null ? emptyForm(defaultRoleGroup) : formOf(user))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isEdit = user !== null
  const scope = requiredScopeFor(form.roleGroup)
  const groupRoles = roles.filter((role) => role.roleGroup === form.roleGroup)
  const groupTeams = teams.filter((team) => team.side === (form.roleGroup === 'outsource' ? 'outsource' : 'inhouse'))

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  /** เปลี่ยนกลุ่ม = ล้าง role + สังกัดที่ไม่เกี่ยวกับกลุ่มใหม่ทิ้ง (cascading — `08` §8) */
  function changeRoleGroup(roleGroup: RoleGroup): void {
    setForm((current) => ({ ...current, roleGroup, roleId: '', teamId: '', companyId: '' }))
  }

  async function save(): Promise<void> {
    const parsed = userCreateSchema.safeParse(payloadOf(form))
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || '_'
        if (fields[path] === undefined) fields[path] = issue.message
      }
      setErrors(fields)
      return
    }

    if (scope === 'team' && parsed.data.teamId === null) {
      setErrors({ teamId: 'ผู้ใช้กลุ่ม Inhouse/Outsource ต้องระบุทีม' })
      return
    }
    if (scope === 'company' && parsed.data.companyId === null) {
      setErrors({ companyId: 'ผู้ใช้กลุ่มบริษัทไฟแนนซ์ต้องระบุบริษัท' })
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<UserDto>(
        isEdit ? `/api/users/${user.id}` : '/api/users',
        jsonRequest(isEdit ? 'PATCH' : 'POST', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      if (result.warning !== undefined) {
        showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
      } else {
        showToast({
          tone: 'success',
          title: isEdit ? 'บันทึกข้อมูลผู้ใช้แล้ว' : 'สร้างบัญชีและส่งคำเชิญแล้ว',
          description: isEdit
            ? form.fullName.trim()
            : `${form.fullName.trim()} — ส่งลิงก์ตั้งรหัสผ่านไปที่ ${form.email.trim()} แล้ว`,
        })
      }
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
      title={isEdit ? `แก้ไขผู้ใช้งาน — ${user.fullName}` : 'สร้างบัญชีผู้ใช้งาน'}
      description="เลือกกลุ่ม → บทบาท → สังกัด (ทีมสำหรับ Inhouse/Outsource · บริษัทสำหรับกลุ่มไฟแนนซ์) — ไฟล์ 08 §7.1"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {isEdit ? 'บันทึกการแก้ไข' : 'สร้างบัญชี'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <InlineAlert tone="info" title="ระบบจะส่งอีเมลคำเชิญให้อัตโนมัติ">
            ผู้ใช้จะได้รับลิงก์ไปตั้งรหัสผ่านเอง — ระบบไม่เก็บรหัสผ่านและผู้ดูแลตั้งรหัสให้ไม่ได้ · ถ้าอีเมลไม่ถึง
            กดปุ่ม “ส่งคำเชิญอีกครั้ง” ในตารางผู้ใช้งานได้ตลอด
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="user-group" label="กลุ่มผู้ใช้ (Role Group)" required>
            <Select
              id="user-group"
              value={form.roleGroup}
              onChange={(event) => changeRoleGroup(event.target.value as RoleGroup)}
            >
              {(Object.keys(ROLE_GROUP_LABEL) as RoleGroup[]).map((group) => (
                <option key={group} value={group}>
                  {ROLE_GROUP_LABEL[group]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="user-role" label="บทบาท (Role)" required error={errors.roleId}>
            <Select id="user-role" value={form.roleId} onChange={(event) => set('roleId', event.target.value)}>
              <option value="">— เลือกบทบาท —</option>
              {groupRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field id="user-name" label="ชื่อ-นามสกุล" required error={errors.fullName}>
          <Input
            id="user-name"
            value={form.fullName}
            onChange={(event) => set('fullName', event.target.value)}
            placeholder="เช่น สมชาย ใจดี"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="user-email" label="อีเมล (ใช้เข้าสู่ระบบ)" required error={errors.email}>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="name@example.com"
            />
          </Field>

          <Field id="user-phone" label="เบอร์โทร" error={errors.phone}>
            <Input
              id="user-phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              placeholder="0812345678"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="user-employee-code" label="รหัสพนักงาน" error={errors.employeeCode}>
            <Input
              id="user-employee-code"
              value={form.employeeCode}
              onChange={(event) => set('employeeCode', event.target.value)}
              placeholder="เช่น EMP-0012"
            />
          </Field>

          {scope === 'team' && (
            <Field id="user-team" label="ทีมที่สังกัด" required error={errors.teamId}>
              <Select id="user-team" value={form.teamId} onChange={(event) => set('teamId', event.target.value)}>
                <option value="">— เลือกทีม —</option>
                {groupTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.side})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {scope === 'company' && (
            <Field id="user-company" label="บริษัทไฟแนนซ์" required error={errors.companyId}>
              <Select
                id="user-company"
                value={form.companyId}
                onChange={(event) => set('companyId', event.target.value)}
              >
                <option value="">— เลือกบริษัท —</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {scope === 'team' && groupTeams.length === 0 && (
          <InlineAlert tone="warning" title="ยังไม่มีทีมของฝั่งนี้">
            สร้างทีมที่หน้า “ทีมติดตามทรัพย์” ก่อน — ผู้ใช้กลุ่ม Inhouse/Outsource ต้องสังกัดทีมเสมอ (ไฟล์ 08 §7.1)
          </InlineAlert>
        )}

        {isEdit && user.roleGroup !== form.roleGroup && (
          <InlineAlert tone="warning" title="กำลังย้ายผู้ใช้ข้ามกลุ่ม">
            การเปลี่ยนกลุ่ม/บทบาทเปลี่ยนขอบเขตข้อมูลที่ผู้ใช้คนนี้มองเห็นทันทีหลังบันทึก (`05` §5)
          </InlineAlert>
        )}

        <Field id="user-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            id="user-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น พนักงานใหม่เริ่มงาน 1 ก.ย. 2569"
          />
        </Field>
      </div>
    </Modal>
  )
}
