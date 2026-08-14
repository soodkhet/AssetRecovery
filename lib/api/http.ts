import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import { authErrorMessage, toAuthErrorResponse } from '@/lib/auth/errors'
import { requirePermission } from '@/lib/auth/require-permission'
import type { PermissionAction, SessionUser } from '@/lib/auth/types'
import { toFieldErrors } from '@/lib/api/validation'

/**
 * ตัวห่อ route handler กลาง — ตรวจสิทธิ์ที่ API layer เสมอ (DEC-002) แล้วแปลง error ของโมดูล
 * เป็น response มาตรฐาน · error ชนิดอื่นถูกโยนต่อให้กลายเป็น 500 จริง (ห้ามกลืนเป็น 400/403 ปลอม)
 *
 * ย้ายออกมาจาก `lib/roles/http.ts` (Phase 1.6) ตอน Phase 1.7 เพื่อให้ทุกโมดูลใช้ตัวเดียวกัน
 * TODO(Phase 2.1): ย้ายไปใช้ response envelope กลางของไฟล์ `45` เมื่อ API Contract Infra พร้อม
 */

export type ApiRouteHandler<Ctx> = (
  request: NextRequest,
  context: Ctx,
  user: SessionUser,
) => Response | Promise<Response>

/** ตัวแปลง error ของโมดูล → Response (ต้องส่งต่อ error ที่ไม่ใช่ของตัวเองให้ `toAuthErrorResponse`) */
export type ModuleErrorResponder = (error: unknown) => Response

export function withApiPermission<Ctx = unknown>(
  action: PermissionAction,
  resource: string,
  toErrorResponse: ModuleErrorResponder,
  handler: ApiRouteHandler<Ctx>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      const user = await requirePermission(action, resource)
      return await handler(request, context, user)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** 400 + field errors ตาม `24` §6.1 `REQUIRED_MISSING` (FE ใช้ `fields` แสดง inline error) */
export function validationErrorResponse(error: z.ZodError): Response {
  return Response.json(
    {
      error: {
        code: 'REQUIRED_MISSING',
        ...authErrorMessage('REQUIRED_MISSING'),
        fields: toFieldErrors(error),
      },
    },
    { status: 400 },
  )
}

/** อ่าน JSON body — body ที่ไม่ใช่ JSON ต้องได้ 400 ไม่ใช่ 500 */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** ข้อความคู่ (title/message) ภาษาไทยของ error code หนึ่งตัว */
export interface ErrorMessage {
  title: string
  message: string
}

/**
 * error ของโมดูลธุรกิจ — โมดูลสร้าง subclass พร้อมตาราง status/message ของตัวเอง
 * code ทุกตัวต้องมีอยู่ใน `docs/24-finance-validation-rules.md` เท่านั้น (Rule 04)
 */
export class ModuleError<Code extends string = string> extends Error {
  readonly code: Code
  readonly status: number
  readonly title: string
  /** ข้อความไทยที่ส่งให้ผู้ใช้ (ไม่มี prefix code เหมือน `Error.message`) */
  readonly userMessage: string
  /** รายละเอียดสำหรับ log ฝั่ง server เท่านั้น — ห้ามส่งออก response */
  readonly detail?: string
  /** ข้อมูลประกอบที่ปลอดภัยพอจะส่งให้ FE (เช่น รายชื่อบริษัทที่ผูกเทมเพลตอยู่ — `12` §11) */
  readonly context?: Record<string, unknown>

  constructor(
    code: Code,
    messages: ErrorMessage,
    status: number,
    options?: { detail?: string; context?: Record<string, unknown> },
  ) {
    super(`${code}: ${messages.message}`)
    this.name = 'ModuleError'
    this.code = code
    this.status = status
    this.title = messages.title
    this.userMessage = messages.message
    this.detail = options?.detail
    this.context = options?.context
  }
}

/** แปลง `ModuleError` → Response · error อื่นส่งต่อให้ `toAuthErrorResponse()` (ซึ่ง throw ต่อถ้าไม่ใช่ `AuthError`) */
export function toModuleErrorResponse(error: unknown): Response {
  if (!(error instanceof ModuleError)) return toAuthErrorResponse(error)
  return Response.json(
    { error: { code: error.code, title: error.title, message: error.userMessage, ...error.context } },
    { status: error.status },
  )
}
