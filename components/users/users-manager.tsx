'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { RoleGroupTabs } from '@/components/roles/role-group-tabs'
import { UserFormModal } from '@/components/users/user-form-modal'
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  Field,
  Input,
  PageHeader,
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
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { ROLE_GROUP_LABEL, roleGroupsForTab, type RoleGroupTabId } from '@/lib/roles/role-groups'
import type { RoleListItem } from '@/lib/roles/types'
import type { TeamDto } from '@/lib/teams/types'
import type { UserDto } from '@/lib/users/types'

/**
 * หน้า "ผู้ใช้งาน" — โครงตาม mockup `settings.html` (`renderUsersContent`)
 * แท็บ 3 ระดับ reuse `<RoleGroupTabs>` จาก Phase 1.6 (`07` §8 · `08` §8) + ค้นหา/กรอง role/สถานะ
 *
 * สิทธิ์บนปุ่มเป็นแค่ UX — API ตรวจ `manage_users` ซ้ำเสมอ (DEC-002)
 */

const MANAGE_RESOURCE = 'manage_users'
const REASON_MIN_LENGTH = 5

type StatusFilter = 'all' | 'active' | 'suspended'

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'สถานะ: ทั้งหมด',
  active: 'ใช้งาน (Active)',
  suspended: 'ระงับ (Suspended)',
}

const GROUP_BADGE: Record<RoleGroup, string> = {
  system: 'bg-slate-100 text-slate-700',
  inhouse: 'bg-blue-100 text-blue-700',
  outsource: 'bg-purple-100 text-purple-700',
  finance_company: 'bg-amber-100 text-amber-800',
}

type PendingAction = { user: UserDto; action: 'suspend' | 'reactivate' | 'delete' }

const ACTION_TITLE: Record<PendingAction['action'], string> = {
  suspend: 'ระงับการใช้งานบัญชี',
  reactivate: 'เปิดใช้งานบัญชีกลับ',
  delete: 'ลบบัญชีผู้ใช้',
}

export function UsersManager() {
  const { showToast } = useToast()
  const [users, setUsers] = useState<readonly UserDto[]>([])
  const [roles, setRoles] = useState<readonly RoleListItem[]>([])
  const [teams, setTeams] = useState<readonly TeamDto[]>([])
  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [tab, setTab] = useState<RoleGroupTabId>('admin')
  const [subGroup, setSubGroup] = useState<RoleGroup>('inhouse')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [roleId, setRoleId] = useState('all')
  const [search, setSearch] = useState('')

  const [formUser, setFormUser] = useState<UserDto | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [pendingReason, setPendingReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // แท็บ "เจ้าหน้าที่ติดตามทรัพย์" ครอบ 2 กลุ่ม แต่ปุ่มสลับย่อยเลือกทีละกลุ่ม (`07` §8)
  const activeGroups: readonly RoleGroup[] = useMemo(() => {
    const groups = roleGroupsForTab(tab)
    return groups.length > 1 ? [subGroup] : groups
  }, [tab, subGroup])

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams({ roleGroup: activeGroups.join(','), status })
    if (roleId !== 'all') params.set('roleId', roleId)
    if (search.trim() !== '') params.set('search', search.trim())
    return callApi<UserDto[]>(`/api/users?${params.toString()}`)
  }, [activeGroups, status, roleId, search])

  const reload = useCallback(async () => {
    const result = await fetchUsers()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setUsers(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchUsers])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchUsers()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setUsers(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchUsers])

  // ข้อมูลประกอบฟอร์ม (บทบาท/ทีม/บริษัท) โหลดครั้งเดียวตอนเข้าหน้า
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [roleResult, teamResult, companyResult] = await Promise.all([
        callApi<RoleListItem[]>('/api/roles'),
        callApi<TeamDto[]>('/api/teams?status=active'),
        callApi<FinanceCompanyDto[]>('/api/finance-companies?status=active'),
      ])
      if (cancelled) return
      setRoles(roleResult.data ?? [])
      setTeams(teamResult.data ?? [])
      setCompanies(companyResult.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const roleOptions = roles.filter((role) => activeGroups.includes(role.roleGroup))

  async function confirmPending(): Promise<void> {
    if (pending === null) return
    setSubmitting(true)
    try {
      const { user, action } = pending
      const request =
        action === 'delete'
          ? jsonRequest('DELETE', { reason: pendingReason })
          : jsonRequest('PATCH', { reason: pendingReason })
      const path = action === 'delete' ? `/api/users/${user.id}` : `/api/users/${user.id}/${action}`

      const result = await callApi(path, request)
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({ tone: 'success', title: `${ACTION_TITLE[action]}แล้ว`, description: user.fullName })
      setPending(null)
      setPendingReason('')
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  function openForm(user: UserDto | null): void {
    setFormUser(user)
    setFormOpen(true)
  }

  return (
    <>
      <PageHeader
        title="ผู้ใช้งาน (Users)"
        description="บัญชีผู้ใช้ทุกกลุ่ม — บทบาท สังกัดทีม/บริษัท และสถานะการใช้งาน · ผู้ใช้ที่มีประวัติการทำงานให้ระงับแทนการลบ"
        action={
          <Can action="manage" resource={MANAGE_RESOURCE}>
            <Button onClick={() => openForm(null)}>+ สร้างบัญชี</Button>
          </Can>
        }
      />

      <Card>
        <RoleGroupTabs
          className="mb-4"
          tab={tab}
          onTabChange={(next) => {
            setLoading(true)
            setRoleId('all')
            setTab(next)
          }}
          subGroup={subGroup}
          onSubGroupChange={(group) => {
            setLoading(true)
            setRoleId('all')
            setSubGroup(group)
          }}
        />

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row">
          <div className="flex-1">
            <Input
              aria-label="ค้นหาชื่อ เบอร์โทร หรืออีเมล"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อ, เบอร์โทร, อีเมล..."
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              aria-label="กรองตามบทบาท"
              value={roleId}
              onChange={(event) => {
                setLoading(true)
                setRoleId(event.target.value)
              }}
            >
              <option value="all">บทบาท: ทั้งหมด</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-44">
            <Select
              aria-label="กรองตามสถานะ"
              value={status}
              onChange={(event) => {
                setLoading(true)
                setStatus(event.target.value as StatusFilter)
              }}
            >
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>ชื่อ / ข้อมูลติดต่อ</Th>
              <Th>บทบาท / กลุ่ม</Th>
              <Th>สังกัด</Th>
              <Th>เข้าใช้งานล่าสุด</Th>
              <Th className="text-right">สถานะ / จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={5}
            loading={loading}
            error={error}
            isEmpty={users.length === 0}
            emptyTitle="ไม่พบข้อมูลผู้ใช้"
            emptyDescription="สร้างบัญชีผู้ใช้กลุ่มนี้เพื่อเริ่มใช้งาน"
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
              users.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <div className="font-bold text-slate-900">{user.fullName}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                      {user.phone ?? '-'} · {user.email}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs font-medium text-slate-700">{user.roleName}</div>
                    <Badge className={`mt-1 ${GROUP_BADGE[user.roleGroup]}`}>{ROLE_GROUP_LABEL[user.roleGroup]}</Badge>
                  </Td>
                  <Td>
                    <div className="text-xs text-slate-600">{user.teamName ?? user.companyName ?? '—'}</div>
                    {user.activeCaseCount > 0 && (
                      <div className="mt-0.5 text-[10px] text-amber-600">งานค้าง {user.activeCaseCount} เคส</div>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{fmtDateTime(user.lastLoginAt)}</span>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!user.isProvisioned && (
                        <Badge className="bg-amber-100 text-amber-800">รอตั้งรหัสผ่าน</Badge>
                      )}
                      <Badge
                        className={
                          user.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }
                      >
                        {user.status === 'active' ? 'Active' : 'Suspended'}
                      </Badge>
                      <Can action="manage" resource={MANAGE_RESOURCE}>
                        <Button variant="secondary" onClick={() => openForm(user)}>
                          แก้ไข
                        </Button>
                        {user.status === 'active' ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setPending({ user, action: 'suspend' })
                              setPendingReason('')
                            }}
                          >
                            ระงับ
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setPending({ user, action: 'reactivate' })
                              setPendingReason('')
                            }}
                          >
                            เปิดใช้งาน
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          onClick={() => {
                            setPending({ user, action: 'delete' })
                            setPendingReason('')
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
        </Table>
      </Card>

      {formOpen && (
        <UserFormModal
          key={formUser?.id ?? `create-${activeGroups[0] ?? 'system'}`}
          open={formOpen}
          user={formUser}
          defaultRoleGroup={formUser?.roleGroup ?? activeGroups[0] ?? 'system'}
          roles={roles}
          teams={teams}
          companies={companies}
          onClose={() => setFormOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      <ConfirmModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirmPending()}
        title={`${ACTION_TITLE[pending?.action ?? 'suspend']} — ${pending?.user.fullName ?? ''}`}
        description={
          pending?.action === 'delete'
            ? 'ลบได้เฉพาะบัญชีที่ยังไม่มีประวัติการทำงาน — ถ้ามีเคส/งานภาคสนาม/รายการเงินผูกอยู่ ระบบจะปฏิเสธด้วย USER_HAS_HISTORY ให้ใช้การระงับแทน (ไฟล์ 08 §10)'
            : pending?.action === 'suspend'
              ? 'ผู้ใช้ที่ถูกระงับจะเข้าสู่ระบบไม่ได้ทันที แต่ประวัติทั้งหมดยังอยู่ครบ (ไฟล์ 08 §7.2)'
              : 'เปิดสิทธิ์เข้าใช้งานกลับให้บัญชีนี้'
        }
        confirmLabel={`ยืนยัน${ACTION_TITLE[pending?.action ?? 'suspend']}`}
        confirmVariant={pending?.action === 'reactivate' ? 'primary' : 'danger'}
        loading={submitting}
        confirmDisabled={pendingReason.trim().length < REASON_MIN_LENGTH}
      >
        {pending?.action === 'suspend' && pending.user.activeCaseCount > 0 && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            ผู้ใช้คนนี้ยังมีงานค้างอยู่ {pending.user.activeCaseCount} เคส — ต้องมอบหมายงานให้คนอื่นต่อ (การย้ายงานอัตโนมัติจะมาในเฟสถัดไป)
          </p>
        )}
        <Field id="user-action-reason" label="เหตุผล" required>
          <Textarea
            id="user-action-reason"
            value={pendingReason}
            onChange={(event) => setPendingReason(event.target.value)}
            placeholder="เช่น พนักงานลาออกเมื่อ 31 ส.ค. 2569"
          />
        </Field>
      </ConfirmModal>
    </>
  )
}
