import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { resolveMenuAudience, type MenuAudience } from '@/lib/nav/menu-registry'

/**
 * SSOT ของ **13 แท็บ** ในหน้า "ตั้งค่าบัญชี/การเงิน" (ไฟล์ `13` §6.1–6.13 · §16)
 *
 * pure ล้วน (ค่าคงที่) — ใช้ร่วมทั้ง server component (ตรวจ `?tab=` ที่ส่งเข้ามา) และ client
 * component (แถบแท็บแนวตั้ง) · เพิ่ม/แก้แท็บต้องแก้ที่นี่ที่เดียว
 *
 * ⚠️ แท็บ "ผู้รับเงิน (Payee Profile)" เป็นของ **ไฟล์ 18** ไม่ใช่ไฟล์ 13 (`13` §16 ยืนยัน 13 แท็บ)
 * — เพิ่มเข้ามาใน Phase 3.2 ตามลำดับของ mockup `settings.html` (`renderSettingsPayee`) เพราะอยู่หน้า
 * เดียวกันกับผู้ใช้ · `section` ของแท็บนี้จึงอ้างไฟล์ 18 ไม่ใช่ §ของไฟล์ 13
 * ⚠️ แท็บ "เกณฑ์ SLA งานติดตาม" (§6.14) เพิ่มใน Phase 6.3 ตาม**มติ PO 15/08/2569 (D18)** — ค่าเก็บที่
 * `assignment_policy_settings.sla_alert_hours` (ตารางของไฟล์ 40) แต่หน้าจอตั้งค่าอยู่รวมที่นี่
 * ⚠️ แท็บ "นโยบายการมอบหมายงาน" เป็นของ **ไฟล์ 40 §6.4/§11** (UAT BUG-002 · มติ PO 03/10/2569) —
 * mockup วางไว้ที่ "ตั้งค่าระบบกลาง" ซึ่งแอปยังไม่มีหน้านั้น ⇒ วางถัดจากแท็บ SLA (ตารางเดียวกัน)
 */

export interface FinanceSettingsTab {
  id: string
  label: string
  /** หัวข้อใน `docs/13-accounting-finance-settings.md` ที่เป็นต้นทางของแท็บนี้ */
  section: string
  /**
   * หน้าจริงพร้อมใช้แล้วหรือยัง — `false` = ยังเป็น placeholder รอ phase ที่ระบุ
   * (ตั้งแต่ Phase 1.12 ครบทั้ง 13 แท็บแล้ว — ช่องนี้เหลือไว้สำหรับแท็บใหม่ในอนาคต)
   */
  available: boolean
  plannedPhase?: string
  /**
   * capability อ่านที่ API ของแท็บนี้ต้องการ (ถืออย่างใดอย่างหนึ่งระดับ `view`) — ไม่ระบุ = เห็นทุกคนที่เข้าหน้าได้
   * แท็บที่ผู้ใช้ไม่มีสิทธิ์อ่าน **ซ่อน** แทนการเปิดแล้วเจอ 403 (UAT R6-C: บริหารเห็นแท็บผู้รับเงินแต่ API ปฏิเสธ
   * — `18` §12 ให้สิทธิ์ดู payee เฉพาะการเงิน/บัญชี/เจ้าของ)
   */
  capabilities?: readonly string[]
  /**
   * แท็บที่ผู้ใช้กลุ่ม**ปฏิบัติการ** (การเงิน/บัญชี/ธุรการ) เห็นได้ — กลุ่มนี้เข้าหน้าตั้งค่าบัญชี/การเงินได้ผ่าน
   * `capabilityGate` ของเมนูเพื่อใช้แท็บเหล่านี้เท่านั้น (มติ PO 06/10/2569 UAT U93 — ปฏิทินวันหยุด) · ไม่ระบุ =
   * เห็นเฉพาะ Superadmin/บริหาร (ผู้ดูแลค่าตั้ง) ตามเดิม
   */
  staffAccess?: boolean
}

export const FINANCE_SETTINGS_TABS: readonly FinanceSettingsTab[] = [
  { id: 'cycles', label: 'รอบบิลและรอบจ่าย', section: '§6.1', available: true },
  { id: 'approval', label: 'สายการอนุมัติ', section: '§6.2 + §6.2.1', available: true },
  { id: 'bank', label: 'บัญชีธนาคารบริษัท', section: '§6.3', available: true },
  { id: 'payee', label: 'ผู้รับเงิน (Payee)', section: 'ไฟล์ 18', available: true, capabilities: ['manage_payee_profile'] },
  { id: 'tax', label: 'กติกาภาษี (Tax Profile)', section: '§6.4', available: true },
  // มติ PO 05/10/2569 (UAT U3/U4/U5/U8) — ค่าตั้งภาษีหัก ณ ที่จ่าย 3 ตัว (effective-dated) ถัดจาก Tax Profile
  { id: 'whtpolicy', label: 'ค่าตั้งภาษีหัก ณ ที่จ่าย', section: '§6.4.2', available: true },
  { id: 'vat', label: 'อัตรา VAT', section: '§6.5', available: true },
  { id: 'cost', label: 'ศูนย์ต้นทุน', section: '§6.6', available: true },
  { id: 'docs', label: 'รูปแบบเอกสารภายใน', section: '§6.7', available: true },
  { id: 'bankfile', label: 'ไฟล์โอนธนาคาร', section: '§6.8', available: true },
  { id: 'export', label: 'รูปแบบไฟล์ส่งบัญชี', section: '§6.9', available: true },
  { id: 'permission', label: 'สิทธิ์บัญชี/การเงิน', section: '§6.10', available: true },
  { id: 'lock', label: 'การล็อกรอบและ Adjustment', section: '§6.11', available: true },
  { id: 'numbering', label: 'เลขที่ใบกำกับภาษี', section: '§6.12', available: true },
  { id: 'taxdoc', label: 'เทมเพลตเอกสารภาษี', section: '§6.13', available: true },
  { id: 'sla', label: 'เกณฑ์ SLA งานติดตาม', section: '§6.14', available: true },
  { id: 'assignment', label: 'นโยบายการมอบหมายงาน', section: 'ไฟล์ 40 §6.4', available: true },
  // มติ PO 06/10/2569 (UAT U93) — ปฏิทินวันหยุด: ธุรการ/บัญชี/การเงินกรอกปีละครั้ง ⇒ เปิดให้กลุ่มปฏิบัติการ
  {
    id: 'holidays',
    label: 'ปฏิทินวันหยุด',
    section: '§6.15',
    available: true,
    capabilities: ['manage_holidays'],
    staffAccess: true,
  },
]

export const DEFAULT_FINANCE_SETTINGS_TAB = 'cycles'

/** ผู้ดูแลค่าตั้ง = audience ที่เห็นเมนู "ตั้งค่าบัญชี/การเงิน" โดยไม่ผ่าน `capabilityGate` (`06` §7.2) */
const SETTINGS_ADMIN_AUDIENCES: readonly MenuAudience[] = ['superadmin', 'executive']

/**
 * ข้อมูลผู้ใช้ที่ใช้กรองแท็บ — `roleGroup`/`roleName` ใช้แยกผู้ดูแลค่าตั้งกับกลุ่มปฏิบัติการ
 * (ไม่ส่ง = ถือเป็นผู้ดูแลค่าตั้ง — เทียบเท่าพฤติกรรมเดิมก่อน U93)
 */
export interface FinanceTabViewer extends CapabilityHolder {
  roleGroup?: RoleGroup
  roleName?: string
}

function isSettingsAdmin(viewer: FinanceTabViewer): boolean {
  if (viewer.isSuperadmin || viewer.roleGroup === undefined || viewer.roleName === undefined) return true
  const audience = resolveMenuAudience({ isSuperadmin: false, roleGroup: viewer.roleGroup, roleName: viewer.roleName })
  return audience !== null && SETTINGS_ADMIN_AUDIENCES.includes(audience)
}

/**
 * แท็บที่ผู้ใช้คนนี้เห็น — แท็บที่ระบุ `capabilities` ต้องถือสักตัว (Superadmin เห็นทุกแท็บ) · ผู้ใช้กลุ่มปฏิบัติการ
 * (การเงิน/บัญชี/ธุรการ) เห็นเฉพาะแท็บ `staffAccess` (U93)
 */
export function visibleFinanceSettingsTabs(viewer: FinanceTabViewer): FinanceSettingsTab[] {
  const admin = isSettingsAdmin(viewer)
  return FINANCE_SETTINGS_TABS.filter(
    (tab) =>
      (admin || tab.staffAccess === true) &&
      (tab.capabilities === undefined ||
        tab.capabilities.some((capability) => hasCapability(viewer, 'view', capability))),
  )
}

/**
 * แท็บแรกที่ใช้งานได้จริงและผู้ใช้เห็น — ใช้เป็นปลายทางเมื่อ `?tab=` ชี้ไปแท็บที่ยังไม่เกิด/ไม่มีสิทธิ์
 * (แท็บเริ่มต้นไม่อยู่ในชุดที่เห็น เช่น ผู้ใช้กลุ่มปฏิบัติการ ⇒ แท็บแรกที่เห็น)
 */
export function resolveFinanceSettingsTab(tab: string | undefined, viewer: FinanceTabViewer): string {
  const visible = visibleFinanceSettingsTabs(viewer).filter((item) => item.available)
  const found = visible.find((item) => item.id === tab)
  if (found !== undefined) return found.id
  return visible.some((item) => item.id === DEFAULT_FINANCE_SETTINGS_TAB)
    ? DEFAULT_FINANCE_SETTINGS_TAB
    : (visible[0]?.id ?? DEFAULT_FINANCE_SETTINGS_TAB)
}
