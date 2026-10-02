'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/schemas'
import { userPasswordResetSchema } from '@/lib/users/schemas'
import type { UserDto } from '@/lib/users/types'

/**
 * ผู้ดูแลตั้งรหัสผ่านใหม่ให้ผู้ใช้ (`POST /api/users/:id/password` — มติ PO 03/10/2569)
 * แสดงเฉพาะผู้มี `manage:manage_users` (ซ่อนด้วย `<Can>` ที่ผู้เรียก — API ตรวจซ้ำเสมอ)
 * ผู้ใช้ที่ถูกตั้งรหัสให้ต้องเปลี่ยนเองตอน login ครั้งถัดไป (ยกเว้นตั้งให้ตัวเอง)
 */
export function UserPasswordModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserDto
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    const parsed = userPasswordResetSchema.safeParse({ password, confirmPassword, reason: reason.trim() })
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
      const result = await callApi<UserDto>(`/api/users/${user.id}/password`, jsonRequest('POST', parsed.data))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'ตั้งรหัสผ่านใหม่แล้ว',
        description: isSelf ? user.fullName : `${user.fullName} — ต้องเปลี่ยนรหัสผ่านเองตอนเข้าสู่ระบบครั้งถัดไป`,
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`ตั้งรหัสผ่านใหม่ — ${user.fullName}`}
      description={user.username === null ? undefined : `ชื่อผู้ใช้: ${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            ตั้งรหัสผ่านใหม่
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!isSelf && (
          <InlineAlert tone="info" title="ผู้ใช้ต้องเปลี่ยนรหัสผ่านเองตอนเข้าสู่ระบบครั้งถัดไป">
            แจ้งรหัสผ่านใหม่ให้ผู้ใช้ทางช่องทางที่ปลอดภัย — ระบบไม่ส่งอีเมลใดๆ และไม่บันทึกรหัสผ่านลงประวัติ
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="reset-password" label="รหัสผ่านใหม่" required error={errors.password}>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัว มีตัวอักษรและตัวเลข`}
            />
          </Field>
          <Field id="reset-confirm-password" label="ยืนยันรหัสผ่าน" required error={errors.confirmPassword}>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>
        </div>

        <Field id="reset-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            id="reset-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ผู้ใช้ลืมรหัสผ่าน แจ้งทางโทรศัพท์ 3 ต.ค. 2569"
          />
        </Field>
      </div>
    </Modal>
  )
}
