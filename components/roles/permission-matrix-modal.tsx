'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Field, InlineAlert, LoadingState, Modal, Select, Textarea, useToast } from '@/components/ui'
import { MATRIX_LEVELS, MATRIX_LEVEL_LABEL, type MatrixLevel, type MatrixSection } from '@/lib/roles/matrix'
import type { ApiData, ApiErrorBody, RoleDetail, RolePermissionsPayload } from '@/lib/roles/types'

/**
 * Permission Matrix editor ของ role หนึ่งตัว (`07` §8 · `13` §6.10 · mockup `settings.html` แท็บสิทธิ์)
 *
 * - dropdown 3 ระดับต่อ capability (DEC-009) — `none` = ไม่มี record
 * - แถวที่ติด 🔒 ("✅ only" ตาม `25` §16.1) และ role ที่ `is_editable = false` ถูก disable
 *   ⚠️ disable เป็นแค่ UX — API ปฏิเสธซ้ำเสมอด้วย `CAPABILITY_LOCKED`/`ROLE_NOT_EDITABLE` (DEC-002)
 * - บังคับกรอกเหตุผลก่อนบันทึก (`90` §13 — การเปลี่ยนสิทธิ์ต้องมี reason ทุกครั้ง)
 */

const REASON_MIN_LENGTH = 5

interface LoadState {
  loading: boolean
  error: string | null
}

export function PermissionMatrixModal({
  role,
  open,
  onClose,
  onSaved,
}: {
  role: RoleDetail | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [sections, setSections] = useState<readonly MatrixSection[]>([])
  const [levels, setLevels] = useState<Record<string, MatrixLevel>>({})
  const [initialLevels, setInitialLevels] = useState<Record<string, MatrixLevel>>({})
  const [reason, setReason] = useState('')
  const [state, setState] = useState<LoadState>({ loading: true, error: null })
  const [saving, setSaving] = useState(false)

  const roleId = role?.id ?? null

  /**
   * โหลด matrix เมื่อ modal เปิด — ตั้ง state **หลัง** await เท่านั้น
   * (กฎ `react-hooks/set-state-in-effect` ห้าม setState แบบ synchronous ใน effect)
   * parent ใส่ `key` เป็น role id ให้ component นี้ remount ทุกครั้งที่เปลี่ยนบทบาท จึงไม่ต้องรีเซ็ต state เอง
   */
  useEffect(() => {
    if (!open || roleId === null) return
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch(`/api/roles/${roleId}/permissions`)
        const body: unknown = await response.json()
        if (cancelled) return

        if (!response.ok) {
          setState({ loading: false, error: (body as ApiErrorBody).error.message })
          return
        }

        const payload = (body as ApiData<RolePermissionsPayload>).data
        const nextLevels: Record<string, MatrixLevel> = {}
        for (const section of payload.sections) {
          for (const row of section.rows) nextLevels[row.code] = row.level
        }

        setSections(payload.sections)
        setLevels(nextLevels)
        setInitialLevels(nextLevels)
        setState({ loading: false, error: null })
      } catch {
        if (!cancelled) setState({ loading: false, error: 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, roleId])

  const changed = useMemo(
    () =>
      Object.entries(levels)
        .filter(([code, level]) => initialLevels[code] !== level)
        .map(([code, level]) => ({ capabilityCode: code, level })),
    [levels, initialLevels],
  )

  async function save() {
    if (roleId === null || changed.length === 0) return
    setSaving(true)

    try {
      const response = await fetch(`/api/roles/${roleId}/permissions`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entries: changed, reason }),
      })
      const body: unknown = await response.json()

      if (!response.ok) {
        const error = (body as ApiErrorBody).error
        showToast({ tone: 'error', title: error.title, description: error.message })
        setState({ loading: false, error: error.message })
        return
      }

      showToast({
        tone: 'success',
        title: 'บันทึกสิทธิ์แล้ว',
        description: `ปรับ ${changed.length} รายการของบทบาท "${role?.name ?? ''}"`,
      })
      onSaved()
      onClose()
    } catch {
      setState({ loading: false, error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
    } finally {
      setSaving(false)
    }
  }

  const reasonTooShort = reason.trim().length < REASON_MIN_LENGTH
  const editableRole = role !== null && role.isEditable && role.name !== 'Superadmin'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`กำหนดสิทธิ์ — ${role?.name ?? ''}`}
      description="ระดับสิทธิ์ 3 ระดับตามไฟล์ 25: ✅ ทำได้ / 👁️ ดูอย่างเดียว / — ไม่มีสิทธิ์"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={!editableRole || changed.length === 0 || reasonTooShort}
          >
            บันทึกสิทธิ์ ({changed.length})
          </Button>
        </>
      }
    >
      {state.loading ? (
        <LoadingState message="กำลังโหลดรายการสิทธิ์..." />
      ) : (
        <div className="space-y-4">
          {state.error !== null && <InlineAlert tone="error">{state.error}</InlineAlert>}

          {role !== null && !editableRole && (
            <InlineAlert tone="warning">
              {role.name === 'Superadmin'
                ? 'Superadmin มีสิทธิ์ทุกรายการโดยนิยาม (ไม่เก็บ record) จึงแก้ไม่ได้'
                : 'บทบาทนี้ถูกกำหนดสิทธิ์ตายตามสเปค แก้ไขไม่ได้'}
            </InlineAlert>
          )}

          {sections.map((section) => (
            <section key={section.id} className="rounded-lg border border-slate-200">
              <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                {section.label} ({section.rows.length})
              </h3>
              <ul className="divide-y divide-slate-50">
                {section.rows.map((row) => (
                  <li key={row.code} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{row.label}</span>
                        {row.locked && <Badge className="bg-slate-900 text-white">🔒 {row.lockOwner}</Badge>}
                      </div>
                      <p className="truncate font-mono text-[10px] text-slate-400">{row.code}</p>
                    </div>
                    <Select
                      aria-label={`ระดับสิทธิ์ของ ${row.label}`}
                      className="w-44"
                      value={levels[row.code] ?? row.level}
                      disabled={!row.editable || saving}
                      onChange={(event) =>
                        setLevels((current) => ({
                          ...current,
                          [row.code]: event.target.value as MatrixLevel,
                        }))
                      }
                    >
                      {MATRIX_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {MATRIX_LEVEL_LABEL[level]}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {editableRole && (
            <Field
              id="permission-reason"
              label="เหตุผลในการเปลี่ยนสิทธิ์"
              required
              hint="บังคับตามไฟล์ 90 §13 — การเปลี่ยนสิทธิ์ถูกบันทึกลง audit log ถาวร"
              error={reasonTooShort && reason.length > 0 ? `ระบุอย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร` : null}
            >
              <Textarea
                id="permission-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="เช่น มอบสิทธิ์ดูรายงานให้ทีมตรวจสอบตามมติที่ประชุม 14/08/2569"
                invalid={reasonTooShort && reason.length > 0}
              />
            </Field>
          )}
        </div>
      )}
    </Modal>
  )
}
