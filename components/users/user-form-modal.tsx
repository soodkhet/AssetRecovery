'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { ROLE_GROUP_LABEL } from '@/lib/roles/role-groups'
import type { RoleListItem } from '@/lib/roles/types'
import type { TeamDto } from '@/lib/teams/types'
import { useSession } from '@/components/auth/permission-provider'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/schemas'
import { canManageAccountIn } from '@/lib/users/auth-account'
import { userCreateSchema, userUpdateSchema } from '@/lib/users/schemas'
import type { UserDto } from '@/lib/users/types'
import { requiredScopeFor } from '@/lib/users/user'

/**
 * ฟอร์มสร้าง/แก้ไขผู้ใช้งาน — โครงตาม mockup `settings.html` (modal `create-user`/`edit-user`)
 *
 * **cascading role select** (`08` §8): เลือกกลุ่ม → role ในกลุ่มนั้น → ทีม (inhouse/outsource)
 * หรือบริษัท (finance_company) · ช่องสังกัดที่ไม่เกี่ยวกับกลุ่มถูก**ซ่อนจริง**ไม่ใช่แค่ disable
 * เพราะค่าที่ค้างอยู่จะทำให้ API ปฏิเสธด้วย `INVALID_USER_SCOPE`
 *
 * มติ PO 03/10/2569: username บังคับ · อีเมลไม่บังคับ · ตอนสร้างผู้ดูแลตั้งรหัสผ่านเริ่มต้นให้เลย
 * (ไม่ส่งอีเมลเชิญ — ผู้ใช้ถูกบังคับเปลี่ยนเองตอน login ครั้งแรก) · ตอนแก้ไขไม่มีช่องรหัสผ่าน
 * (ตั้งใหม่ผ่านปุ่ม "ตั้งรหัสผ่าน" ในตาราง — `<UserPasswordModal>`)
 */

interface FormState {
  roleGroup: RoleGroup
  roleId: string
  username: string
  email: string
  fullName: string
  phone: string
  employeeCode: string
  teamId: string
  companyId: string
  password: string
  confirmPassword: string
}

function emptyForm(roleGroup: RoleGroup): FormState {
  return {
    roleGroup,
    roleId: '',
    username: '',
    email: '',
    fullName: '',
    phone: '',
    employeeCode: '',
    teamId: '',
    companyId: '',
    password: '',
    confirmPassword: '',
  }
}

function formOf(user: UserDto): FormState {
  return {
    roleGroup: user.roleGroup,
    roleId: user.roleId,
    username: user.username ?? '',
    email: user.email ?? '',
    fullName: user.fullName,
    phone: user.phone ?? '',
    employeeCode: user.employeeCode ?? '',
    teamId: user.teamId ?? '',
    companyId: user.companyId ?? '',
    password: '',
    confirmPassword: '',
  }
}

function payloadOf(form: FormState, isEdit: boolean): Record<string, unknown> {
  const scope = requiredScopeFor(form.roleGroup)
  return {
    roleId: form.roleId === '' ? undefined : form.roleId,
    username: form.username.trim(),
    email: form.email.trim() === '' ? null : form.email.trim(),
    fullName: form.fullName.trim(),
    phone: form.phone.trim() === '' ? null : form.phone.trim(),
    employeeCode: form.employeeCode.trim() === '' ? null : form.employeeCode.trim(),
    teamId: scope === 'team' && form.teamId !== '' ? form.teamId : null,
    companyId: scope === 'company' && form.companyId !== '' ? form.companyId : null,
    // ไม่มีช่องเหตุผล (มติ PO 03/10/2569) — แก้ไขผู้ใช้ ระบบสรุปสิ่งที่เปลี่ยนลง audit เอง
    ...(isEdit ? {} : { password: form.password, confirmPassword: form.confirmPassword }),
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
  const session = useSession()
  /** กลุ่มที่ผู้ใช้คนนี้มอบให้ได้ — กลุ่ม system เฉพาะ Superadmin (DEC-010 · API ตรวจซ้ำ) */
  const assignableGroups = (Object.keys(ROLE_GROUP_LABEL) as RoleGroup[]).filter(
    (group) => session !== null && canManageAccountIn(session, group),
  )
  const [form, setForm] = useState<FormState>(
    user === null
      ? emptyForm(assignableGroups.includes(defaultRoleGroup) ? defaultRoleGroup : (assignableGroups[0] ?? defaultRoleGroup))
      : formOf(user),
  )
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
    const parsed = (isEdit ? userUpdateSchema : userCreateSchema).safeParse(payloadOf(form, isEdit))
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
          title: isEdit ? 'บันทึกข้อมูลผู้ใช้แล้ว' : 'สร้างบัญชีแล้ว',
          description: isEdit
            ? form.fullName.trim()
            : `${form.fullName.trim()} — เข้าสู่ระบบด้วย ${form.username.trim().toLowerCase()} ได้ทันที และต้องเปลี่ยนรหัสผ่านตอนเข้าครั้งแรก`,
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
      description="เลือกกลุ่ม → บทบาท → สังกัด (ทีมสำหรับ Inhouse/Outsource · บริษัทสำหรับกลุ่มไฟแนนซ์)"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="user-group" label="กลุ่มผู้ใช้ (Role Group)" required>
            <Select
              id="user-group"
              value={form.roleGroup}
              onChange={(event) => changeRoleGroup(event.target.value as RoleGroup)}
            >
              {assignableGroups.map((group) => (
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
          <Field id="user-username" label="ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)" required error={errors.username}>
            <Input
              id="user-username"
              className="font-mono"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={form.username}
              onChange={(event) => set('username', event.target.value)}
              placeholder="เช่น somchai.j"
            />
          </Field>

          <Field id="user-email" label="อีเมล (ไม่บังคับ — ใช้เข้าสู่ระบบได้)" error={errors.email}>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="name@example.com"
            />
          </Field>
        </div>

        {!isEdit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="user-password" label="รหัสผ่านเริ่มต้น" required error={errors.password}>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => set('password', event.target.value)}
                placeholder={`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัว มีตัวอักษรและตัวเลข`}
              />
            </Field>

            <Field id="user-confirm-password" label="ยืนยันรหัสผ่าน" required error={errors.confirmPassword}>
              <Input
                id="user-confirm-password"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => set('confirmPassword', event.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </div>
        )}

        {!isEdit && (
          <InlineAlert tone="info" title="ผู้ใช้ต้องเปลี่ยนรหัสผ่านเองตอนเข้าสู่ระบบครั้งแรก">
            แจ้งชื่อผู้ใช้และรหัสผ่านเริ่มต้นให้ผู้ใช้ทางช่องทางที่ปลอดภัย — ระบบไม่ส่งอีเมลใดๆ
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="user-phone" label="เบอร์โทร" error={errors.phone}>
            <Input
              id="user-phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              placeholder="0812345678"
            />
          </Field>

          <Field id="user-employee-code" label="รหัสพนักงาน" error={errors.employeeCode}>
            <Input
              id="user-employee-code"
              value={form.employeeCode}
              onChange={(event) => set('employeeCode', event.target.value)}
              placeholder="เช่น EMP-0012"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

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
            สร้างทีมที่หน้า “ทีมติดตามทรัพย์” ก่อน — ผู้ใช้กลุ่ม Inhouse/Outsource ต้องสังกัดทีมเสมอ
          </InlineAlert>
        )}

        {isEdit && user.roleGroup !== form.roleGroup && (
          <InlineAlert tone="warning" title="กำลังย้ายผู้ใช้ข้ามกลุ่ม">
            การเปลี่ยนกลุ่ม/บทบาทเปลี่ยนขอบเขตข้อมูลที่ผู้ใช้คนนี้มองเห็นทันทีหลังบันทึก
          </InlineAlert>
        )}

      </div>
    </Modal>
  )
}
