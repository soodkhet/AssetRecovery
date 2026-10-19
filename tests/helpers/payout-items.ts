/**
 * ล้างรายการรอบจ่ายขององค์กรทดสอบ — แถวที่มี snapshot ผู้รับ (ออกเอกสารการจ่ายแล้ว · มติ D7-07) ลบไม่ได้ด้วย
 * trigger `trg_payout_batch_items_payee_snapshot_no_delete` (migration `20261019130000_payout_item_snapshot_no_delete`)
 * ⇒ ปิด trigger **ในทรานแซกชันเดียวกับการลบ** (DDL ของ Postgres เป็น transactional + ALTER TABLE ถือล็อกจน commit
 * ⇒ ไฟล์เทสต์อื่นที่รันพร้อมกันไม่เห็นสถานะปิด และการล้างพร้อมกันต่อคิวกันเอง) · ใช้ในเทสต์ DB เท่านั้น
 */

interface RawTx {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
}

interface TxRunner {
  $transaction<T>(fn: (tx: RawTx) => Promise<T>): Promise<T>
}

export const PAYOUT_ITEM_NO_DELETE_TRIGGER = 'trg_payout_batch_items_payee_snapshot_no_delete'

export async function deletePayoutBatchItemsOfOrg(client: TxRunner, organizationId: string): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE payout_batch_items DISABLE TRIGGER ${PAYOUT_ITEM_NO_DELETE_TRIGGER}`)
    await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${organizationId}'`)
    await tx.$executeRawUnsafe(`ALTER TABLE payout_batch_items ENABLE TRIGGER ${PAYOUT_ITEM_NO_DELETE_TRIGGER}`)
  })
}
