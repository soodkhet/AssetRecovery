import type { AssetStatus } from '@/lib/generated/prisma/enums'
import { WarehouseError } from '@/lib/warehouse/errors'

/**
 * กติกาการเลือกเครื่องเข้าล็อต (`44` §10 · §12) — **pure ล้วน**
 * ผู้เรียกอ่านเครื่องตาม scope ของตัวเองมาก่อน แล้วส่งเข้ามาที่นี่ (ดู `createLot()`)
 *
 * ลำดับการตรวจถูกจัดให้ error ที่ผู้ใช้เห็นตรงกับสิ่งที่ต้องแก้ก่อน:
 * ว่าง → หาไม่เจอ/นอก scope → ผสมบริษัท → ยังไม่อยู่ในคลัง → อยู่ในล็อตอื่นแล้ว
 */

export interface LotAssetCandidate {
  id: string
  companyId: string
  assetStatus: AssetStatus
  lotId: string | null
  /** เลขล็อตเดิม — ใส่ใน `context` ของ `ASSET_ALREADY_IN_LOT` ให้ผู้ใช้ตามไปดูได้ (`44` §12) */
  lotNumber: string | null
}

export interface LotAssetsInput {
  requestedIds: readonly string[]
  /** บริษัทที่ผู้ใช้เลือกตอนสร้างล็อต — เครื่องทุกตัวต้องเป็นของบริษัทนี้ (`44` §6.2) */
  companyId: string
  /** เครื่องที่อ่านได้จริงภายใน scope ของผู้เรียก (อาจน้อยกว่า `requestedIds`) */
  assets: readonly LotAssetCandidate[]
}

/** สถานะเดียวที่ใส่เข้าล็อตได้ (`44` §10 "Asset Must Be in_custody") */
const LOT_ELIGIBLE_STATUS: AssetStatus = 'in_custody'

export function assertLotAssets(input: LotAssetsInput): void {
  if (input.requestedIds.length === 0) throw new WarehouseError('EMPTY_LOT')

  const found = new Map(input.assets.map((asset) => [asset.id, asset]))
  const missing = [...new Set(input.requestedIds)].filter((id) => !found.has(id))
  if (missing.length > 0) {
    // อยู่นอก scope กับไม่มีจริง ต้องได้ข้อความเดียวกัน (ห้าม leak ว่ามีของบริษัทอื่น · `44` §13)
    throw new WarehouseError('ASSET_NOT_FOUND', { context: { assetIds: missing } })
  }

  const otherCompanies = [
    ...new Set(input.assets.filter((asset) => asset.companyId !== input.companyId).map((asset) => asset.companyId)),
  ]
  if (otherCompanies.length > 0) {
    throw new WarehouseError('MIXED_COMPANY_LOT', {
      context: { expectedCompanyId: input.companyId, foundCompanyIds: otherCompanies },
    })
  }

  const notInCustody = input.assets.filter((asset) => asset.assetStatus !== LOT_ELIGIBLE_STATUS)
  if (notInCustody.length > 0) {
    throw new WarehouseError('ASSET_NOT_IN_CUSTODY', {
      context: { assetIds: notInCustody.map((asset) => asset.id) },
    })
  }

  const alreadyInLot = input.assets.filter((asset) => asset.lotId !== null)
  if (alreadyInLot.length > 0) {
    throw new WarehouseError('ASSET_ALREADY_IN_LOT', {
      context: {
        assetIds: alreadyInLot.map((asset) => asset.id),
        lotNumbers: [...new Set(alreadyInLot.map((asset) => asset.lotNumber).filter((no): no is string => no !== null))],
      },
    })
  }
}
