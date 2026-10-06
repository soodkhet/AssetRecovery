import type { DocumentNumberType } from '@/lib/generated/prisma/enums'

/**
 * ตั้งชุดเลขเอกสารขององค์กรทดสอบตรง ๆ (มติ PO U102 — ระบบไม่เปิดให้แก้ตัวนับผ่าน API)
 * ใช้ในเทสต์ DB เท่านั้น · สร้างแถวค่าเริ่มต้นให้ก่อนถ้ายังไม่มี
 */

interface RawClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

export interface SeriesOverride {
  prefix?: string
  includeYear?: boolean
  digits?: number
  resetYearly?: boolean
  currentSeq?: number
  currentYear?: number | null
}

export async function setDocumentSeries(
  db: RawClient,
  organizationId: string,
  docType: DocumentNumberType,
  override: SeriesOverride,
): Promise<void> {
  await db.$queryRawUnsafe(
    `SELECT ensure_document_number_series($1::uuid, $2::document_number_type)::text`,
    organizationId,
    docType,
  )
  const sets: string[] = []
  const values: unknown[] = [organizationId, docType]
  const push = (column: string, value: unknown, cast: string): void => {
    values.push(value)
    sets.push(`${column} = $${values.length}::${cast}`)
  }
  if (override.prefix !== undefined) push('prefix', override.prefix, 'varchar')
  if (override.includeYear !== undefined) push('include_year', override.includeYear, 'boolean')
  if (override.digits !== undefined) push('digits', override.digits, 'int')
  if (override.resetYearly !== undefined) push('reset_yearly', override.resetYearly, 'boolean')
  if (override.currentSeq !== undefined) push('current_seq', override.currentSeq, 'int')
  if (override.currentYear !== undefined) push('current_year', override.currentYear, 'int')
  if (sets.length === 0) return
  await db.$executeRawUnsafe(
    `UPDATE document_number_series SET ${sets.join(', ')}
      WHERE organization_id = $1::uuid AND doc_type = $2::document_number_type`,
    ...values,
  )
}

/** ตัวนับปัจจุบันของชุดเลข (0 = ยังไม่มีแถว/ยังไม่เคยออก) */
export async function documentSeriesSeq(
  db: RawClient,
  organizationId: string,
  docType: DocumentNumberType,
): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ current_seq: number }>>(
    `SELECT current_seq FROM document_number_series WHERE organization_id = $1::uuid AND doc_type = $2::document_number_type`,
    organizationId,
    docType,
  )
  return Number(rows[0]?.current_seq ?? 0)
}
