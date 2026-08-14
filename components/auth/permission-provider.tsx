'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { canAccess } from '@/lib/auth/permission'
import type { ClientSession, PermissionAction, ScopeTarget } from '@/lib/auth/types'

/**
 * สิทธิ์ฝั่ง UI — ใช้ **ซ่อน/disable ปุ่มและเมนูเท่านั้น** (UX)
 * ⚠️ ไม่ใช่ security: ทุก endpoint ตรวจซ้ำด้วย `requirePermission()` ที่ API layer เสมอ (DEC-002 · `05` §8/§10)
 */

const SessionContext = createContext<ClientSession | null>(null)

export function PermissionProvider({ session, children }: { session: ClientSession | null; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): ClientSession | null {
  return useContext(SessionContext)
}

export interface UsePermissionResult {
  session: ClientSession | null
  can: (action: PermissionAction, resource: string, scope?: ScopeTarget) => boolean
}

export function usePermission(): UsePermissionResult {
  const session = useContext(SessionContext)

  return useMemo(
    () => ({
      session,
      can: (action: PermissionAction, resource: string, scope?: ScopeTarget) =>
        session !== null && canAccess(session, action, resource, scope),
    }),
    [session],
  )
}

/** แสดง children เมื่อมีสิทธิ์ — ไม่มีสิทธิ์แสดง `fallback` (default = ซ่อน) */
export function Can({
  action,
  resource,
  scope,
  fallback = null,
  children,
}: {
  action: PermissionAction
  resource: string
  scope?: ScopeTarget
  fallback?: ReactNode
  children: ReactNode
}) {
  const { can } = usePermission()
  return <>{can(action, resource, scope) ? children : fallback}</>
}
