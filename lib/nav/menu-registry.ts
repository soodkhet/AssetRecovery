import type { RoleGroup } from '@/lib/generated/prisma/enums'
import {
  ACCOUNTING_ROLE_NAME,
  ADMIN_OFFICE_ROLE_NAME,
  CASE_APPROVER_ROLE_NAME,
  DASHBOARD_PATH,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FIELD_TRACKER_PATH,
  FINANCE_ROLE_NAME,
  SUPERADMIN_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import { hasCapability } from '@/lib/auth/permission'
import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import { DOCUMENT_SAMPLES_CAPABILITY } from '@/lib/documents/samples/catalog'
import { FINANCE_OPERATION_TABS } from '@/lib/finance/operation-tabs'

/** หน้า "ตัวอย่างเอกสารทั้งหมด" (มติ PO U104) */
export const DOCUMENT_SAMPLES_PATH = '/accounting/document-samples'

/** หน้า "ค่าตั้งรอนักบัญชียืนยัน" (มติ PO U170) */
export const SETTING_ASSUMPTIONS_PATH = '/accounting/setting-assumptions'

/**
 * Menu registry — SSOT ของเมนูฝั่ง UI (`06` §7.1.1 Role Group Matrix + §7.2 Top Nav Visibility Matrix)
 *
 * ⚠️ **เป็นชั้น UX เท่านั้น** — ซ่อนเมนูไม่ใช่ security · ข้อมูลจริงทุก endpoint ยังตรวจด้วย
 * `requirePermission(action, resource, scope)` ที่ API layer เสมอ (DEC-002 · Rule 03)
 *
 * ทำไมกรองด้วย "role" ไม่ใช่ capability: `06` §7.2 กำหนดการมองเห็นเมนูเป็นราย role ตรง ๆ และเป็น
 * source of truth ของหัวข้อนี้ (§17) — ส่วน capability (DEC-009) คุมว่า "ทำอะไรได้" ในหน้านั้น
 * ซึ่งบังคับที่ API + `<Can>` ต่างหาก การผูก role ↔ capability จริงเกิดใน Phase 1.6
 */

/** คอลัมน์ของ matrix `06` §7.2 (9 คอลัมน์ — `admin_office` เพิ่มใน v2.3) — ดูหมายเหตุที่ `MENU_ITEMS` */
/**
 * ข้อความกลางของเมนู/แท็บ/หน้าที่ยังไม่เปิดใช้ — ผู้ใช้ต้องไม่เห็นป้ายเฟสพัฒนา ("Phase 7.3" ฯลฯ — UAT BUG-020)
 * `plannedPhase` ยังเก็บไว้ในทะเบียนเพื่อวางแผนงานภายในเท่านั้น ห้าม render
 */
export const UNDER_DEVELOPMENT_TEXT = 'อยู่ระหว่างพัฒนา'

export type MenuAudience =
  | 'superadmin'
  | 'executive'
  | 'finance'
  | 'accounting'
  | 'case_approver'
  | 'admin_office'
  | 'team_lead'
  | 'field_agent'
  | 'company_user'

export type MenuId = 'dashboard' | 'cases' | 'finance' | 'accounting' | 'warehouse' | 'reports' | 'settings'

export interface MenuItem {
  id: string
  /** ชื่อเมนูภาษาไทย — ต้องตรงกับเอกสาร (`06` §9 "ชื่อเมนูในเอกสารกับ UI ต้องตรงกัน") */
  label: string
  path: string
  /** role ที่เห็นเมนูนี้ */
  audiences: readonly MenuAudience[]
  /**
   * หน้าจริงพร้อมใช้แล้วหรือยัง — `false` = ยังเป็น placeholder รอ phase ที่ระบุ
   *
   * ⚠️ ธงนี้เป็น **หนี้ที่ลืมปลดได้ง่ายที่สุดของโปรเจกต์**: `SubNav` เรนเดอร์แท็บที่ `false`
   * เป็น span กดไม่ได้ และ `/cases` เด้งไป `ModulePlaceholder` เมื่อไม่มีลูกที่ `available`
   * ⇒ หน้าที่ทำเสร็จแล้วแต่ลืมปลดธง = ผู้ใช้เข้าไม่ถึงเลย (Final Test ด่าน 5 เจอจริงใน Phase 8.3)
   * `menu-registry.test.ts` จึงล็อกไว้ว่า **ทุก path ที่มี `page.tsx` จริงต้องเป็น `true`**
   */
  available: boolean
  /** phase ที่หน้าจริงเกิด — ใช้วางแผนงานภายในเท่านั้น **ห้าม render ให้ผู้ใช้เห็น** (UAT BUG-020) */
  plannedPhase?: string
  /** แท็บย่อยของเมนู (`06` §8) — `cases` มี sub-menu จริงตาม §7.1.1 ที่เหลือเป็นรายการรอพัฒนา */
  children?: readonly MenuItem[]
  /**
   * เงื่อนไขเพิ่มสำหรับบาง audience — ต้องถือ capability อย่างใดอย่างหนึ่ง (ระดับ `view`) ด้วยถึงจะเห็น
   * ใช้กับ role ที่เห็นเมนูแบบ "บางส่วนตามหน้าที่" เช่น ผู้จัดการทีมเห็นเมนูการเงินเฉพาะเมื่อเป็นผู้อนุมัติ
   * ค่าตอบแทนตาม matrix (มติ PO 03/10/2569 — UAT R6-A) · หัวหน้าทีมที่ไม่มีสิทธิ์อนุมัติไม่เห็นเมนู
   */
  capabilityGate?: { audiences: readonly MenuAudience[]; anyOf: readonly string[] }
}

/**
 * ทุกคอลัมน์ของเมนูภายใน — **ไม่รวม `company_user`**: ผู้ใช้บริษัทไฟแนนซ์ใช้พอร์ทัลทางเดียว ไม่เห็นเมนูภายในใดเลย
 * (`06` v2.6 §7.2 · มติ PO 05/10/2569 U6/O43 D2) — audience ยังคงอยู่เพื่อให้ `resolveMenuAudience()` แยกกลุ่มได้
 */
const ALL_AUDIENCES: readonly MenuAudience[] = [
  'superadmin',
  'executive',
  'finance',
  'accounting',
  'case_approver',
  'admin_office',
  'team_lead',
  'field_agent',
]

/**
 * เมนูทั้งหมด — ค่าการมองเห็นถอดมาจาก `06` §7.2 ตรง ๆ (✅ = อยู่ใน `audiences`)
 *
 * หมายเหตุ **ธุรการ (admin_office)**: ตาราง §7.2 ไม่มีคอลัมน์ของ role นี้ — ยึดตาม mockup
 * `reference/app-shell.html` (`ROLE_CONFIG.admin_office`) ซึ่งเป็น source of truth ด้าน UI:
 * เห็น "แดชบอร์ด" + "จัดการเคส" (แท็บรับเคส) ตามหน้าที่คีย์ข้อมูลเคสในไฟล์ 38 §5
 * + "คลังสินค้า" ตามหน้าที่ทำงานคลังใน `44` §5 (`06` §7.2 v2.4 — มติ PO 03/10/2569 UAT Q1 · BUG-063)
 * + "การตั้งค่า" **เฉพาะแท็บผู้ใช้งาน** (`06` §7.2 v2.3 — มติ PO 03/10/2569 UAT BUG-021: ธุรการถือ
 * `manage:manage_users` ตาม `05` §12 · บัญชีกลุ่ม system ยังจัดการได้เฉพาะ Superadmin — DEC-010)
 */
/** capability ที่เปิดแท็บใดแท็บหนึ่งของหน้าการเงินได้ — ประตูเมนูการเงินของผู้จัดการทีม (UAT R6-A) */
const FINANCE_TAB_CAPABILITIES: readonly string[] = [
  ...new Set(FINANCE_OPERATION_TABS.flatMap((tab) => tab.capabilities)),
]

export const MENU_ITEMS: readonly MenuItem[] = [
  {
    id: 'dashboard',
    label: 'แดชบอร์ด',
    path: DASHBOARD_PATH,
    audiences: ALL_AUDIENCES,
    available: true,
    plannedPhase: '6.6',
  },
  {
    id: 'cases',
    label: 'จัดการเคส',
    path: '/cases',
    audiences: [
      'superadmin',
      'executive',
      'case_approver',
      'admin_office',
      'team_lead',
      'field_agent',
    ],
    available: true,
    plannedPhase: '2.4',
    children: [
      // §7.1.1 — "รับเคส" เป็นของ Role Group `system` เท่านั้น
      {
        id: 'cases.submit',
        label: 'รับเคส',
        path: '/cases/submit',
        audiences: ['superadmin', 'executive', 'case_approver', 'admin_office'],
        available: true,
        plannedPhase: '2.4',
      },
      // §7.1.1 — "มอบหมายงาน" = ผู้จัดการ/หัวหน้า ของ inhouse+outsource (Case Approver ❌ ตามตาราง §7.1.1)
      {
        id: 'cases.assign',
        label: 'มอบหมายงาน',
        path: '/cases/assign',
        audiences: ['superadmin', 'executive', 'team_lead'],
        available: true,
        plannedPhase: '2.7',
      },
      // §7.1.1 — "ติดตามภาคสนาม" = พนักงานติดตามทรัพย์ (mobile-first, shell ของตัวเองตามไฟล์ 41)
      {
        id: 'cases.field',
        label: 'ติดตามภาคสนาม',
        path: FIELD_TRACKER_PATH,
        audiences: ['superadmin', 'executive', 'field_agent'],
        available: true,
        plannedPhase: '2.10',
      },
    ],
  },
  {
    id: 'finance',
    label: 'การเงิน',
    path: '/finance',
    // ผู้จัดการ/หัวหน้าทีม = เห็น **เฉพาะแท็บคิวอนุมัติค่าตอบแทน** และเฉพาะคนที่เป็นผู้อนุมัติตาม matrix
    // (`06` §7.2 v2.5 — มติ PO 03/10/2569 UAT R6-A) · แท็บอื่นซ่อนด้วย capability ใน `lib/finance/operation-tabs.ts`
    // ธุรการ = เห็นเมนูนี้เฉพาะเมื่อถือ `manage_customer_wht` (แท็บ "50 ทวิ ลูกค้า" แท็บเดียว — มติ PO 05/10/2569 U40)
    audiences: ['superadmin', 'executive', 'finance', 'team_lead', 'admin_office'],
    capabilityGate: { audiences: ['team_lead', 'admin_office'], anyOf: FINANCE_TAB_CAPABILITIES },
    available: true,
    plannedPhase: '3.3',
  },
  {
    id: 'accounting',
    label: 'บัญชี',
    path: '/accounting',
    // การเงิน = เห็นเมนูนี้**เฉพาะเมื่อถือ `view_document_samples`** และข้างในเห็นแค่เมนูย่อย "ตัวอย่างเอกสารทั้งหมด"
    // (มติ PO 06/10/2569 U104 · `06` §7.2 v2.11) — งานบัญชี 10 แท็บยังเป็นของ Superadmin/บริหาร/บัญชีตามเดิม
    audiences: ['superadmin', 'executive', 'accounting', 'finance'],
    capabilityGate: { audiences: ['finance'], anyOf: [DOCUMENT_SAMPLES_CAPABILITY] },
    available: true,
    plannedPhase: '4.7',
    children: [
      // หน้าเดิมของเมนูบัญชี (แท็บงานบัญชีอยู่ข้างใน `<AccountingShell>`)
      {
        id: 'accounting.operations',
        label: 'งานบัญชี',
        path: '/accounting',
        audiences: ['superadmin', 'executive', 'accounting'],
        available: true,
        plannedPhase: '4.7',
      },
      // มติ PO 06/10/2569 U104 — ดูหน้าตาเอกสารทุกชนิดที่ระบบออก (PDF จริงจาก renderer · ข้อมูลสมมติ)
      {
        id: 'accounting.document-samples',
        label: 'ตัวอย่างเอกสารทั้งหมด',
        path: DOCUMENT_SAMPLES_PATH,
        audiences: ['superadmin', 'executive', 'accounting', 'finance'],
        capabilityGate: { audiences: ['executive', 'accounting', 'finance'], anyOf: [DOCUMENT_SAMPLES_CAPABILITY] },
        available: true,
      },
      // มติ PO 07/10/2569 U170 (BUG-180) — หน้ารวมค่าตั้งที่เป็นสมมติฐาน: บัญชียืนยันได้โดยไม่ต้องเข้าแท็บตั้งค่า
      // เห็นเมื่ออ่านรายการได้ (`view_master_data` — สิทธิ์ของ API อ่าน) · ปุ่มยืนยันตรวจ `manage_accountant_questions` ที่ API
      {
        id: 'accounting.setting-assumptions',
        label: 'ค่าตั้งรอนักบัญชียืนยัน',
        path: SETTING_ASSUMPTIONS_PATH,
        audiences: ['superadmin', 'executive', 'accounting'],
        capabilityGate: { audiences: ['executive', 'accounting'], anyOf: ['view_master_data'] },
        available: true,
      },
    ],
  },
  {
    id: 'warehouse',
    label: 'คลังสินค้า',
    path: '/warehouse',
    // การเงิน/บัญชี/หัวหน้าทีม = read เท่านั้น (ระดับสิทธิ์บังคับที่ API ไม่ใช่ที่เมนู)
    // ธุรการ = ผู้ทำงานคลัง `44` §5 (`06` §7.2 v2.4 — มติ PO 03/10/2569 UAT Q1 · BUG-063)
    audiences: ['superadmin', 'executive', 'finance', 'accounting', 'admin_office', 'team_lead'],
    available: true,
    plannedPhase: '2.14',
  },
  {
    id: 'reports',
    label: 'รายงาน',
    path: '/reports',
    // การเงิน F1-F5 · บัญชี A1-A4 · ผู้จัดการ/หัวหน้า O1-O5 (ทีมตัวเอง) — กรองรายรายงานที่ Phase 6
    audiences: ['superadmin', 'executive', 'finance', 'accounting', 'team_lead'],
    available: true,
    plannedPhase: '6.1',
  },
  {
    id: 'settings',
    label: 'การตั้งค่า',
    path: '/settings',
    // `06` §7.2 v1.2 (มติ PO 15/08/2569 — D17): การเงิน/บัญชีเห็นเมนูนี้แบบ **บางส่วน** เพื่อเข้าถึง
    // "บันทึกการใช้งาน" + "งานเบื้องหลัง" ที่ `90` §12 / `91` §12 ให้สิทธิ์ไว้ · แท็บอื่นยังถูกกรองออก
    // ด้วย audience ของลูกแต่ละตัว (`filterByAudience` กรองลูกซ้ำอีกชั้น)
    // ธุรการเห็นเฉพาะแท็บ "ผู้ใช้งาน" (มติ PO 03/10/2569 UAT BUG-021) — แท็บอื่นกรองออกด้วย audience ของลูก
    audiences: ['superadmin', 'executive', 'finance', 'accounting', 'admin_office'],
    // ครบทุกแท็บที่วางไว้แล้วตั้งแต่ 1.11 (`/settings` เปลี่ยนเส้นทางไปแท็บแรก**ที่ผู้ใช้เห็น**)
    available: true,
    children: [
      // `06` §9 — "ตั้งค่าทั่วไป" แท็บแรกตาม mockup `settings.html` (`renderSettingsLayout`)
      // สิทธิ์แก้จริงบังคับที่ API ด้วย `manage_roles` (Superadmin เท่านั้น — `25` §16.1)
      {
        id: 'settings.roles',
        label: 'สิทธิ์การใช้งาน',
        path: '/settings/roles',
        audiences: ['superadmin', 'executive'],
        available: true,
      },
      // แท็บย่อยของการตั้งค่าใช้ audience เดียวกับเมนูแม่เสมอ — `06` §7.2 ให้เมนู "การตั้งค่า"
      // เห็นได้เฉพาะ Superadmin/บริหาร · สิทธิ์ระดับ capability (`11` §12 การเงินแก้ได้ / บัญชีดูได้)
      // ยังบังคับจริงที่ API ทุก endpoint — เมนูไม่ใช่ security (DEC-002)
      // ⚠️ `05` §12 ให้ "ธุรการ" จัดการผู้ใช้ได้ด้วย (capability `manage_users` = manage) แต่ `06` §7.2
      // ไม่ให้ role นี้เห็นเมนู "การตั้งค่า" — แท็บย่อยกว้างกว่าเมนูแม่ไม่ได้ จึงคงตาม `06` ไว้ก่อน
      // (สิทธิ์ที่ API ยังมีจริง ใช้ได้เมื่อเปิดทางเข้าหน้าให้ธุรการในภายหลัง)
      {
        id: 'settings.users',
        label: 'ผู้ใช้งาน',
        path: '/settings/users',
        // ธุรการ = ผู้ถือ `manage:manage_users` (`05` §12) — มติ PO 03/10/2569 (UAT BUG-021)
        audiences: ['superadmin', 'executive', 'admin_office'],
        available: true,
      },
      // มติ PO U99 — "ข้อมูลองค์กร" (mockup `settings.html` แท็บ `organization` ต่อจากผู้ใช้งาน)
      // ผู้ขาย/หัวเอกสารบนเอกสารทุกใบ · แก้ได้เฉพาะ Superadmin (`manage_invoice_numbering` ที่ API) · บริหาร/บัญชีดูได้
      {
        id: 'settings.organization',
        label: 'ข้อมูลองค์กร',
        path: '/settings/organization',
        audiences: ['superadmin', 'executive', 'accounting'],
        available: true,
      },
      {
        id: 'settings.compensation',
        label: 'แผนค่าตอบแทน',
        path: '/settings/compensation',
        audiences: ['superadmin', 'executive'],
        available: true,
      },
      {
        id: 'settings.service-fee',
        label: 'เทมเพลตค่าบริการ',
        path: '/settings/service-fee',
        audiences: ['superadmin', 'executive'],
        available: true,
      },
      {
        id: 'settings.teams',
        label: 'ทีมติดตามทรัพย์',
        path: '/settings/teams',
        audiences: ['superadmin', 'executive'],
        available: true,
      },
      {
        id: 'settings.companies',
        label: 'บริษัทไฟแนนซ์',
        path: '/settings/companies',
        // ธุรการเห็นเฉพาะเมื่อถือ `view_client_portal_as` — ทางเข้าปุ่ม "เปิด portal ของลูกค้า" (มติ PO U59 ·
        // `06` §7.2 v2.7) · หน้านี้สำหรับธุรการเป็นอ่านอย่างเดียว (ปุ่มแก้ไข/ระงับต้อง `manage_companies`)
        audiences: ['superadmin', 'executive', 'admin_office'],
        capabilityGate: { audiences: ['admin_office'], anyOf: ['view_client_portal_as'] },
        available: true,
      },
      // มติ PO U155 → U159 — "Model Phone" แคตตาล็อกแบรนด์/รุ่นเครื่อง (mockup `settings.html` แท็บ `modelphone`)
      // ธุรการเห็นเมื่อถือ `manage_device_catalog` (ค่าเริ่มต้น = manage) · API ตรวจ capability เดียวกันทุก endpoint
      {
        id: 'settings.device-catalog',
        label: 'Model Phone',
        path: '/settings/device-catalog',
        audiences: ['superadmin', 'executive', 'admin_office'],
        capabilityGate: { audiences: ['admin_office'], anyOf: ['manage_device_catalog'] },
        available: true,
      },
      // `06` §9 — แท็บที่สองของหน้าตั้งค่าตาม mockup `settings.html` ("ตั้งค่าบัญชี/การเงิน")
      // ข้างในเป็นแท็บแนวตั้ง 13 ตัวตามไฟล์ 13 §6.1–6.13 (5 ตัวแรกเกิดใน 1.11 · ที่เหลือ 1.12)
      {
        id: 'settings.finance',
        label: 'ตั้งค่าบัญชี/การเงิน',
        path: '/settings/finance',
        // มติ PO 06/10/2569 (UAT U93) — การเงิน/บัญชี/ธุรการเห็นแท็บนี้**เฉพาะเมื่อถือ `manage_holidays`** และข้างใน
        // เห็นเฉพาะแท็บที่เปิดให้กลุ่มปฏิบัติการ (`staffAccess` ใน `lib/settings/finance-tabs.ts` — ปฏิทินวันหยุด)
        audiences: ['superadmin', 'executive', 'finance', 'accounting', 'admin_office'],
        capabilityGate: { audiences: ['finance', 'accounting', 'admin_office'], anyOf: ['manage_holidays'] },
        available: true,
      },
      // `06` §9 — "ตั้งค่าทั่วไป" รวม `auditlog` (mockup `settings.html` แท็บสุดท้าย) · Phase 5.2
      // `90` §12 ให้บัญชี/การเงินดู audit ได้ (capability `view_audit_log`) — มติ PO 15/08/2569 (D17)
      // เปิด audience ให้ตรงกับสิทธิ์ที่ให้ไว้จริง (`06` §7.2 v1.2 แก้คู่กัน) · หน้านี้อ่านอย่างเดียว
      // และ API บังคับ `requirePermission()` อยู่แล้ว ⇒ เมนูไม่ใช่ security boundary (DEC-002)
      {
        id: 'settings.audit-logs',
        label: 'บันทึกการใช้งาน',
        path: '/settings/audit-logs',
        audiences: ['superadmin', 'executive', 'finance', 'accounting'],
        available: true,
      },
      // `91` §8 — หน้าสถานะงานเบื้องหลัง (Job Log) · Phase 5.3
      // เหตุผลเดียวกับ audit log: `91` §12 ให้บัญชี/การเงินดูสถานะงานของตัวเองได้ (capability
      // `manage_jobs` ระดับ view) ⇒ เปิด audience ให้ตรงกัน (มติ PO 15/08/2569 — D17)
      // **สั่งงาน/retry ยังไม่ได้** เพราะบังคับที่ API (`manage` + capability ของงานปลายทาง / Superadmin)
      {
        id: 'settings.jobs',
        label: 'งานเบื้องหลัง',
        path: '/settings/jobs',
        audiences: ['superadmin', 'executive', 'finance', 'accounting'],
        available: true,
      },
    ],
  },
]

/** ข้อมูล session เท่าที่จำเป็นต่อการกรองเมนู — ทั้ง `SessionUser` (BE) และ `ClientSession` (FE) เข้าได้ */
export interface MenuViewer {
  isSuperadmin: boolean
  roleGroup: RoleGroup
  roleName: string
  /** ใช้กับ `capabilityGate` เท่านั้น — ไม่ส่งมา = ไม่ผ่านประตู (least privilege) */
  capabilities?: Readonly<Record<string, CapabilityAccessLevel>>
}

/**
 * role ปัจจุบัน → คอลัมน์ใน matrix `06` §7.2
 * คืน `null` เมื่อเป็น role ที่สร้างเพิ่มเอง (custom role) — ได้เห็นเฉพาะเมนูที่ทุกคนเห็น (least privilege)
 * จนกว่า Phase 1.6 จะผูก capability ให้ครบ
 */
export function resolveMenuAudience(viewer: MenuViewer): MenuAudience | null {
  if (viewer.isSuperadmin) return 'superadmin'

  switch (viewer.roleGroup) {
    case 'finance_company':
      return 'company_user'
    case 'inhouse':
    case 'outsource':
      if (viewer.roleName === TEAM_MANAGER_ROLE_NAME || viewer.roleName === TEAM_SUPERVISOR_ROLE_NAME) {
        return 'team_lead'
      }
      return viewer.roleName === FIELD_AGENT_ROLE_NAME ? 'field_agent' : null
    case 'system':
      switch (viewer.roleName) {
        case SUPERADMIN_ROLE_NAME:
          return 'superadmin'
        case EXECUTIVE_ROLE_NAME:
          return 'executive'
        case FINANCE_ROLE_NAME:
          return 'finance'
        case ACCOUNTING_ROLE_NAME:
          return 'accounting'
        case CASE_APPROVER_ROLE_NAME:
          return 'case_approver'
        case ADMIN_OFFICE_ROLE_NAME:
          return 'admin_office'
        default:
          return null
      }
    default:
      return null
  }
}

function passesCapabilityGate(item: MenuItem, audience: MenuAudience, viewer: MenuViewer): boolean {
  const gate = item.capabilityGate
  if (gate === undefined || !gate.audiences.includes(audience)) return true
  const holder = { isSuperadmin: viewer.isSuperadmin, capabilities: viewer.capabilities ?? {} }
  return gate.anyOf.some((capability) => hasCapability(holder, 'view', capability))
}

function filterByAudience(items: readonly MenuItem[], audience: MenuAudience | null, viewer: MenuViewer): MenuItem[] {
  if (audience === null) {
    // custom role — เห็นเฉพาะเมนูที่ทุกคอลัมน์ของ matrix เห็น (ปัจจุบัน = แดชบอร์ด)
    return items
      .filter((item) => ALL_AUDIENCES.every((each) => item.audiences.includes(each)))
      .map((item) => ({ ...item, children: item.children ? [] : undefined }))
  }

  return items
    .filter((item) => item.audiences.includes(audience) && passesCapabilityGate(item, audience, viewer))
    .map((item) =>
      item.children === undefined ? item : { ...item, children: filterByAudience(item.children, audience, viewer) },
    )
}

/** เมนูที่ผู้ใช้คนนี้เห็น (กรอง sub-menu ให้ด้วย) — ใช้ทั้ง top nav, `GET /api/meta/menu` และ route guard ของหน้า */
export function visibleMenus(viewer: MenuViewer): MenuItem[] {
  return filterByAudience(MENU_ITEMS, resolveMenuAudience(viewer), viewer)
}

/** ผู้ใช้คนนี้เห็นเมนู/แท็บย่อยนี้หรือไม่ (`id` = `dashboard`, `cases`, `cases.submit`, …) */
export function canViewMenu(viewer: MenuViewer, menuId: string): boolean {
  const [rootId, childId] = menuId.split('.')
  const root = visibleMenus(viewer).find((item) => item.id === rootId)
  if (!root) return false
  if (childId === undefined) return true
  return (root.children ?? []).some((child) => child.id === menuId)
}

/**
 * แท็บแรกของเมนูนี้ที่ผู้ใช้ **เห็นจริง** — หน้า "ราก" ที่ไม่มีเนื้อหาของตัวเอง (เช่น `/settings`)
 * ใช้ตัวนี้เลือกปลายทาง redirect · คืน `null` = ไม่เห็นเมนูนั้นเลย/ไม่มีแท็บที่เห็นได้
 *
 * ⚠️ redirect ไปแท็บตายตัวไม่ได้แล้ว: `06` §7.2 v1.2 ให้การเงิน/บัญชีเห็น "การตั้งค่า" แบบบางส่วน
 * (เฉพาะบันทึกการใช้งาน/งานเบื้องหลัง) ⇒ ส่งไป `/settings/roles` = เด้งกลับแดชบอร์ดทันที
 */
export function firstVisibleChildPath(viewer: MenuViewer, menuId: MenuId): string | null {
  const root = visibleMenus(viewer).find((item) => item.id === menuId)
  if (root === undefined) return null
  return root.children?.[0]?.path ?? root.path
}

/** เมนูตาม id จาก registry (ไม่กรองสิทธิ์) — ใช้ประกอบหน้า/breadcrumb */
export function findMenu(menuId: string): MenuItem | null {
  const [rootId, childId] = menuId.split('.')
  const root = MENU_ITEMS.find((item) => item.id === rootId)
  if (!root) return null
  if (childId === undefined) return root
  return (root.children ?? []).find((child) => child.id === menuId) ?? null
}
