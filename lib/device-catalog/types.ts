import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import type { DeviceAssetKind, DeviceCatalogSourceCode, DeviceCatalogStatusCode } from '@/lib/device-catalog/catalog'

/** ค่าตั้งตัวกรองของ Model Phone (มติ PO U159) — `updatedAt = null` = ยังไม่เคยบันทึก (ค่าเริ่มต้น) */
export interface DeviceCatalogSettingsDto {
  brandNames: string[]
  recentYears: number
  /** ตัวเลือกความจุ/สีของฟอร์มรับเคส (มติ PO U166) */
  capacityOptions: string[]
  colorOptions: string[]
  /** แหล่ง TAC ไม่อัปเดตเกิน N วัน ⇒ ป้ายเตือน (มติ PO U167) */
  staleAlertDays: number
  updatedAt: string | null
}

export interface DeviceCatalogSettingsValues {
  brandNames: string[]
  recentYears: number
  capacityOptions: string[]
  colorOptions: string[]
  staleAlertDays: number
}

/** แถวแบรนด์ในหน้า Model Phone */
export interface DeviceBrandDto {
  id: string
  name: string
  /** แสดงในตัวเลือกจริงไหม (ตั้งด้วยมือชนะ · ไม่ตั้ง = ตามตัวกรอง) */
  visible: boolean
  /** ผลของตัวกรองล้วน ๆ (ไม่นับการตั้งด้วยมือ) */
  filterVisible: boolean
  /** ค่าที่ผู้ดูแลตั้งด้วยมือ — `null` = ตามตัวกรอง */
  manualStatus: DeviceCatalogStatusCode | null
  source: DeviceCatalogSourceCode
  modelCount: number
  /** จำนวนรุ่นที่แสดง (เมื่อแบรนด์แสดง) */
  visibleModelCount: number
}

export interface DeviceBrandListDto {
  items: DeviceBrandDto[]
  total: number
  page: number
  pageSize: number
}

export interface DeviceModelRowDto {
  id: string
  brandId: string
  brandName: string
  brandVisible: boolean
  assetKind: DeviceAssetKind
  name: string
  visible: boolean
  /** ผลของตัวกรองปีล้วน ๆ (ไม่นับการตั้งด้วยมือ) */
  filterVisible: boolean
  manualStatus: DeviceCatalogStatusCode | null
  source: DeviceCatalogSourceCode
  releaseYear: number | null
  nameEdited: boolean
  createdAt: string
  updatedAt: string
}

export interface DeviceModelListDto {
  items: DeviceModelRowDto[]
  total: number
  page: number
  pageSize: number
}

/** สรุปบนหัวหน้า Model Phone (มติ PO U166/U167) */
export interface DeviceCatalogSummaryDto {
  brandCount: number
  visibleBrandCount: number
  modelCount: number
  visibleModelCount: number
  minReleaseYear: number
  tacCount: number
  learnedTacCount: number
  /** นำเข้าไฟล์ TAC สำเร็จครั้งล่าสุด — `null` = ยังไม่เคย */
  tacImportedAt: string | null
  /** ตรวจแหล่งข้อมูลครั้งล่าสุด (รวมรอบที่ไม่มีของใหม่) */
  tacCheckedAt: string | null
  /** วันที่ไฟล์บน GitHub ถูกแก้ล่าสุด — `null` = ไม่ทราบ */
  sourceUpdatedAt: string | null
  /** ไฟล์ต้นทางไม่ถูกแก้เกินจำนวนวันในค่าตั้ง ⇒ ป้าย "แหล่งข้อมูลอาจหยุดอัปเดต" */
  sourceStale: boolean
  staleAlertDays: number
  /** งานอัปเดตที่รอ/กำลังทำอยู่ (กันกดซ้ำ) */
  pendingJob: boolean
}

/** ผลการค้นหาตัวเลือกในฟอร์มรับเคส — เฉพาะรายการที่แสดง ของประเภททรัพย์นั้น */
export interface DeviceModelOptionDto {
  id: string
  brandName: string
  name: string
  /** ข้อความที่จะเก็บลงเคส ("แบรนด์ รุ่น") */
  label: string
}

export interface DeviceCatalogBulkResultDto {
  updated: number
  unchanged: number
}

export interface DeviceCatalogSyncRequestDto {
  jobId: string
  duplicate: boolean
}

/** ผลค้นหา TAC จาก IMEI ในฟอร์มรับเคส (มติ PO U166) */
export interface DeviceTacLookupDto {
  tac: string
  found: boolean
  /** มีเมื่อ `found` */
  brandName: string | null
  modelName: string | null
  variant: string | null
  releaseYear: number | null
  source: 'tacdb' | 'learned' | 'manual' | null
  /** รุ่นในแคตตาล็อกที่ผูก — ใช้เป็น `deviceModelId` ของเคสได้ (แม้รุ่นถูกซ่อนจากตัวเลือก) */
  deviceModelId: string | null
  assetKind: DeviceAssetKind | null
  /** ข้อความยี่ห้อ/รุ่นที่เติมให้ฟอร์ม */
  label: string | null
}

/** แถว TAC ในแท็บ TAC ของหน้า Model Phone */
export interface DeviceTacRowDto {
  id: string
  tac: string
  brandName: string
  modelName: string
  variant: string | null
  releaseYear: number | null
  source: 'tacdb' | 'learned' | 'manual'
  deviceModelId: string | null
  deviceModelLabel: string | null
  createdAt: string
  createdByName: string | null
}

export interface DeviceTacListDto {
  items: DeviceTacRowDto[]
  total: number
  page: number
  pageSize: number
}

/** ประวัติการอัปเดต TAC 1 รอบ (มติ PO U167) */
export interface DeviceTacUpdateDto {
  id: string
  createdAt: string
  trigger: 'daily' | 'manual' | 'file'
  status: 'success' | 'not_modified' | 'failed'
  actorName: string | null
  sourceSha: string | null
  sourceUpdatedAt: string | null
  fileRows: number
  tacsAdded: number
  brandsAdded: number
  modelsAdded: number
  addedModels: string[]
  errorMessage: string | null
}

export interface DeviceTacHistoryDto {
  updates: DeviceTacUpdateDto[]
  /** TAC ที่ระบบจำจากงานจริงล่าสุด (U167) */
  learned: DeviceTacRowDto[]
}

/** ตัวเลือกความจุ/สีของฟอร์มรับเคส (มติ PO U166) */
export interface DeviceAttributeOptionsDto {
  capacityOptions: string[]
  colorOptions: string[]
}

/** บริบทของคำสั่งแก้ฐานรุ่นมือถือ (ผู้กระทำ + meta คำขอ + เหตุผลลง audit) */
export interface DeviceCatalogMutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string | null
}
