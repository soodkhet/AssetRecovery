import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse } from '@/lib/api/http'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { STORAGE_UPLOAD_CAPABILITIES } from '@/lib/uploads/access'
import { isValidUploadDiscardToken } from '@/lib/uploads/discard-token'
import { uploadDiscardSecret } from '@/lib/uploads/storage'
import { discardUploadsRequestSchema, isDiscardableUploadPath, type DiscardUploadsDto } from '@/lib/uploads/targets'
import { discardStagedUpload } from '@/lib/uploads/verify'

/**
 * `POST /api/storage/discard` (mytester6 T-015/T-019) — ทิ้งไฟล์ที่ผู้ใช้อัปโหลดแล้วไม่ได้ใช้
 * (กด "ทิ้งข้อมูล" / ลบรูปก่อนส่ง) ไม่ให้ค้างใน Storage โดยไม่ผูก record
 *
 * body `{ items: [{ path, discardToken }] }` — ลบได้เฉพาะเมื่อ:
 * 1. มี capability อัปโหลดอย่างน้อยหนึ่งทาง (ยามเดียวกับ `upload-url`)
 * 2. `discardToken` ตรงกับ **ผู้เรียก + path** (ออกโดย `upload-url` ให้ผู้ขอ path นั้น ⇒ ลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด)
 * 3. path อยู่ใน**หมวดที่ทิ้งได้** (`isDiscardableUploadPath` — หลักฐานปิดงานภาคสนาม + รูปรับเข้าคลังเท่านั้น
 *    เพราะการตรวจการอ้างอิงไม่ค้นสำเนาใน JSONB snapshot เช่นโลโก้/ลายเซ็นองค์กร) และ **ไม่มี record ใดอ้าง**
 *    (`isUploadPathReferenced`)
 * ไม่ผ่านข้อ 2/3 ⇒ ข้ามเงียบ ๆ (ไม่บอกว่าไฟล์มีอยู่/ผูกกับอะไร) · ไม่ลง audit เพราะไฟล์ยังไม่เป็นข้อมูลของระบบ
 * (เหมือนการออกโทเคนอัปโหลด) — แต่ทุกรายการลง log แบบมีโครงสร้างฝั่ง server (`[uploads] discard`) ไว้สืบย้อน
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAnyPermission('manage', STORAGE_UPLOAD_CAPABILITIES)
    const parsed = discardUploadsRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const secret = uploadDiscardSecret()
    let removed = 0
    for (const item of parsed.data.items) {
      const result = await discardOne(secret, user.id, item.path, item.discardToken)
      if (result === 'removed') removed += 1
      // ร่องรอยการลบ (รีวิว security D-4) — log แบบมีโครงสร้างฝั่ง server ไม่ใช่ audit_logs เพราะไฟล์ยังไม่เป็น
      // record ของระบบ (ไม่มี target ให้ผูก · เหมือนการออกโทเคนอัปโหลดที่ไม่ลง audit) แต่ยังสืบย้อนผู้สั่งลบได้
      console.info('[uploads] discard', {
        userId: user.id,
        organizationId: user.organizationId,
        path: item.path,
        result,
      })
    }
    const data: DiscardUploadsDto = { removed }
    return apiSuccess(data)
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}

type DiscardResult = 'removed' | 'not_discardable' | 'invalid_token' | 'kept'

/** ตัดสินผลทีละไฟล์ — `kept` = มี record อ้างอยู่/ลบไม่สำเร็จ (ไม่บอกผู้เรียกว่าเป็นกรณีไหน) */
async function discardOne(secret: string, userId: string, path: string, token: string): Promise<DiscardResult> {
  // เฉพาะหมวดที่ฟอร์มทิ้งไฟล์จริง (หลักฐานปิดงาน · รูปรับเข้าคลัง) — หมวดอื่นข้ามเงียบ (รีวิว security D-1)
  if (!isDiscardableUploadPath(path)) return 'not_discardable'
  if (!isValidUploadDiscardToken(secret, userId, path, token)) return 'invalid_token'
  return (await discardStagedUpload(path)) ? 'removed' : 'kept'
}
