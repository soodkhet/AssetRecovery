'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { TeamFormModal } from '@/components/teams/team-form-modal'
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
import type { CompensationPlanListDto } from '@/lib/compensation/types'
import { PROVINCE_LIST } from '@/lib/teams/provinces'
import type { TeamSide } from '@/lib/teams/team'
import type { EligibleMemberDto, TeamDto } from '@/lib/teams/types'

/**
 * หน้า "ทีมติดตามทรัพย์" — โครงตาม mockup `settings.html` (`renderTeamsContent`)
 * ตาราง 5 คอลัมน์: ชื่อทีม/พื้นที่ · ผู้จัดการ · แผนค่าตอบแทน · สมาชิก · สถานะ/จัดการ (`09` §8)
 *
 * สิทธิ์บนปุ่มเป็นแค่ UX — API ตรวจ `manage_teams` ซ้ำเสมอ (DEC-002)
 */

const MANAGE_RESOURCE = 'manage_teams'
const REASON_MIN_LENGTH = 5

type StatusFilter = 'all' | 'active' | 'inactive'

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'สถานะ: ทั้งหมด',
  active: 'ใช้งานปกติ (Active)',
  inactive: 'ปิดใช้งาน (Inactive)',
}

const SIDE_BADGE: Record<TeamSide, string> = {
  inhouse: 'bg-blue-100 text-blue-700',
  outsource: 'bg-purple-100 text-purple-700',
}

export function TeamsManager() {
  const { showToast } = useToast()
  const [teams, setTeams] = useState<readonly TeamDto[]>([])
  const [plans, setPlans] = useState<readonly CompensationPlanListDto[]>([])
  const [members, setMembers] = useState<readonly EligibleMemberDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [side, setSide] = useState<TeamSide>('inhouse')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [province, setProvince] = useState('all')
  const [search, setSearch] = useState('')

  const [formTeam, setFormTeam] = useState<TeamDto | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TeamDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchTeams = useCallback(async () => {
    const params = new URLSearchParams({ side, status })
    if (province !== 'all') params.set('province', province)
    if (search.trim() !== '') params.set('search', search.trim())
    return callApi<TeamDto[]>(`/api/teams?${params.toString()}`)
  }, [side, status, province, search])

  const reload = useCallback(async () => {
    const result = await fetchTeams()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setTeams(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchTeams])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchTeams()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setTeams(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchTeams])

  // ข้อมูลประกอบฟอร์ม (แผนค่าตอบแทน + ผู้ใช้ที่เลือกได้) โหลดครั้งเดียวตอนเข้าหน้า
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [planResult, memberResult] = await Promise.all([
        callApi<CompensationPlanListDto[]>('/api/compensation-plans?status=active'),
        callApi<EligibleMemberDto[]>('/api/teams/eligible-members'),
      ])
      if (cancelled) return
      setPlans(planResult.data ?? [])
      setMembers(memberResult.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const result = await callApi(`/api/teams/${deleteTarget.id}`, jsonRequest('DELETE', { reason: deleteReason }))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ลบทีมแล้ว', description: deleteTarget.name })
      setDeleteTarget(null)
      setDeleteReason('')
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="ทีมติดตามทรัพย์ (Teams)"
        description="ทีม Inhouse/Outsource — ผู้จัดการ (หลายทีมได้) · หัวหน้าทีม (ทีมเดียว) · พื้นที่จังหวัด · แผนค่าตอบแทนที่ผูกไว้"
        action={
          <Can action="manage" resource={MANAGE_RESOURCE}>
            <Button
              onClick={() => {
                setFormTeam(null)
                setFormOpen(true)
              }}
            >
              + สร้างทีม
            </Button>
          </Can>
        }
      />

      <Card>
        <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
          {(['inhouse', 'outsource'] as TeamSide[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setLoading(true)
                setSide(value)
              }}
              className={
                side === value
                  ? 'rounded-md bg-white px-4 py-1.5 text-sm font-medium text-slate-900 shadow-sm'
                  : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700'
              }
            >
              {value === 'inhouse' ? 'Inhouse' : 'Outsource'}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row">
          <div className="flex-1">
            <Input
              aria-label="ค้นหาชื่อทีมหรือผู้จัดการ"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อทีม, ผู้จัดการ..."
            />
          </div>
          <div className="w-full sm:w-48">
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
          <div className="w-full sm:w-48">
            <Select
              aria-label="กรองตามจังหวัด"
              value={province}
              onChange={(event) => {
                setLoading(true)
                setProvince(event.target.value)
              }}
            >
              <option value="all">จังหวัด: ทั้งหมด</option>
              {PROVINCE_LIST.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>ชื่อทีม / พื้นที่</Th>
              <Th>ผู้จัดการ</Th>
              <Th>แผนค่าตอบแทน</Th>
              <Th>สมาชิก</Th>
              <Th className="text-right">สถานะ / จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` ไม่ใช่ซ้อนข้างใน */}
          <TableState
            colSpan={5}
            loading={loading}
            error={error}
            isEmpty={teams.length === 0}
            emptyTitle="ไม่พบข้อมูลทีม"
            emptyDescription="สร้างทีมแรกของฝั่งนี้เพื่อเริ่มมอบหมายเคส"
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
              teams.map((team) => (
                <Tr key={team.id}>
                  <Td>
                    <div className="font-bold text-slate-900">{team.name}</div>
                    <div className="mt-0.5 max-w-[240px] truncate text-[10px] text-slate-500" title={team.provinces.join(', ')}>
                      📍 {team.provinces.length > 0 ? team.provinces.join(', ') : '-'}
                    </div>
                  </Td>
                  <Td>
                    <div className="font-medium text-slate-700">
                      {team.managers.length > 0 ? team.managers.map((manager) => manager.fullName).join(', ') : '-'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      หัวหน้าทีม: {team.supervisor?.fullName ?? '—'}
                    </div>
                  </Td>
                  <Td>
                    {team.compensationPlanName === null ? (
                      <span className="text-xs text-slate-400">ไม่ได้ผูก</span>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-slate-800">{team.compensationPlanName}</div>
                        {team.compensationPlanSide !== null && (
                          <Badge className={`mt-0.5 ${SIDE_BADGE[team.compensationPlanSide]}`}>
                            {team.compensationPlanSide}
                          </Badge>
                        )}
                      </>
                    )}
                  </Td>
                  <Td>
                    <div className="text-slate-600">{team.memberCount} คน</div>
                    {team.activeCaseCount > 0 && (
                      <div className="mt-0.5 text-[10px] text-amber-600">เคสค้าง {team.activeCaseCount} เคส</div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Badge
                        className={
                          team.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }
                      >
                        {team.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                      <Can action="manage" resource={MANAGE_RESOURCE}>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setFormTeam(team)
                            setFormOpen(true)
                          }}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => {
                            setDeleteTarget(team)
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
        </Table>
      </Card>

      {formOpen && (
        <TeamFormModal
          key={formTeam?.id ?? 'create'}
          open={formOpen}
          team={formTeam}
          plans={plans}
          members={members}
          onClose={() => setFormOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title={`ลบทีม "${deleteTarget?.name ?? ''}"`}
        description="ทีมที่ยังมีเคสค้างอยู่ลบไม่ได้ — ย้ายเคสไปทีมอื่นก่อน (ไฟล์ 09 §10)"
        confirmLabel="ยืนยันลบทีม"
        confirmVariant="danger"
        loading={deleting}
        confirmDisabled={deleteReason.trim().length < REASON_MIN_LENGTH}
      >
        <Field id="team-delete-reason" label="เหตุผล" required>
          <Textarea
            id="team-delete-reason"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="เช่น ยุบทีมตามโครงสร้างใหม่ปี 2569"
          />
        </Field>
      </ConfirmModal>
    </>
  )
}
