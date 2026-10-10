import { findMenu } from '@/lib/nav/menu-registry'
import { PORTAL_SECTIONS, type PortalSection } from '@/lib/portal/access'

/**
 * staging E-072 (มติ PO 10/10/2569) — เปิดหน้าที่ไม่มีสิทธิ์ ⇒ เด้งกลับหน้าแรกพร้อม `?denied=<หมวด>` แล้วบอกเหตุผล
 * (เดิมเด้งเงียบ ผู้ใช้ไม่รู้ว่าทำไม) · ใช้แบบเดียวกันทั้งพอร์ทัลบริษัทและระบบภายใน
 * ค่าที่ไม่รู้จัก ⇒ `null` (ไม่สะท้อนข้อความจาก URL กลับขึ้นจอ)
 */
export const DENIED_QUERY_PARAM = 'denied'

const PORTAL_SECTION_DENIED_LABEL: Readonly<Record<PortalSection, string>> = {
  cases: 'เคสของเรา',
  finance: 'การเงิน (รอบวางบิล / ใบเสร็จรับเงิน/ใบกำกับภาษี)',
  handover: 'ใบส่งมอบทรัพย์',
  profile: 'ข้อมูลบริษัท',
}

export function deniedHref(basePath: string, key: string): string {
  return `${basePath}?${DENIED_QUERY_PARAM}=${encodeURIComponent(key)}`
}

export function portalDeniedMessage(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined || !(PORTAL_SECTIONS as readonly string[]).includes(value)) return null
  return `บัญชีของคุณยังไม่มีสิทธิ์ดูหมวด "${PORTAL_SECTION_DENIED_LABEL[value as PortalSection]}" — หากต้องการใช้งาน กรุณาติดต่อเจ้าหน้าที่`
}

export function menuDeniedMessage(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined) return null
  const menu = findMenu(value)
  if (menu === null) return null
  return `บัญชีของคุณยังไม่มีสิทธิ์เปิดเมนู "${menu.label}" — หากต้องการใช้งาน กรุณาติดต่อผู้ดูแลระบบ`
}
