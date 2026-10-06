import type { DeviceAssetKind, DeviceCatalogSourceCode, DeviceCatalogStatusCode } from '@/lib/device-catalog/catalog'

/** ค่าตั้งตัวกรองของ Model Phone (มติ PO U159) — `updatedAt = null` = ยังไม่เคยบันทึก (ค่าเริ่มต้น) */
export interface DeviceCatalogSettingsDto {
  brandNames: string[]
  recentYears: number
  updatedAt: string | null
}

export interface DeviceCatalogSettingsValues {
  brandNames: string[]
  recentYears: number
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
  /** ดึงรายการรุ่นจากต้นทางครั้งล่าสุด — `null` = ยังไม่เคย (หรือเพิ่มเอง) */
  lastSyncedAt: string | null
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

/** สรุปบนหัวหน้า Model Phone — ความคืบหน้าการดึงครั้งแรก + งานล่าสุด */
export interface DeviceCatalogSummaryDto {
  brandCount: number
  visibleBrandCount: number
  modelCount: number
  visibleModelCount: number
  /** แบรนด์จากต้นทางที่ยังไม่เคยดึงรายการรุ่น (การดึงครบครั้งแรกยังไม่จบ) */
  brandsPendingFirstSync: number
  minReleaseYear: number
  lastJob: { status: string; finishedAt: string | null; result: Record<string, unknown> | null } | null
  /** ตั้งคีย์ของแหล่งข้อมูลไว้แล้วหรือยัง (ไม่ส่งค่าคีย์ออกมาเด็ดขาด) */
  apiConfigured: boolean
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
