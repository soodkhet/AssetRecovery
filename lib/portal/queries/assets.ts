import { z } from 'zod'
import { canAccess, type PortalCapabilities, type PortalSection } from '@/lib/portal/access'
import type { PortalContext } from '@/lib/portal/guard'
import { portalCaseStatusCode } from '@/lib/portal/status-map'
import { prisma } from '@/lib/prisma'

/**
 * รูปทรัพย์ของพอร์ทัล (`97` §6.1 v3 + §6.4/§17 `GET /api/portal/assets/:id/photos/:index` · มติ O43 D6)
 *
 * ช่องทางสิทธิ์ (ต้องมี `portal_download` เสมอ):
 * - หมวดส่งมอบ (`portal_handover` — คอลัมน์ Capability ของ §17): ทรัพย์ในล็อตของบริษัทตัวเอง หรือของเคส "ติดตามสำเร็จ"
 * - หมวดเคส (`portal_cases`): เฉพาะทรัพย์ของเคส "ติดตามสำเร็จ" (รูปที่หน้ารายละเอียดเคสบอกจำนวนไว้ §6.1)
 *
 * path ใน Storage ไม่ออกจากโมดูลนี้ไปถึง response — route อ่านไฟล์ด้วย service role แล้ว stream ให้เอง
 */

/** หมวดที่ใช้ตรวจสิทธิ์รูปทรัพย์ — ส่งมอบก่อน (ตรงตาราง §17) ไม่มีจึงใช้หมวดเคส */
export function portalAssetPhotoSection(capabilities: PortalCapabilities): PortalSection {
  return canAccess('handover', capabilities, { download: true }) ? 'handover' : 'cases'
}

export interface PortalAssetPhotoRow {
  id: string
  companyId: string
  photos: string[]
  /** path → mimeType ที่ server ตรวจตอนรับไฟล์ (`assets.photo_hashes`) */
  mimeTypes: Readonly<Record<string, string>>
  inLot: boolean
  caseRecovered: boolean
}

/** pure — ทรัพย์นี้เปิดรูปให้บริษัทดูได้ผ่านหมวดนี้หรือไม่ (เรียกหลังยืนยันว่าเป็นของบริษัทตัวเองแล้ว) */
export function portalAssetPhotoViewable(row: Pick<PortalAssetPhotoRow, 'inLot' | 'caseRecovered'>, section: PortalSection): boolean {
  if (row.caseRecovered) return true
  return section === 'handover' && row.inLot
}

const photoHashesSchema = z.record(z.string(), z.object({ mimeType: z.string() }).loose())

function mimeTypesOf(value: unknown): Record<string, string> {
  const parsed = photoHashesSchema.safeParse(value)
  if (!parsed.success) return {}
  return Object.fromEntries(Object.entries(parsed.data).map(([path, meta]) => [path, meta.mimeType]))
}

/**
 * ดึงทรัพย์ด้วย id **โดยไม่กรองบริษัท** (กรององค์กรอย่างเดียว) — route ส่ง `companyId` ต่อให้ `requirePortalRow()`
 * แยก "ไม่พบ"/"ข้ามบริษัท" ใน audit แต่ตอบ 403 เหมือนกัน (D3/D4) · ไม่นับทรัพย์ที่ถูกปฏิเสธตอนรับเข้า/ถูกลบ
 */
export async function findPortalAssetPhotoRow(ctx: PortalContext, id: string): Promise<PortalAssetPhotoRow | null> {
  if (!z.uuid().safeParse(id).success) return null
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: ctx.user.organizationId, deletedAt: null, assetStatus: { not: 'intake_rejected' } },
    select: {
      id: true,
      companyId: true,
      photos: true,
      photoHashes: true,
      lotId: true,
      case: {
        select: {
          status: true,
          deletedAt: true,
          assignments: {
            where: { status: { not: 'reassigned_away' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true },
          },
        },
      },
    },
  })
  if (asset === null) return null
  const caseRecovered =
    asset.case.deletedAt === null &&
    portalCaseStatusCode({ status: asset.case.status, assignmentStatus: asset.case.assignments[0]?.status ?? null }) ===
      'recovered'
  return {
    id: asset.id,
    companyId: asset.companyId,
    photos: asset.photos,
    mimeTypes: mimeTypesOf(asset.photoHashes),
    inLot: asset.lotId !== null,
    caseRecovered,
  }
}

const EXTENSION_MIME: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** ชนิดไฟล์ของรูป — ใช้ค่าที่ server ตรวจไว้ก่อน (เฉพาะ `image/*`) ไม่มีจึงเดาจากนามสกุล */
export function portalPhotoContentType(path: string, mimeTypes: Readonly<Record<string, string>>): string {
  const recorded = mimeTypes[path]
  if (recorded !== undefined && recorded.startsWith('image/')) return recorded
  const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
  return EXTENSION_MIME[extension] ?? 'application/octet-stream'
}
