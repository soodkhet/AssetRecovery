import type { SessionUser } from '@/lib/auth/types'
import { assertReportAccess, reportTeamScope } from '@/lib/reports/access'
import { withReportCache } from '@/lib/reports/cache'
import type { ReportDefinition } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import type { ReportData, ReportPayload } from '@/lib/reports/payload'
import { reportProviderOf, type ReportContext } from '@/lib/reports/providers'
import { reportRangeKey, type ReportRange } from '@/lib/reports/range'
import { toIsoDateOnly } from '@/lib/reports/period'

/**
 * ตัวรันรายงานกลาง — ทางเดินเดียวของทุกรายงาน (หน้าจอ / export / งานเบื้องหลัง ใช้ตัวนี้ทั้งหมด)
 *
 * ลำดับที่ห้ามสลับ: **ตรวจสิทธิ์ → คิด scope → ประกอบคีย์แคช → แคชตามโหมด `96` §8 → provider**
 *
 * ### คีย์แคชต้องมีครบ 4 ส่วน (พลาดข้อใดข้อหนึ่ง = ข้อมูลรั่วข้ามคน)
 * 1. `organization_id` — multi-tenant (Rule 02)
 * 2. `report.id`
 * 3. ช่วงเวลา + พารามิเตอร์ของรายงาน
 * 4. **ลายนิ้วมือ scope ของผู้เรียก** — ผู้จัดการคนละชุดทีมต้องไม่ใช้แคชร่วมกัน (`96` §10/§14)
 */

export interface RunReportOptions {
  readonly range: ReportRange
  readonly refresh: boolean
  readonly params?: Readonly<Record<string, string>>
  readonly now?: Date
}

/** ลายนิ้วมือของขอบเขตข้อมูลที่ผู้เรียกเห็น — ส่วนหนึ่งของคีย์แคช */
function scopeFingerprint(teamIds: readonly string[] | null): string {
  return teamIds === null ? 'all' : `teams(${[...teamIds].sort().join(',')})`
}

function paramsFingerprint(params: Readonly<Record<string, string>>): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([key, value]) => `${key}=${value}`).join('&')
}

export function reportCacheKeyPrefix(user: SessionUser, report: ReportDefinition): string {
  return `${user.organizationId}:report:${report.id}:`
}

export function reportCacheKey(
  user: SessionUser,
  report: ReportDefinition,
  range: ReportRange,
  params: Readonly<Record<string, string>>,
  teamIds: readonly string[] | null,
): string {
  return [
    `${reportCacheKeyPrefix(user, report)}${reportRangeKey(range)}`,
    paramsFingerprint(params),
    scopeFingerprint(teamIds),
  ].join('|')
}

/**
 * รันรายงานหนึ่งตัวแล้วคืน payload ที่หน้าจอกับไฟล์ export ใช้ร่วมกัน (`96` §13)
 *
 * @throws {AuthError} `PERMISSION_DENIED` เมื่อ role ไม่มีสิทธิ์ดูหมวดนั้น (`96` §10)
 * @throws {ReportError} `REPORT_NOT_FOUND` เมื่อรายงานยังไม่มี provider (ยังไม่เปิดใช้งาน)
 */
export async function runReport(
  user: SessionUser,
  report: ReportDefinition,
  options: RunReportOptions,
): Promise<ReportPayload> {
  assertReportAccess(user, report)

  const provider = reportProviderOf(report.id)
  if (provider === null) {
    throw new ReportError('REPORT_NOT_FOUND', { detail: `report=${report.code} ยังไม่มี provider (Phase 6.2–6.5)` })
  }

  const now = options.now ?? new Date()
  const params = options.params ?? {}
  const teamIds = reportTeamScope(user)
  const context: ReportContext = { user, report, range: options.range, teamIds, params, now }
  const key = reportCacheKey(user, report, options.range, params, teamIds)

  const cached = await withReportCache<ReportData>(
    key,
    { mode: report.cacheMode, refresh: options.refresh, now, cooldown: true },
    () => provider(context),
  )

  return {
    report: { code: report.code, id: report.id, title: report.title, category: report.category },
    range: {
      preset: options.range.preset,
      label: options.range.label,
      from: toIsoDateOnly(options.range.startDate),
      to: toIsoDateOnly(options.range.endDate),
    },
    columns: cached.value.columns,
    rows: cached.value.rows,
    kpis: cached.value.kpis ?? [],
    totalRow: cached.value.totalRow ?? null,
    note: cached.value.note ?? null,
    cache: {
      mode: cached.mode,
      computedAt: cached.computedAt.toISOString(),
      fromCache: cached.fromCache,
      stale: cached.stale,
      expiresAt: cached.expiresAt === null ? null : cached.expiresAt.toISOString(),
      refreshAvailableAt: cached.refreshAvailableAt === null ? null : cached.refreshAvailableAt.toISOString(),
      refreshThrottled: cached.refreshThrottled,
    },
  }
}
