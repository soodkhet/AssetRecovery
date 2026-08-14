'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_ROLES } from '@/components/settings/shared'
import {
  Badge,
  Button,
  Card,
  Field,
  InlineAlert,
  Modal,
  Select,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { callApi, jsonRequest } from '@/lib/api/types'
import { MATRIX_LEVELS, MATRIX_LEVEL_LABEL, isSuperadminRole, type MatrixLevel } from '@/lib/roles/matrix'
import { REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import type { FunctionalMatrixDto, FunctionalMatrixRoleDto, FunctionalMatrixRowDto } from '@/lib/settings/types'

/**
 * แท็บ "สิทธิ์บัญชี/การเงิน" (`13` §6.10) — Functional Permission Matrix 37 รายการ × ทุก role
 *
 * ต่างจากแท็บสิทธิ์ของไฟล์ 07 ที่แก้ทีละ role — ที่นี่มองข้าม role ตามกลุ่มฟังก์ชัน 4 กลุ่ม แล้วแก้
 * **ทีละ capability** (dropdown 3 ระดับต่อ role ตาม DEC-009) ส่งเป็น batch เดียวพร้อมเหตุผล
 *
 * - Superadmin ไม่อยู่ในตาราง (manage ทุกอย่างโดยนิยาม ไม่เก็บ record)
 * - แถว 🔒 (9 รายการ "✅ only" ตาม `25` §16.1) และ role ที่ `isEditable = false` ถูก disable
 *   ⚠️ disable เป็นแค่ UX — API ปฏิเสธซ้ำด้วย `CAPABILITY_LOCKED`/`ROLE_NOT_EDITABLE` เสมอ (DEC-002)
 * - capability ของ endpoint คือ `manage_roles` (ตรงกับที่ route ใช้) ไม่ใช่ `manage_settings`
 */

const LEVEL_CHIP_CLASS: Readonly<Record<Exclude<MatrixLevel, 'none'>, string>> = {
  manage: 'bg-emerald-100 text-emerald-800',
  view: 'bg-blue-100 text-blue-800',
}

/** ตัวย่อกลุ่มของ role — กัน role ชื่อซ้ำข้ามกลุ่มอ่านแล้วสับสน (`07` §5) */
const ROLE_GROUP_SHORT: Readonly<Record<string, string>> = {
  system: '',
  inhouse: 'IN',
  outsource: 'OUT',
  finance: 'FC',
}

function roleChipLabel(role: FunctionalMatrixRoleDto): string {
  const short = ROLE_GROUP_SHORT[role.roleGroup] ?? role.roleGroup
  return short === '' ? role.name : `${role.name} · ${short}`
}

export function FunctionalPermissionsTab() {
  const { showToast } = useToast()
  const [matrix, setMatrix] = useState<FunctionalMatrixDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)

  const [editing, setEditing] = useState<FunctionalMatrixRowDto | null>(null)
  const [levels, setLevels] = useState<Record<string, MatrixLevel>>({})
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchMatrix = useCallback(async () => callApi<FunctionalMatrixDto>('/api/settings/functional-permissions'), [])

  const reload = useCallback(async () => {
    const result = await fetchMatrix()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setMatrix(result.data ?? null)
    setError(null)
    setLoading(false)
  }, [fetchMatrix])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchMatrix()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setMatrix(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchMatrix])

  /** Superadmin ไม่แสดงเป็นคอลัมน์/ชิป — มีสิทธิ์ทุกอย่างโดยนิยาม (DEC-009) */
  const roles = useMemo(
    () => (matrix?.roles ?? []).filter((role) => !isSuperadminRole(role)),
    [matrix],
  )

  const sections = matrix?.sections ?? []
  const currentSection = sections.find((section) => section.id === sectionId) ?? sections[0] ?? null
  const rows = currentSection?.rows ?? []

  function openEditor(row: FunctionalMatrixRowDto): void {
    setEditing(row)
    setLevels(Object.fromEntries(roles.map((role) => [role.id, row.levels[role.id] ?? 'none'])))
    setReason('')
  }

  /** เฉพาะช่องที่ค่าเปลี่ยนจริง — ส่งทั้งตารางทุกครั้งจะกิน quota 500 รายการโดยไม่จำเป็น */
  const changed = useMemo(() => {
    if (editing === null) return []
    return roles
      .filter((role) => (editing.levels[role.id] ?? 'none') !== (levels[role.id] ?? 'none'))
      .map((role) => ({
        roleId: role.id,
        capabilityCode: editing.code,
        level: levels[role.id] ?? 'none',
      }))
  }, [editing, levels, roles])

  async function save(): Promise<void> {
    if (editing === null || changed.length === 0) return
    setSaving(true)
    try {
      const result = await callApi<{ changed: number; matrix: FunctionalMatrixDto }>(
        '/api/settings/functional-permissions',
        jsonRequest('PATCH', { entries: changed, reason: reason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'บันทึกสิทธิ์แล้ว',
        description: `ปรับ ${changed.length} รายการของ "${editing.label}"`,
      })
      setEditing(null)
      if (result.data !== undefined) {
        setMatrix(result.data.matrix)
      } else {
        await reload()
      }
    } finally {
      setSaving(false)
    }
  }

  const reasonTooShort = reason.trim().length < REASON_MIN_LENGTH

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-900">สิทธิ์บัญชีและการเงิน (Functional Permission Matrix)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          สิทธิ์เฉพาะทางของโมดูลการเงิน/บัญชี แบ่ง 4 กลุ่มฟังก์ชัน — ละเอียดกว่าเมทริกซ์รวมของระบบ (ไฟล์ 13 §6.10)
        </p>
      </div>

      {sections.length > 0 && (
        <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setSectionId(section.id)}
              aria-current={section.id === currentSection?.id ? 'true' : undefined}
              className={cn(
                'focus-ring rounded-md px-4 py-1.5 text-xs font-medium transition-colors',
                section.id === currentSection?.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {section.label} ({section.rows.length})
            </button>
          ))}
        </div>
      )}

      <InlineAlert tone="info" title="ระดับสิทธิ์ 3 ระดับ (ไฟล์ 25)">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {MATRIX_LEVELS.map((level) => (
              <Badge
                key={level}
                className={level === 'none' ? 'bg-slate-100 text-slate-500' : LEVEL_CHIP_CLASS[level]}
              >
                {MATRIX_LEVEL_LABEL[level]}
              </Badge>
            ))}
            <span className="text-[11px] text-slate-500">— ระดับ “ไม่มีสิทธิ์” ไม่เก็บ record จึงไม่แสดงในตาราง</span>
          </div>
          <div className="text-[11px] text-slate-600">
            <b>Superadmin</b> มีสิทธิ์ทุกรายการโดยนิยาม ไม่แสดงในตาราง · รายการ{' '}
            <Badge className="bg-slate-900 text-white">🔒</Badge> ล็อกไว้กับ role เจ้าของ มอบให้ role อื่นไม่ได้
          </div>
        </div>
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-[42%]">ฟังก์ชันงาน (Functional Capability)</Th>
              <Th>สิทธิ์การเข้าถึง (บทบาท → ระดับ)</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={3}
            loading={loading}
            error={error}
            isEmpty={rows.length === 0}
            emptyTitle="ยังไม่มีรายการสิทธิ์ในกลุ่มนี้"
            emptyDescription="รายการ capability มาจาก seed ของระบบ — ถ้าว่างให้ตรวจว่ารัน `pnpm db:seed` แล้วหรือยัง"
            onRetry={
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true)
                  void reload()
                }}
              >
                ลองใหม่
              </Button>
            }
          />
          <TBody>
            {!loading &&
              error === null &&
              rows.map((row) => {
                const granted = roles.filter((role) => (row.levels[role.id] ?? 'none') !== 'none')
                return (
                  <Tr key={row.code}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{row.label}</span>
                        {row.locked && <Badge className="bg-slate-900 text-white">🔒 {row.lockOwner}</Badge>}
                      </div>
                      {row.description !== null && (
                        <p className="mt-0.5 text-[10px] text-slate-400">{row.description}</p>
                      )}
                      <p className="mt-0.5 font-mono text-[10px] text-slate-300">{row.code}</p>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {row.locked ? (
                          <Badge className="bg-slate-900 text-white">🔒 {row.lockOwner} เท่านั้น</Badge>
                        ) : granted.length === 0 ? (
                          <span className="text-[10px] text-slate-300">—</span>
                        ) : (
                          granted.map((role) => {
                            const level = row.levels[role.id] ?? 'none'
                            if (level === 'none') return null
                            return (
                              <Badge key={role.id} className={LEVEL_CHIP_CLASS[level]}>
                                {level === 'manage' ? '✅' : '👁️'} {roleChipLabel(role)}
                              </Badge>
                            )
                          })
                        )}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <Can action="manage" resource={MANAGE_ROLES}>
                        <Button variant="secondary" onClick={() => openEditor(row)} disabled={row.locked}>
                          แก้ไข
                        </Button>
                      </Can>
                    </Td>
                  </Tr>
                )
              })}
          </TBody>
        </Table>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={`กำหนดสิทธิ์ — ${editing?.label ?? ''}`}
        description="เลือกระดับสิทธิ์ของแต่ละบทบาทสำหรับฟังก์ชันนี้ — บันทึกครั้งเดียวทุกบทบาทที่เปลี่ยน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={changed.length === 0 || reasonTooShort}>
              บันทึกสิทธิ์ ({changed.length})
            </Button>
          </>
        }
      >
        {editing !== null && (
          <div className="space-y-4">
            {editing.locked && (
              <InlineAlert tone="warning" title="รายการนี้ถูกล็อก">
                “{editing.label}” เป็น 1 ใน 9 รายการที่ล็อกไว้กับ {editing.lockOwner} เท่านั้น (ไฟล์ 25 §16.1) —
                มอบให้บทบาทอื่นไม่ได้
              </InlineAlert>
            )}

            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {roles.map((role) => {
                const editable = (editing.editable[role.id] ?? false) && !editing.locked
                return (
                  <li key={role.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-semibold text-slate-800">{role.name}</span>
                      <p className="text-[10px] text-slate-400">{roleChipLabel(role)}</p>
                    </div>
                    <Select
                      aria-label={`ระดับสิทธิ์ของบทบาท ${role.name}`}
                      className="w-44"
                      value={levels[role.id] ?? 'none'}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setLevels((current) => ({ ...current, [role.id]: event.target.value as MatrixLevel }))
                      }
                    >
                      {MATRIX_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {MATRIX_LEVEL_LABEL[level]}
                        </option>
                      ))}
                    </Select>
                  </li>
                )
              })}
            </ul>

            <Field
              id="functional-permission-reason"
              label="เหตุผลในการเปลี่ยนสิทธิ์"
              required
              hint="บังคับตามไฟล์ 90 §13 — การเปลี่ยนสิทธิ์ถูกบันทึกลง audit log ถาวร"
              error={reasonTooShort && reason.length > 0 ? `ระบุอย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร` : null}
            >
              <Textarea
                id="functional-permission-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="เช่น มอบสิทธิ์ดูรายงานการเงินให้หัวหน้าทีมตามมติที่ประชุม"
                invalid={reasonTooShort && reason.length > 0}
              />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  )
}
