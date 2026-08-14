'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { CompensationPlanFormModal } from '@/components/compensation/compensation-plan-form-modal'
import { VersionHistoryModal, type VersionRow } from '@/components/settings/version-history-modal'
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest, type ApiCallResult } from '@/lib/api/types'
import { describeFuelRule } from '@/lib/compensation/plan'
import type { CompensationPlanDto, CompensationPlanListDto } from '@/lib/compensation/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtPercent, fmtSatang } from '@/lib/format/money'

/**
 * หน้า "แผนค่าตอบแทน (จ่ายออก)" — `11` §8 + mockup `settings.html` (`renderCompensationContent`)
 * แสดงเป็นการ์ด 2 คอลัมน์เหมือน mockup · ปุ่มที่ซ่อนด้วย `<Can>` ยังถูกตรวจซ้ำที่ API เสมอ (DEC-002)
 */

const MANAGE_RESOURCE = 'manage_compensation_plans'
const REASON_MIN_LENGTH = 5

type StatusFilter = 'active' | 'inactive' | 'all'

const STATUS_LABEL: Record<StatusFilter, string> = {
  active: 'ใช้งานอยู่',
  inactive: 'ปิดใช้งาน',
  all: 'ทั้งหมด',
}

/** ป้ายค่าน้ำมันตามโหมด — ตัวเลขจัดรูปที่ชั้น display เท่านั้น (Rule 01) */
function fuelLabel(plan: CompensationPlanDto): string {
  const rule = describeFuelRule(plan)
  if (rule.mode === 'PER_KM') {
    const cap = rule.maxPerCaseSatang === null ? '∞' : `${fmtSatang(rule.maxPerCaseSatang)} บาท/เคส`
    return `${fmtSatang(rule.ratePerKmSatang)} บาท/กม. (เพดาน ${cap})`
  }
  return `${fmtSatang(rule.dailyFlatSatang)} บาท/วัน (เหมาจ่าย)`
}

function versionRow(plan: CompensationPlanDto): VersionRow {
  return {
    id: plan.id,
    version: plan.version,
    isCurrent: plan.isCurrent,
    updatedAt: plan.updatedAt,
    effectiveFrom: plan.effectiveFrom,
    effectiveTo: plan.effectiveTo,
    summary: `${fuelLabel(plan)} · เบี้ยเลี้ยง ${fmtSatang(plan.allowanceSatang)} · คอม ${fmtSatang(plan.commissionSatang)} · เบี้ยเสี่ยง ${fmtSatang(plan.noSuccessFeeSatang)}`,
  }
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' }) {
  const wrap =
    tone === 'emerald'
      ? 'rounded-lg border border-emerald-100 bg-emerald-50 p-2.5'
      : 'rounded-lg border border-slate-100 bg-slate-50 p-2.5'
  const labelClass =
    tone === 'emerald'
      ? 'mb-1 block text-[10px] font-bold tracking-wider text-emerald-600 uppercase'
      : 'mb-1 block text-[10px] font-bold tracking-wider text-slate-400 uppercase'
  const valueClass = tone === 'emerald' ? 'text-sm font-bold text-emerald-700' : 'text-sm font-bold text-slate-800'

  return (
    <div className={wrap}>
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}

export function CompensationPlansManager() {
  const { showToast } = useToast()
  const [plans, setPlans] = useState<readonly CompensationPlanListDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')

  const [formPlan, setFormPlan] = useState<CompensationPlanListDto | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [historyPlan, setHistoryPlan] = useState<CompensationPlanListDto | null>(null)

  const [activationTarget, setActivationTarget] = useState<CompensationPlanListDto | null>(null)
  const [activationReason, setActivationReason] = useState('')
  const [activating, setActivating] = useState(false)

  const apply = useCallback((result: ApiCallResult<CompensationPlanListDto[]>) => {
    if (result.error !== undefined) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    setPlans(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  /** โหลดใหม่หลังบันทึก/ปิดใช้งาน หรือกดปุ่ม "ลองใหม่" */
  const load = useCallback(
    async (filter: StatusFilter) => {
      apply(await callApi<CompensationPlanListDto[]>(`/api/compensation-plans?status=${filter}`))
    },
    [apply],
  )

  // ตั้ง state **หลัง** await เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<CompensationPlanListDto[]>(`/api/compensation-plans?status=${status}`)
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [status, apply])

  async function confirmActivation(): Promise<void> {
    if (activationTarget === null) return
    const nextActive = !activationTarget.isActive
    setActivating(true)
    try {
      const result = await callApi<CompensationPlanDto>(
        `/api/compensation-plans/${activationTarget.id}`,
        jsonRequest('DELETE', { isActive: nextActive, reason: activationReason }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: nextActive ? 'เปิดใช้งานแผนแล้ว' : 'ปิดใช้งานแผนแล้ว',
        description: activationTarget.name,
      })
      setActivationTarget(null)
      setActivationReason('')
      await load(status)
    } finally {
      setActivating(false)
    }
  }

  return (
    <>
      <PageHeader
        title="แผนค่าตอบแทน (จ่ายออก)"
        description="commission = จ่ายเมื่อปิดสำเร็จ · เบี้ยเสี่ยง = จ่ายเมื่อไม่สำเร็จ — เคสหนึ่งได้อย่างใดอย่างหนึ่ง (ไฟล์ 11 §7.2)"
        action={
          <Can action="manage" resource={MANAGE_RESOURCE}>
            <Button
              onClick={() => {
                setFormPlan(null)
                setFormOpen(true)
              }}
            >
              + สร้างเทมเพลต
            </Button>
          </Can>
        }
      />

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            แก้ไขแผนที่ใช้งานอยู่จะสร้าง <strong>เวอร์ชันใหม่</strong> เสมอ ไม่ทับของเดิม (ไฟล์ 11 §10)
          </span>
          <div className="w-40">
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

        {loading && <LoadingState />}
        {!loading && error !== null && <ErrorState
            message={error}
            action={
              <Button variant="secondary" onClick={() => void load(status)}>
                ลองใหม่
              </Button>
            }
          />}
        {!loading && error === null && plans.length === 0 && (
          <EmptyState title="ยังไม่มีแผนค่าตอบแทน" description="สร้างเทมเพลตแรกเพื่อผูกกับทีมติดตามทรัพย์" />
        )}

        {!loading && error === null && plans.length > 0 && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-lg border border-slate-200 p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">{plan.name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge
                        className={
                          plan.side === 'inhouse' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }
                      >
                        {plan.side}
                      </Badge>
                      <span className="font-mono text-[10px] text-slate-400">
                        v{plan.version} · มีผล {fmtDate(plan.effectiveFrom)}
                      </span>
                    </div>
                  </div>
                  <Badge className={plan.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}>
                    {plan.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </Badge>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Stat label={`⛽ ค่าน้ำมัน (${plan.fuelMode})`} value={fuelLabel(plan)} />
                  </div>
                  <Stat label="🍽️ เบี้ยเลี้ยง" value={`${fmtSatang(plan.allowanceSatang)} บาท/วัน`} />
                  <Stat
                    label="🏨 ที่พักสูงสุด"
                    value={
                      plan.hotelMaxPerNightSatang === null
                        ? 'ไม่กำหนดเพดาน'
                        : `${fmtSatang(plan.hotelMaxPerNightSatang)} บาท/คืน${plan.hotelReceiptRequired ? ' (ใบเสร็จบังคับ)' : ''}`
                    }
                  />
                  <Stat
                    label="✅ Commission (สำเร็จ)"
                    tone="emerald"
                    value={`${fmtSatang(plan.commissionSatang)} บาท/เคส`}
                  />
                  <Stat label="🔄 เบี้ยเสี่ยง (ไม่สำเร็จ)" value={`${fmtSatang(plan.noSuccessFeeSatang)} บาท/เคส`} />
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {plan.whtPct > 0 ? (
                    <Badge className="border border-amber-200 bg-amber-100 text-amber-800">
                      ⚠️ หัก ณ ที่จ่าย {fmtPercent(plan.whtPct)} อัตโนมัติ
                    </Badge>
                  ) : (
                    <Badge className="border border-slate-200 bg-slate-50 text-slate-400">ไม่หัก WHT</Badge>
                  )}
                  <Badge className="border border-slate-200 bg-slate-50 text-slate-500">
                    {plan.teamCount} ทีมผูกอยู่
                  </Badge>
                </div>

                <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
                  <Button variant="ghost" onClick={() => setHistoryPlan(plan)}>
                    ประวัติเวอร์ชัน
                  </Button>
                  <Can action="manage" resource={MANAGE_RESOURCE}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setFormPlan(plan)
                        setFormOpen(true)
                      }}
                    >
                      ⚙️ แก้ไขข้อมูล
                    </Button>
                    <Button
                      variant={plan.isActive ? 'danger' : 'secondary'}
                      onClick={() => {
                        setActivationTarget(plan)
                        setActivationReason('')
                      }}
                    >
                      {plan.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </Button>
                  </Can>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {formOpen && (
        <CompensationPlanFormModal
          key={formPlan?.id ?? 'create'}
          open={formOpen}
          plan={formPlan}
          onClose={() => setFormOpen(false)}
          onSaved={() => void load(status)}
        />
      )}

      <VersionHistoryModal<CompensationPlanDto>
        key={historyPlan?.id ?? 'history-none'}
        open={historyPlan !== null}
        onClose={() => setHistoryPlan(null)}
        title={`ประวัติเวอร์ชัน — ${historyPlan?.name ?? ''}`}
        url={historyPlan === null ? null : `/api/compensation-plans/${historyPlan.id}/versions`}
        toRow={versionRow}
      />

      <ConfirmModal
        open={activationTarget !== null}
        onClose={() => setActivationTarget(null)}
        onConfirm={() => void confirmActivation()}
        title={`${activationTarget?.isActive === true ? 'ปิด' : 'เปิด'}ใช้งานแผน "${activationTarget?.name ?? ''}"`}
        description={
          activationTarget?.isActive === true
            ? 'แผนที่ยังมีทีมผูกอยู่ปิดใช้งานไม่ได้ — ย้ายทีมไปแผนอื่นก่อน (ไฟล์ 11 §10)'
            : 'เปิดใช้งานกลับให้เลือกผูกกับทีมได้อีกครั้ง'
        }
        confirmLabel={activationTarget?.isActive === true ? 'ยืนยันปิดใช้งาน' : 'ยืนยันเปิดใช้งาน'}
        confirmVariant={activationTarget?.isActive === true ? 'danger' : 'primary'}
        loading={activating}
        confirmDisabled={activationReason.trim().length < REASON_MIN_LENGTH}
      >
        <Field id="plan-activation-reason" label="เหตุผล" required>
          <Textarea
            id="plan-activation-reason"
            value={activationReason}
            onChange={(event) => setActivationReason(event.target.value)}
            placeholder="เช่น เลิกใช้แผนนี้ตั้งแต่รอบเดือนหน้า"
          />
        </Field>
      </ConfirmModal>
    </>
  )
}
