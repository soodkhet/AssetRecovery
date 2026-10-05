/**
 * Fixture ของเทสต์ระดับ DB — ทำให้เงินทดรองที่อนุมัติแล้ว "จ่ายจริงแล้ว" (มติ PO U83)
 *
 * เคลียร์ยอดเงินทดรองได้เฉพาะเมื่อเคยอยู่ในรอบจ่ายที่ `completed` ⇒ เทสต์ที่ต้องการทดสอบการเคลียร์ยอด
 * (ไม่ได้ทดสอบรอบจ่ายเอง) เรียก helper นี้หลังอนุมัติ: สร้างรอบจ่าย `completed` + แถวของเงินทดรองนั้น
 * โดยตรง (raw SQL — ไม่ผ่าน service รอบจ่าย) · ไม่ชี้ `advances.payout_batch_item_id` (ไม่มีผลกับยาม U83)
 *
 * เทสต์ที่ทดสอบเส้นทางจริง (สร้างรอบ → ยืนยันโอน → เคลียร์) อยู่ใน `advance-settle-payout.db.test.ts`
 */

export interface RawSqlClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>
}

export async function markAdvancePaidOut(
  client: RawSqlClient,
  input: { organizationId: string; advanceId: string; actorId: string },
): Promise<{ payoutBatchId: string }> {
  const rows = await client.$queryRawUnsafe<{ id: string; payee_id: string; amount: number }[]>(`
    SELECT id, payee_id, COALESCE(approved_satang, requested_satang) AS amount
      FROM advances
     WHERE id = '${input.advanceId}' AND organization_id = '${input.organizationId}'
  `)
  const advance = rows[0]
  if (advance === undefined) throw new Error(`markAdvancePaidOut: ไม่พบเงินทดรอง ${input.advanceId}`)

  const batches = await client.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, net_satang, created_by)
    VALUES ('${input.organizationId}', 'รอบจ่ายเงินทดรอง (fixture U83) ${input.advanceId}', 'outsource', 'completed',
            ${advance.amount}, ${advance.amount}, '${input.actorId}')
    RETURNING id
  `)
  const payoutBatchId = batches[0]?.id ?? ''
  await client.$queryRawUnsafe(`
    INSERT INTO payout_batch_items (organization_id, payout_batch_id, advance_id, payee_id, gross_satang, net_satang, created_by)
    VALUES ('${input.organizationId}', '${payoutBatchId}', '${input.advanceId}', '${advance.payee_id}',
            ${advance.amount}, ${advance.amount}, '${input.actorId}')
    RETURNING id
  `)
  return { payoutBatchId }
}
