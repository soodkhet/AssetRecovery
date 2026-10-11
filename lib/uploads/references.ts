import { prisma } from '@/lib/prisma'

/**
 * path ของไฟล์ที่อัปโหลดนี้ยังถูก record ใดอ้างอยู่หรือไม่ (รวมแถวที่ soft-delete — ไฟล์ยังเป็นหลักฐานของแถวนั้น)
 *
 * ใช้กันการลบไฟล์ที่ถูกปฏิเสธ (mytester A-14 · รีวิวเฟส 4 ข้อ 1): ข้อมูลเก่าบางชุดผูกไฟล์โดยไม่เคยผ่านการตรวจ
 * (`expenses.receipt_file_unverified` · `payee_profiles.id_document_unverified` — migration 20261008070000)
 * ⇒ ส่งซ้ำแล้วชนิดไม่ตรงต้องไม่ลบไฟล์ที่ยังผูกกับ record · ครอบทุกคอลัมน์ที่เก็บ path ของไฟล์อัปโหลด
 * (คอลัมน์เดี่ยว · array · key ของ map JSONB ที่ server ตรวจแล้ว)
 *
 * เรียกเฉพาะเส้นที่ไฟล์ถูกปฏิเสธเพราะชนิดไม่ตรง (เกิดน้อย) — ไม่อยู่ในเส้นปกติ
 */
export async function isUploadPathReferenced(path: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ referenced: boolean }>>`
    SELECT (
         EXISTS (SELECT 1 FROM expenses WHERE receipt_file_url = ${path})
      OR EXISTS (SELECT 1 FROM advances WHERE receipt_file_url = ${path})
      OR EXISTS (SELECT 1 FROM advance_returns WHERE evidence_file_path = ${path})
      OR EXISTS (SELECT 1 FROM payee_profiles WHERE id_document_url = ${path})
      OR EXISTS (SELECT 1 FROM organizations WHERE logo_url = ${path} OR signature_path = ${path})
      OR EXISTS (SELECT 1 FROM finance_company_documents WHERE file_path = ${path})
      OR EXISTS (SELECT 1 FROM case_documents WHERE file_url = ${path})
      OR EXISTS (
           SELECT 1 FROM case_evidences
           WHERE audio_url = ${path} OR ${path} = ANY (photos) OR ${path} = ANY (videos)
              OR ${path} = ANY (product_photos) OR (file_hashes -> ${path}::text) IS NOT NULL
         )
      OR EXISTS (
           SELECT 1 FROM close_case_drafts
           WHERE audio_url = ${path} OR ${path} = ANY (photos) OR ${path} = ANY (videos)
              OR ${path} = ANY (product_photos) OR (file_hashes -> ${path}::text) IS NOT NULL
         )
      OR EXISTS (SELECT 1 FROM assets WHERE ${path} = ANY (photos) OR (photo_hashes -> ${path}::text) IS NOT NULL)
      OR EXISTS (SELECT 1 FROM handover_lots WHERE signed_doc_url = ${path} OR delivery_proof_url = ${path})
      OR EXISTS (SELECT 1 FROM payout_batches WHERE payment_file_url = ${path})
      OR EXISTS (SELECT 1 FROM substitute_receipts WHERE signed_file_path = ${path})
      OR EXISTS (SELECT 1 FROM credit_notes WHERE file_path = ${path})
      OR EXISTS (SELECT 1 FROM bank_transactions WHERE refund_file_path = ${path})
      OR EXISTS (SELECT 1 FROM customer_wht_certificates WHERE file_url = ${path})
    ) AS referenced
  `
  return rows[0]?.referenced === true
}
