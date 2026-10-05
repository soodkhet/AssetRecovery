import { createHash } from 'node:crypto'
import { vi } from 'vitest'
import type * as StorageModule from '@/lib/uploads/storage'
import type * as VerifyModule from '@/lib/uploads/verify'

/**
 * ตัวแทน Storage สำหรับเทสต์ที่แตะ flow อัปโหลด (มติ PO 03/10/2569 — UAT Q13) — ห้ามยิง Supabase จริง (Rule 07)
 *
 * ใช้คู่กับ `vi.mock` 2 ตัว:
 * ```ts
 * vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
 * vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())
 * ```
 * - ค่าเริ่มต้น `uploadTestState.realVerify = false` — เทสต์ workflow ที่ไม่ได้ทดสอบเรื่องไฟล์ ผ่านการตรวจทุก path
 *   (hash = SHA-256 ของ path) เพื่อไม่ต้องแก้ fixture เดิมทั้งหมด
 * - ตั้ง `realVerify = true` เพื่อใช้ตัวตรวจจริง (prefix · ต้องมีไฟล์ · magic bytes · ขนาด · hash) กับไฟล์ใน
 *   `uploadTestState.files` (ใส่ผ่าน {@link putFakeUpload})
 */
export const uploadTestState: {
  realVerify: boolean
  files: Map<string, Uint8Array>
  /** path ที่ `removeStoredFiles()` ถูกสั่งลบ (ตามลำดับ) — ใช้ตรวจว่าไม่ลบไฟล์นอกขอบเขต */
  removed: string[]
  /** path ที่จำลองให้การลบล้มเหลว (มติ PO U97 — ไฟล์ที่ลบไม่สำเร็จต้องลองใหม่รอบหน้า) */
  failRemove: Set<string>
} = {
  realVerify: false,
  files: new Map(),
  removed: [],
  failRemove: new Set(),
}

export function resetFakeUploads(): void {
  uploadTestState.realVerify = false
  uploadTestState.files.clear()
  uploadTestState.removed.length = 0
  uploadTestState.failRemove.clear()
}

export function putFakeUpload(path: string, bytes: Uint8Array): void {
  uploadTestState.files.set(path, bytes)
}

/** ไบต์ตัวอย่างที่ magic bytes ถูกต้องตามชนิด (ต่อท้ายด้วย payload ให้ hash ต่างกันได้) */
export function sampleBytes(kind: 'pdf' | 'jpeg' | 'png' | 'mp4' | 'text', payload = 'x'): Uint8Array {
  const head: Record<typeof kind, number[]> = {
    pdf: [...Buffer.from('%PDF-1.4\n')],
    jpeg: [0xff, 0xd8, 0xff, 0xe0],
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    mp4: [0x00, 0x00, 0x00, 0x18, ...Buffer.from('ftypisom')],
    text: [...Buffer.from('this is not a real file ')],
  }
  return new Uint8Array([...head[kind], ...Buffer.from(payload)])
}

export function sha256Of(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function fakeStorageModule(): Promise<typeof StorageModule> {
  return {
    SIGNED_DOWNLOAD_TTL_SECONDS: 300,
    downloadUploadedFile: async (path: string) => uploadTestState.files.get(path) ?? null,
    createSignedUpload: async (path: string) => ({ path, token: `token:${path}` }),
    createSignedDownloadUrl: async (path: string) =>
      uploadTestState.files.has(path) ? `https://storage.test/signed/${path}` : null,
    removeStoredFiles: async (paths: readonly string[]) => {
      const failed = paths.filter((path) => uploadTestState.failRemove.has(path))
      const removed = paths.filter((path) => !uploadTestState.failRemove.has(path))
      for (const path of removed) {
        uploadTestState.files.delete(path)
        uploadTestState.removed.push(path)
      }
      return { removed, failed }
    },
  }
}

export async function fakeVerifyModule(): Promise<typeof VerifyModule> {
  const actual = await vi.importActual<typeof VerifyModule>('@/lib/uploads/verify')
  const fakeRecord = (path: string) => ({ sha256: sha256Of(path), mimeType: 'application/octet-stream', sizeBytes: 1 })
  return {
    ...actual,
    verifyUploadedFile: async (path, rule, claimed) =>
      uploadTestState.realVerify ? actual.verifyUploadedFile(path, rule, claimed) : fakeRecord(path),
    verifyUploadedFiles: async (files, known = {}) => {
      if (uploadTestState.realVerify) return actual.verifyUploadedFiles(files, known)
      return Object.fromEntries(files.map(({ path }) => [path, known[path] ?? fakeRecord(path)]))
    },
  }
}
