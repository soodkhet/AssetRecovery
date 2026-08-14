'use client'

import { useState } from 'react'
import { Badge, Button, InlineAlert } from '@/components/ui'
import { matchTeamsByProvince } from '@/lib/cases/team-suggestion'
import { describeTeamCost } from '@/lib/cases/team-cost'
import type { CaseTeamOptionDto } from '@/lib/cases/types'

/**
 * กล่อง "ทีมที่เสนอ" + รายการทีมอื่น + กล่องค่าใช้จ่ายของทีม (`38` §7.4)
 *
 * - จับคู่จาก **จังหวัดของที่อยู่ปัจจุบันตัวเดียว** ด้วย pure `matchTeamsByProvince()`
 *   (ตัวเดียวกับที่ API ใช้) ⇒ อัปเดตทันทีที่ province เปลี่ยน โดยไม่ต้องยิง API ใหม่
 * - ทีมที่จังหวัดตรงแสดงเป็น **รายการ inline** ทันที ไม่ใช่ dropdown · ทีมนอกจังหวัดซ่อนไว้ใต้
 *   ปุ่ม toggle "ดูทีมอื่นทั้งหมด" · เรียงตามชื่อ ไม่จัดอันดับตามค่าใช้จ่าย
 * - กล่องค่าใช้จ่าย **แสดงค่าที่ตั้งไว้เท่านั้น ไม่คำนวณกำไร/ขาดทุน** (`describeTeamCost()`)
 * - `onSelect` ไม่ส่งมา = อ่านอย่างเดียว (ฟอร์มรับเคส — ยืนยันทีมจริงเกิดตอน `accept` เท่านั้น)
 */
export function TeamSuggestionPanel({
  province,
  teams,
  selectedTeamId,
  onSelect,
  disabled = false,
}: {
  province: string | null
  teams: readonly CaseTeamOptionDto[]
  /** ทีมที่ถูกเลือกอยู่ — `null` = ใช้ทีมที่ระบบเสนอ */
  selectedTeamId: string | null
  onSelect?: (team: CaseTeamOptionDto) => void
  disabled?: boolean
}) {
  const [showAll, setShowAll] = useState(false)

  const matched = matchTeamsByProvince(province, teams.map((team) => ({ ...team, status: 'active' })))
  const matchedIds = new Set(matched.map((team) => team.id))
  const suggested = teams.find((team) => team.id === matched[0]?.id) ?? null
  const selected = teams.find((team) => team.id === selectedTeamId) ?? suggested

  const matchedOptions = teams.filter((team) => matchedIds.has(team.id))
  const otherOptions = teams.filter((team) => !matchedIds.has(team.id))

  return (
    <section>
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ทีมที่เสนอ</h3>

      {province === null || province.trim() === '' ? (
        <p className="text-xs text-slate-400">เลือกจังหวัดของที่อยู่ปัจจุบันก่อน ระบบจึงจะเสนอทีมให้</p>
      ) : matched.length === 0 ? (
        <InlineAlert tone="warning" title={`ไม่มีทีมที่ดูแลจังหวัด${province}`}>
          เลือกทีมอื่นได้จากรายการด้านล่าง — ตอนรับเคสระบบจะบังคับให้ระบุเหตุผลของการเลือกทีมนอกพื้นที่
        </InlineAlert>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Badge className="bg-emerald-600 text-white">ระบบเสนอ</Badge>
              <div className="mt-1 text-sm font-bold text-slate-800">
                {selected?.name ?? suggested?.name ?? '—'}
                {selected !== null && suggested !== null && selected.id !== suggested.id && (
                  <span className="ml-2 text-[11px] font-normal text-amber-700">
                    (เปลี่ยนจากที่ระบบเสนอ: {suggested.name})
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600">
                จับคู่จากจังหวัด{province}
                {selected?.supervisorName !== null && selected?.supervisorName !== undefined
                  ? ` · หัวหน้าทีม ${selected.supervisorName}`
                  : ''}
              </div>
            </div>
          </div>
          {selected !== null && <TeamCostBox team={selected} />}
        </div>
      )}

      {(matchedOptions.length > 0 || otherOptions.length > 0) && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">
            {matchedOptions.length > 0 ? 'ทีมอื่นที่ดูแลจังหวัดนี้' : 'ทีมทั้งหมด'}
          </p>
          <div className="space-y-2">
            {matchedOptions
              .filter((team) => team.id !== selected?.id)
              .map((team) => (
                <TeamOptionCard
                  key={team.id}
                  team={team}
                  onSelect={onSelect}
                  disabled={disabled}
                />
              ))}
          </div>

          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((current) => !current)}>
              {showAll ? 'ซ่อนทีมอื่น' : `ดูทีมอื่นทั้งหมด (${otherOptions.length})`}
            </Button>
          </div>

          {showAll && (
            <div className="mt-2 space-y-2">
              {otherOptions.length === 0 ? (
                <p className="text-xs text-slate-400">ไม่มีทีมอื่นนอกจากที่แสดงอยู่</p>
              ) : (
                otherOptions
                  .filter((team) => team.id !== selected?.id)
                  .map((team) => (
                    <TeamOptionCard
                      key={team.id}
                      team={team}
                      outOfArea
                      onSelect={onSelect}
                      disabled={disabled}
                    />
                  ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function TeamOptionCard({
  team,
  outOfArea = false,
  onSelect,
  disabled,
}: {
  team: CaseTeamOptionDto
  outOfArea?: boolean
  onSelect?: (team: CaseTeamOptionDto) => void
  disabled: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            {team.name}{' '}
            <Badge className={team.side === 'inhouse' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}>
              {team.side === 'inhouse' ? 'ทีมภายใน' : 'ทีมภายนอก'}
            </Badge>
            {outOfArea && <Badge className="ml-1 bg-amber-50 text-amber-700">นอกพื้นที่</Badge>}
          </div>
          <div className="text-[11px] text-slate-500">
            {team.supervisorName === null ? 'ยังไม่มีหัวหน้าทีม' : `หัวหน้าทีม ${team.supervisorName}`} ·{' '}
            {team.provinces.length} จังหวัด
          </div>
        </div>
        {onSelect !== undefined && (
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onSelect(team)}>
            เลือกทีมนี้
          </Button>
        )}
      </div>
      <TeamCostBox team={team} />
    </div>
  )
}

/** กล่องค่าใช้จ่ายของทีม — **ข้อมูลดิบเท่านั้น** ห้ามมีสรุป/กำไร/ขาดทุน (`38` §7.4) */
function TeamCostBox({ team }: { team: CaseTeamOptionDto }) {
  if (team.cost === null) {
    return <p className="mt-2 text-[11px] text-slate-400">ทีมนี้ยังไม่ได้ผูกแผนค่าตอบแทน</p>
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white/70 p-2">
      <div className="mb-1 text-[11px] font-semibold text-slate-500">
        ค่าใช้จ่ายของทีม (ตามแผน “{team.cost.planName}” v{team.cost.planVersion})
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {describeTeamCost(team.cost).map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="text-right">
              <span className="font-mono font-semibold text-slate-800">{row.text}</span>
              {row.note !== null && <span className="ml-1 text-[10px] text-slate-400">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
