import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import { authErrorMessage, toAuthErrorResponse } from '@/lib/auth/errors'
import { requirePermission } from '@/lib/auth/require-permission'
import type { PermissionAction, SessionUser } from '@/lib/auth/types'
import { API_CONTRACT, type EndpointId } from '@/lib/api/contract'
import { apiFailure, apiSuccess, type ApiWarning } from '@/lib/api/envelope'
import { ModuleError } from '@/lib/api/errors'
import { toFieldErrors } from '@/lib/api/validation'

/**
 * ตัวห่อ route handler กลาง — ตรวจสิทธิ์ที่ API layer เสมอ (DEC-002) แล้วแปลง error ของโมดูล
 * เป็น response มาตรฐาน · error ชนิดอื่นถูกโยนต่อให้กลายเป็น 500 จริง (ห้ามกลืนเป็น 400/403 ปลอม)
 *
 * ย้ายออกมาจาก `lib/roles/http.ts` (Phase 1.6) ตอน Phase 1.7 เพื่อให้ทุกโมดูลใช้ตัวเดียวกัน
 * ตั้งแต่ Phase 2.1 ทุก response ที่ออกจากตัวห่อนี้ใช้ envelope กลาง (`lib/api/envelope.ts`)
 * และ endpoint ใหม่ทุกตัวต้องผูก contract ผ่าน `withEndpoint()` (ไฟล์ `45`)
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
  return apiFailure(
    {
      code: 'REQUIRED_MISSING',
      ...authErrorMessage('REQUIRED_MISSING'),
      fields: toFieldErrors(error),
    },
    400,
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

/** แปลง `ModuleError` → Response · error อื่นส่งต่อให้ `toAuthErrorResponse()` (ซึ่ง throw ต่อถ้าไม่ใช่ `AuthError`) */
export function toModuleErrorResponse(error: unknown): Response {
  if (!(error instanceof ModuleError)) return toAuthErrorResponse(error)
  return apiFailure(
    { code: error.code, title: error.title, message: error.userMessage, ...error.context },
    error.status,
  )
}

/** ผลลัพธ์ของ handler ที่ผูก contract — คืน `data` แล้วตัวห่อจะใส่ envelope ให้เอง */
export interface EndpointResult<T> {
  data: T
  /** 201 ตอนสร้าง record ใหม่ · ปล่อยว่าง = 200 */
  status?: number
  /** สำเร็จแต่มีเรื่องต้องบอก (`08` §14 · D1) */
  warning?: ApiWarning
}

export type EndpointHandler<Ctx, T> = (
  request: NextRequest,
  context: Ctx,
  user: SessionUser,
) => Promise<EndpointResult<T> | Response> | EndpointResult<T> | Response

export interface EndpointRouteOptions<Ctx, T> {
  /** id ใน `API_CONTRACT` (ไฟล์ `45`) — ห้ามเขียน path เองในไฟล์ route */
  endpoint: EndpointId
  action: PermissionAction
  resource: string
  /** ตัวแปลง error ประจำโมดูล — ไม่ระบุ = `toModuleErrorResponse` */
  toErrorResponse?: ModuleErrorResponder
  handler: EndpointHandler<Ctx, T>
}

/**
 * ตัวห่อ route ของ endpoint ที่ประกาศไว้ใน contract (`45`) — **ทุก endpoint ตั้งแต่ Phase 2.1 ใช้ตัวนี้**
 *
 * ทำ 4 อย่างในที่เดียว: ยืนยันว่า HTTP method ตรง contract → `requirePermission()` (DEC-002) →
 * ห่อผลลัพธ์ด้วย envelope กลาง → แปลง error ของโมดูลเป็น envelope เดียวกัน
 * (คืน `Response` ตรง ๆ ได้เมื่อ endpoint ส่งไฟล์ เช่น PDF/Excel ของ `44` §15)
 */
export function withEndpoint<Ctx = unknown, T = unknown>(
  options: EndpointRouteOptions<Ctx, T>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  const contract = API_CONTRACT[options.endpoint]
  const toErrorResponse = options.toErrorResponse ?? toModuleErrorResponse
  return async (request, context) => {
    if (request.method !== contract.method) {
      throw new Error(
        `route ของ "${options.endpoint}" ถูกต่อกับ ${request.method} แต่ contract ระบุ ${contract.method} (${contract.path})`,
      )
    }
    try {
      const user = await requirePermission(options.action, options.resource)
      const result = await options.handler(request, context, user)
      if (result instanceof Response) return result
      return apiSuccess(result.data, { status: result.status, warning: result.warning })
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}
