'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { Can } from '@/components/auth/permission-provider'
import { PermissionMatrixModal } from '@/components/roles/permission-matrix-modal'
import { RoleGroupTabs } from '@/components/roles/role-group-tabs'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmModal,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
  Textarea,
  useToast,
} from '@/components/ui'
import { ROLE_GROUP_LABEL, roleGroupsForTab, type RoleGroupTabId } from '@/lib/roles/role-groups'
import type { ApiData, ApiErrorBody, RoleListItem } from '@/lib/roles/types'

/**
 * หน้า "สิทธิ์การใช้งาน (Roles & Permissions)" — `07` §8 + mockup `settings.html` (`renderRolesContent`)
 *
 * ทุกอย่างที่แสดงเป็นแค่ UX: ปุ่มที่ซ่อนด้วย `<Can>` ยังถูกตรวจซ้ำที่ API ทุกครั้ง (DEC-002)
 * ข้อมูลโหลดผ่าน `/api/roles` ซึ่งบังคับ `requirePermission()` ของมันเอง
 */

const MANAGE_RESOURCE = 'manage_roles'
const REASON_MIN_LENGTH = 5

interface LoadState {
  loading: boolean
  error: string | null
}

function errorOf(body: unknown): { title: string; message: string } {
  const error = (body as ApiErrorBody).error
  return { title: error.title, message: error.message }
}

interface RolesResult {
  roles?: readonly RoleListItem[]
  error?: string
}

/** ดึงรายการบทบาท — ไม่มี setState ในตัวเอง เพื่อให้เรียกจาก effect ได้โดยไม่ชนกฎ react-hooks */
async function fetchRoles(): Promise<RolesResult> {
  try {
    const response = await fetch('/api/roles')
    const body: unknown = await response.json()
    if (!response.ok) return { error: errorOf(body).message }
    return { roles: (body as ApiData<RoleListItem[]>).data }
  } catch {
    return { error: 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่' }
  }
}

export function RolesManager() {
  const { showToast } = useToast()
  const [roles, setRoles] = useState<readonly RoleListItem[]>([])
  const [state, setState] = useState<LoadState>({ loading: true, error: null })
  const [tab, setTab] = useState<RoleGroupTabId>('admin')
  const [subGroup, setSubGroup] = useState<RoleGroup>('inhouse')

  const [permissionRole, setPermissionRole] = useState<RoleListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoleListItem | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createGroup, setCreateGroup] = useState<RoleGroup>('system')
  const [createReason, setCreateReason] = useState('')
  const [creating, setCreating] = useState(false)

  const applyResult = useCallback((result: RolesResult) => {
    if (result.error !== undefined) {
      setState({ loading: false, error: result.error })
      return
    }
    setRoles(result.roles ?? [])
    setState({ loading: false, error: null })
  }, [])

  /** โหลดใหม่หลังบันทึก/ลบ หรือกดปุ่ม "ลองใหม่" */
  const load = useCallback(async () => {
    applyResult(await fetchRoles())
  }, [applyResult])

  // ตั้ง state **หลัง** await เท่านั้น (กฎ `react-hooks/set-state-in-effect` ห้าม setState แบบ synchronous)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchRoles()
      if (!cancelled) applyResult(result)
    })()
    return () => {
      cancelled = true
    }
  }, [applyResult])

  /** กลุ่มที่กำลังแสดง — แท็บเจ้าหน้าที่ติดตามทรัพย์เลือกฝั่งจาก sub-toggle (`07` §5.2) */
  const visibleGroup: RoleGroup = useMemo(() => {
    const groups = roleGroupsForTab(tab)
    return groups.length === 1 ? groups[0]! : subGroup
  }, [tab, subGroup])

  const visibleRoles = useMemo(
    () => roles.filter((role) => role.roleGroup === visibleGroup),
    [roles, visibleGroup],
  )

  async function createRole() {
    setCreating(true)
    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: createName, roleGroup: createGroup, reason: createReason }),
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        showToast({ tone: 'error', ...errorOf(body) })
        return
      }

      showToast({ tone: 'success', title: 'สร้างบทบาทแล้ว', description: createName })
      setCreateOpen(false)
      setCreateName('')
      setCreateReason('')
      await load()
    } catch {
      showToast({ tone: 'error', title: 'สร้างบทบาทไม่สำเร็จ', description: 'กรุณาลองใหม่' })
    } finally {
      setCreating(false)
    }
  }

  async function confirmDelete() {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/roles/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason }),
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        showToast({ tone: 'error', ...errorOf(body) })
        return
      }

      showToast({ tone: 'success', title: 'ลบบทบาทแล้ว', description: deleteTarget.name })
      setDeleteTarget(null)
      setDeleteReason('')
      await load()
    } catch {
      showToast({ tone: 'error', title: 'ลบบทบาทไม่สำเร็จ', description: 'กรุณาลองใหม่' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="สิทธิ์การใช้งาน (Roles & Permissions)"
        description="บทบาทพื้นฐาน 15 ตัวตามไฟล์ 07 §5 — Seed Role ลบ/เปลี่ยนชื่อไม่ได้"
        action={
          <Can action="manage" resource={MANAGE_RESOURCE}>
            <Button onClick={() => setCreateOpen(true)}>+ สร้างบทบาท</Button>
          </Can>
        }
      />

      <Card padded={false}>
        <div className="px-6 pt-5">
          <RoleGroupTabs tab={tab} onTabChange={setTab} subGroup={subGroup} onSubGroupChange={setSubGroup} />
        </div>

        <CardHeader
          title={ROLE_GROUP_LABEL[visibleGroup]}
          description={`${visibleRoles.length} บทบาท — Superadmin มีสิทธิ์ทุกรายการโดยนิยาม (ไม่เก็บ record)`}
        />

        <Table>
          <THead>
            <Tr>
              <Th>ชื่อบทบาท</Th>
              <Th>จำนวนผู้ใช้</Th>
              <Th>สิทธิ์ที่ได้รับ</Th>
              <Th>สถานะ</Th>
              <Th align="right">จัดการสิทธิ์</Th>
            </Tr>
          </THead>

          <TableState
            colSpan={5}
            loading={state.loading}
            error={state.error === null ? null : { message: state.error }}
            isEmpty={visibleRoles.length === 0}
            emptyTitle="ยังไม่มีบทบาทในกลุ่มนี้"
            onRetry={
              <Button variant="secondary" onClick={() => void load()}>
                ลองใหม่
              </Button>
            }
          />

          {!state.loading && state.error === null && visibleRoles.length > 0 && (
            <TBody>
              {visibleRoles.map((role) => (
                <Tr key={role.id}>
                  <Td>
                    <span className="font-semibold text-slate-900">{role.name}</span>
                  </Td>
                  <Td>{role.userCount} คน</Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      ✅ {role.grants.manage} · 👁️ {role.grants.view}
                    </span>
                  </Td>
                  <Td>
                    {role.isSeed ? (
                      <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-700">🔒 Seed</Badge>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700">Custom</Badge>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="secondary" onClick={() => setPermissionRole(role)}>
                        กำหนดสิทธิ์
                      </Button>
                      <Can action="manage" resource={MANAGE_RESOURCE}>
                        <Button
                          variant="danger"
                          disabled={role.isSeed || role.userCount > 0}
                          title={
                            role.isSeed
                              ? 'Seed Role ลบไม่ได้ (ไฟล์ 07 §10)'
                              : role.userCount > 0
                                ? 'ยังมีผู้ใช้ผูกอยู่กับบทบาทนี้'
                                : undefined
                          }
                          onClick={() => {
                            setDeleteTarget(role)
                            setDeleteReason('')
                          }}
                        >
                          ลบ
                        </Button>
                      </Can>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          )}
        </Table>
      </Card>

      <PermissionMatrixModal
        key={permissionRole?.id ?? 'none'}
        role={permissionRole}
        open={permissionRole !== null}
        onClose={() => setPermissionRole(null)}
        onSaved={() => void load()}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="สร้างบทบาทใหม่"
        description="บทบาทที่สร้างเองปรับสิทธิ์ได้ และไม่ใช่ Seed Role"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => void createRole()}
              loading={creating}
              disabled={createName.trim().length < 2 || createReason.trim().length < REASON_MIN_LENGTH}
            >
              สร้างบทบาท
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="role-name" label="ชื่อบทบาท" required>
            <Input
              id="role-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="เช่น ผู้ตรวจสอบภายใน"
            />
          </Field>

          <Field id="role-group" label="กลุ่มที่สังกัด" required hint="ชื่อซ้ำข้ามกลุ่มได้ — เป็นคนละบทบาทจริง (ไฟล์ 07 §6)">
            <Select
              id="role-group"
              value={createGroup}
              onChange={(event) => setCreateGroup(event.target.value as RoleGroup)}
            >
              {(Object.keys(ROLE_GROUP_LABEL) as RoleGroup[]).map((group) => (
                <option key={group} value={group}>
                  {ROLE_GROUP_LABEL[group]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="role-reason" label="เหตุผล" required hint="บันทึกลง audit log ถาวร (ไฟล์ 90 §13)">
            <Textarea
              id="role-reason"
              value={createReason}
              onChange={(event) => setCreateReason(event.target.value)}
              placeholder="เช่น เพิ่มบทบาทผู้ตรวจสอบภายในตามมติที่ประชุม"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title={`ลบบทบาท "${deleteTarget?.name ?? ''}"`}
        description="ลบแล้วผู้ใช้จะไม่สามารถถูกผูกกับบทบาทนี้ได้อีก"
        confirmLabel="ยืนยันลบบทบาท"
        loading={deleting}
        confirmDisabled={deleteReason.trim().length < REASON_MIN_LENGTH}
      >
        <Field id="delete-reason" label="เหตุผลในการลบ" required>
          <Textarea
            id="delete-reason"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="เช่น ยุบบทบาทที่ไม่ได้ใช้งานแล้ว"
          />
        </Field>
      </ConfirmModal>
    </>
  )
}
