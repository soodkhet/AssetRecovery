import type { NextRequest } from 'next/server'
import { emitAudit } from '@/lib/audit/audit'
import { loadCompanyStatus } from '@/lib/auth/company-status'
import { AuthError, toAuthErrorResponse } from '@/lib/auth/errors'
import { isSessionExpired } from '@/lib/auth/permission'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getRawSessionUser } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/types'
import {
  evaluatePortalGate,
  isPortalViewer,
  type PortalAccessOptions,
  type PortalCapabilities,
  type PortalSection,
  type PortalViewer,
} from '@/lib/portal/access'

/**
 * ยามของ `/api/portal/*` (`97` §11/§12/§14/§17 · มติ PO 05/10/2569 U6/O43 D2/D3/D4/D5/D11)
 *
 * ลำดับตรวจ (`97` §17) — ทุก request ไม่ใช้ผลจาก login:
 * 1. ไม่มี session → 401 `UNAUTHENTICATED` · session หมดอายุ → 401 `SESSION_EXPIRED` (ไม่ลง audit — ยังไม่รู้ว่าใครทำ)
 * 2. ไม่ใช่ role กลุ่ม `finance_company` (ผู้ใช้ภายใน + Superadmin — D2/D11) → 403 `PERMISSION_DENIED`
 * 3. ผู้ใช้ถูกปิดใช้ → 403 `ACCOUNT_INACTIVE`
 * 4. บริษัทไม่ active (อ่าน DB ตรงทุก request) → 403 `COMPANY_SUSPENDED`
 * 5. ไม่มี capability ของหมวด (+ `portal_download` เมื่อเป็นไฟล์) → 403 `PERMISSION_DENIED`
 * 6. (ที่ route) แถวไม่มีจริง/เป็นของบริษัทอื่น → 403 `PERMISSION_DENIED` แบบเดียวกัน — `requirePortalRow()`
 *
 * ทุกการปฏิเสธข้อ 2–6 ลง audit action `access_denied` (ไม่บังคับ reason — ไม่ใช่ mutation · `97` §14)
 * ข้อความตอบกลับไม่บอกเหตุผลภายใน (รายละเอียดอยู่ใน audit `after` เท่านั้น)
 */

export interface PortalContext {
  user: SessionUser
  /** `users.company_id` ของผู้เรียก — route ต้องใช้ค่านี้กรอง `company_id` ทุก query (`97` §11) */
  companyId: string
  capabilities: PortalCapabilities
  section: PortalSection
}

export interface PortalGuardOptions extends PortalAccessOptions {
  /** request ปัจจุบัน — ใช้บันทึก endpoint/ip/user-agent ลง audit `access_denied` */
  request?: Request
}

/** ชนิดปลายทางของ audit เมื่อปฏิเสธระดับหมวด (ยังไม่ได้ระบุแถว) */
export const PORTAL_AUDIT_TARGET = 'portal'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PortalDenyCode = 'PERMISSION_DENIED' | 'ACCOUNT_INACTIVE' | 'COMPANY_SUSPENDED'

interface DenyDetail {
  section: PortalSection
  download: boolean
  /** เหตุผลภายในสำหรับ audit เท่านั้น */
  cause: string
  targetType?: string
  requestedId?: string
}

function endpointOf(request: Request | undefined): string | null {
  if (!request) return null
  try {
    // pathname เท่านั้น — query string อาจมีคำค้นของผู้ใช้
    return `${request.method} ${new URL(request.url).pathname}`
  } catch {
    return null
  }
}

async function denyPortal(
  user: SessionUser,
  code: PortalDenyCode,
  detail: DenyDetail,
  request: Request | undefined,
): Promise<never> {
  const meta = request ? getRequestMeta(request) : { ipAddress: null, userAgent: null }
  const requestedId = detail.requestedId
  try {
    await emitAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorRole: user.roleName,
      action: 'access_denied',
      targetType: detail.targetType ?? PORTAL_AUDIT_TARGET,
      // `audit_logs.target_id` เป็น UUID — id สุ่มที่ไม่ใช่ uuid เก็บใน after แทน (ตัดความยาว)
      targetId: requestedId !== undefined && UUID_PATTERN.test(requestedId) ? requestedId : null,
      after: {
        code,
        section: detail.section,
        download: detail.download,
        cause: detail.cause,
        endpoint: endpointOf(request),
        company_id: user.companyId,
        ...(requestedId !== undefined && !UUID_PATTERN.test(requestedId) ? { requested_id: requestedId.slice(0, 64) } : {}),
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
  } catch (error) {
    // audit ล้มต้องไม่ทำให้คำตอบ 403 กลายเป็น 500 (ผู้เรียกยังต้องถูกปฏิเสธ)
    console.error('[portal] access_denied audit failed', error)
  }
  throw new AuthError(code, `portal:${detail.section} ${detail.cause} user=${user.id}`)
}

function toViewer(user: SessionUser): PortalViewer {
  return { roleGroup: user.roleGroup, isSuperadmin: user.isSuperadmin, capabilities: user.capabilities }
}

/**
 * ตรวจสิทธิ์เข้าหมวดของพอร์ทัล — คืน context ให้ route ใช้กรองข้อมูล
 * @throws {AuthError} 401/403 ตามลำดับข้างบน (ห่อ route ด้วย `withPortal()` หรือ `withAuthErrors()`)
 */
export async function requirePortalAccess(
  section: PortalSection,
  options: PortalGuardOptions = {},
): Promise<PortalContext> {
  const now = new Date()
  const download = options.download === true
  const user = await getRawSessionUser(now)
  if (user === null) throw new AuthError('UNAUTHENTICATED')
  if (isSessionExpired(user.loginAt, now)) throw new AuthError('SESSION_EXPIRED', `user=${user.id}`)

  const viewer = toViewer(user)
  if (!isPortalViewer(viewer)) {
    return denyPortal(user, 'PERMISSION_DENIED', { section, download, cause: 'not_company_user' }, options.request)
  }

  const companyStatus = await loadCompanyStatus(user.organizationId, user.companyId)
  const gate = evaluatePortalGate({ viewer, userStatus: user.status, companyStatus }, section, { download })
  if (!gate.ok) {
    const cause =
      gate.code === 'ACCOUNT_INACTIVE'
        ? `user_status:${user.status}`
        : gate.code === 'COMPANY_SUSPENDED'
          ? `company_status:${companyStatus ?? 'missing'}`
          : download
            ? 'missing_capability_or_download'
            : 'missing_capability'
    return denyPortal(user, gate.code, { section, download, cause }, options.request)
  }

  // ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ → ต้องเปลี่ยนรหัสเองก่อน (มติ PO 03/10/2569 — เหมือนระบบภายใน)
  if (user.mustChangePassword === true) throw new AuthError('PASSWORD_CHANGE_REQUIRED', `user=${user.id}`)

  // isPortalViewer + company active ⇒ companyId ไม่เป็น null (loadCompanyStatus คืน null เมื่อไม่มีบริษัท)
  if (user.companyId === null) {
    return denyPortal(user, 'COMPANY_SUSPENDED', { section, download, cause: 'company_missing' }, options.request)
  }

  return { user, companyId: user.companyId, capabilities: user.capabilities, section }
}

export interface PortalRowTarget {
  /** ชื่อตารางของแถวที่ร้องขอ (snake_case ตาม `02`) เช่น `cases` / `handover_lots` */
  type: string
  /** id ที่ผู้เรียกส่งมา (ดิบ — อาจไม่ใช่ uuid) */
  id: string
}

/**
 * ขั้นสุดท้ายของลำดับตรวจ (`97` §12/§17 · มติ O43 D3/D4) — แถวที่ route ดึงมาด้วย id (โดย **ไม่** กรองบริษัท)
 * - ไม่พบแถว (id สุ่ม) หรือเป็นของบริษัทอื่น → 403 `PERMISSION_DENIED` **แบบเดียวกัน** (ไม่ตอบ 404 — ไม่ leak)
 * - ทั้งสองกรณีลง audit `access_denied` (`97` §14 "ข้ามบริษัท/id สุ่ม") แยกด้วย `after.cause`
 */
export async function requirePortalRow<T extends { companyId: string | null }>(
  ctx: PortalContext,
  row: T | null | undefined,
  target: PortalRowTarget,
  options: { request?: Request; download?: boolean } = {},
): Promise<T> {
  if (row !== null && row !== undefined && row.companyId !== null && row.companyId === ctx.companyId) return row
  const cause = row === null || row === undefined ? 'row_not_found' : 'cross_company'
  return denyPortal(
    ctx.user,
    'PERMISSION_DENIED',
    {
      section: ctx.section,
      download: options.download === true,
      cause,
      targetType: target.type,
      requestedId: target.id,
    },
    options.request,
  )
}

/**
 * ปฏิเสธแถวที่ **เป็นของบริษัทผู้เรียกแล้ว** แต่ยังไม่อยู่ในขอบเขตที่พอร์ทัลเปิดให้ (เช่น รูปทรัพย์ของเคสที่ยังไม่
 * "ติดตามสำเร็จ") — ตอบ 403 `PERMISSION_DENIED` แบบเดียวกับ `requirePortalRow()` (ไม่บอกเหตุผล) + audit
 * `access_denied` โดยระบุ `after.cause` ตามที่ route ส่งมา (Portal-P4)
 */
export async function denyPortalRow(
  ctx: PortalContext,
  target: PortalRowTarget,
  cause: string,
  options: { request?: Request; download?: boolean } = {},
): Promise<never> {
  return denyPortal(
    ctx.user,
    'PERMISSION_DENIED',
    { section: ctx.section, download: options.download === true, cause, targetType: target.type, requestedId: target.id },
    options.request,
  )
}

type PortalHandler<Ctx> =(request: NextRequest, context: Ctx, portal: PortalContext) => Response | Promise<Response>

/**
 * ห่อ route `GET /api/portal/*` — ยามหมวด + แปลง `AuthError` เป็น response มาตรฐาน
 * (พอร์ทัล GET เท่านั้น — `97` §11 · ห้าม export method อื่นจากไฟล์ route ของ namespace นี้)
 */
export function withPortal<Ctx = unknown>(
  section: PortalSection,
  options: PortalAccessOptions,
  handler: PortalHandler<Ctx>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      const portal = await requirePortalAccess(section, { ...options, request })
      return await handler(request, context, portal)
    } catch (error) {
      return toAuthErrorResponse(error)
    }
  }
}

/**
 * ปฏิเสธแถวที่ **เป็นของบริษัทผู้เรียกจริง** แต่สถานะยังไม่เปิดให้ทำสิ่งที่ขอ (เช่น ดาวน์โหลดใบเซ็นรับของล็อตที่ยังไม่
 * `confirmed` — `97` §6.4 · มติ O43 D8) → 403 `PERMISSION_DENIED` + audit `access_denied` (`97` §14 — ทุก 403 ของพอร์ทัล)
 * · `cause` = เหตุผลภายใน (เก็บใน audit `after` เท่านั้น ไม่ส่งออก response)
 */
export async function rejectPortalRow(
  ctx: PortalContext,
  target: PortalRowTarget,
  cause: string,
  options: { request?: Request; download?: boolean } = {},
): Promise<never> {
  return denyPortal(
    ctx.user,
    'PERMISSION_DENIED',
    { section: ctx.section, download: options.download === true, cause, targetType: target.type, requestedId: target.id },
    options.request,
  )
}
