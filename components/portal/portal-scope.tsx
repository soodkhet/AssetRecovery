'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { portalApiUrl, portalPageHref } from '@/lib/portal/view-as'

/**
 * บริษัทเป้าหมายของโหมด "ดู portal ในฐานะลูกค้า" (มติ PO U59) — `null` = ผู้ใช้บริษัทดู portal ของตัวเอง
 *
 * ทุก component ของ portal สร้าง URL ผ่าน hook ที่นี่ ⇒ ลิงก์หน้า = `/portal/view-as/<id>/...` และ
 * `/api/portal/*` ได้ `?as=<id>` อัตโนมัติ · ค่านี้เป็นแค่ "ที่อยู่" — สิทธิ์จริงตรวจที่ API ทุก request (DEC-002)
 */
const PortalViewAsContext = createContext<string | null>(null)

export function PortalScopeProvider({ viewAsCompanyId, children }: { viewAsCompanyId: string | null; children: ReactNode }) {
  return <PortalViewAsContext.Provider value={viewAsCompanyId}>{children}</PortalViewAsContext.Provider>
}

export function usePortalViewAsCompanyId(): string | null {
  return useContext(PortalViewAsContext)
}

/** `/api/portal/...` → URL ที่ใช้จริง (เติม `as` ในโหมดดูแทน) */
export function usePortalApiUrl(): (url: string) => string {
  const companyId = usePortalViewAsCompanyId()
  return useCallback((url: string) => portalApiUrl(url, companyId), [companyId])
}

/** `/portal/...` → path ของหน้าในโหมดปัจจุบัน */
export function usePortalPageHref(): (href: string) => string {
  const companyId = usePortalViewAsCompanyId()
  return useCallback((href: string) => portalPageHref(href, companyId), [companyId])
}
