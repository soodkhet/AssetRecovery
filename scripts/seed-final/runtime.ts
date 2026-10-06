import Module from 'node:module'
import { createHash } from 'node:crypto'

/**
 * โครงพื้นฐานของ seed-final (มติ U119 ข้อ 4 · U123 · U124) — ต้องเรียก {@link prepareRuntime} **ก่อน** import
 * โมดูลใน `lib/` ทุกตัว (lib/prisma อ่าน DATABASE_URL ตอนสร้าง client · stub ต้องอยู่ใน require.cache ก่อน)
 *
 * - นาฬิกาจำลอง (U124): แทน `globalThis.Date` ด้วยคลาสที่ `new Date()` / `Date.now()` คืนเวลาจำลอง
 *   เดินหน้า 1 ms ต่อการอ่าน (ลำดับเหตุการณ์คงที่ + ไม่มีสองแถวเวลาเท่ากัน) · `new Date(x)` ทำงานปกติ
 * - Storage/Auth: ระหว่างพัฒนา **ห้ามยิง Supabase จริง** ⇒ stub `lib/uploads/storage` (คืนไบต์ตัวอย่างตามนามสกุล)
 *   และ `lib/supabase/server` (เรียกเมื่อไหร่ throw) เว้นแต่สั่ง `--with-storage` / `--create-auth-users`
 */

const RealDate = Date
let simulatedMs: number | null = null

class SimulatedDate extends RealDate {
  constructor(...args: [] | [string | number | Date] | [number, number, number?, number?, number?, number?, number?]) {
    if (args.length === 0) {
      super(SimulatedDate.now())
    } else if (args.length === 1) {
      super(args[0])
    } else {
      const [y, m, d, h, mi, s, ms] = args
      super(y, m, d ?? 1, h ?? 0, mi ?? 0, s ?? 0, ms ?? 0)
    }
  }

  static override now(): number {
    if (simulatedMs === null) return RealDate.now()
    simulatedMs += 1
    return simulatedMs
  }
}

export function installClock(): void {
  globalThis.Date = SimulatedDate as unknown as DateConstructor
}

/** ตั้งเวลาจำลอง — รับ ISO (UTC) · `null` = กลับไปใช้เวลาจริง */
export function setClock(iso: string | null): void {
  simulatedMs = iso === null ? null : RealDate.parse(iso)
}

/** เวลาจำลองแบบเวลาไทย `YYYY-MM-DD HH:mm` → ISO UTC */
export function bkk(dateTime: string): string {
  const [date, time = '09:00'] = dateTime.split(' ')
  return new RealDate(`${date}T${time}:00+07:00`).toISOString()
}

export function clockAt(dateTime: string): void {
  setClock(bkk(dateTime))
}

export function realNow(): Date {
  return new RealDate(RealDate.now())
}

// ─── stub โมดูล ────────────────────────────────────────────────────────────

const req = Module.createRequire(__filename)

function stubModule(relativePath: string, exportsObject: Record<string, unknown>): void {
  const file = req.resolve(relativePath)
  const stub = new Module(file)
  stub.filename = file
  stub.loaded = true
  stub.exports = { __esModule: true, ...exportsObject }
  req.cache[file] = stub
}

const MAGIC: Record<string, number[]> = {
  pdf: [...Buffer.from('%PDF-1.4\n')],
  jpg: [0xff, 0xd8, 0xff, 0xe0],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  mp4: [0x00, 0x00, 0x00, 0x18, ...Buffer.from('ftypisom')],
}

/** ไบต์ตัวอย่างของไฟล์ seed — magic bytes ถูกชนิด + payload จาก path (hash คงที่ทุกการรัน) */
/** PNG 1×1 จริง (โลโก้/ลายเซ็นถูกวาดลง PDF — ต้องถอดรหัสได้) */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export function sampleFileBytes(path: string): Uint8Array {
  const ext = (path.split('.').pop() ?? 'pdf').toLowerCase()
  if (ext === 'png') return new Uint8Array([...TINY_PNG, ...Buffer.from(`seed-final:${path}`)])
  const head = MAGIC[ext] ?? MAGIC['pdf'] ?? []
  return new Uint8Array([...head, ...Buffer.from(`seed-final:${path}`)])
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export interface RuntimeOptions {
  withStorage: boolean
  realAuth: boolean
}

export function prepareRuntime(options: RuntimeOptions): void {
  // adapter-pg สมมติ session เป็น UTC (ดู vitest.config.ts) — กันค่าเวลาเพี้ยน 7 ชม. บน Postgres ที่ตั้งเวลาไทย
  if (process.env['PGOPTIONS'] === undefined) process.env['PGOPTIONS'] = '-c TimeZone=UTC'
  installClock()

  if (!options.withStorage && !options.realAuth) {
    const refuse = (name: string) => () => {
      throw new Error(`[seed-final] ${name}: ห้ามเรียก Supabase ในโหมดนี้ — ใช้ --with-storage / --create-auth-users`)
    }
    stubModule('../../lib/supabase/server', {
      createSupabaseServerClient: refuse('createSupabaseServerClient'),
      createSupabaseStatelessClient: refuse('createSupabaseStatelessClient'),
      createSupabaseAdminClient: refuse('createSupabaseAdminClient'),
    })
  }
  if (!options.withStorage) {
    stubModule('../../lib/uploads/storage', {
      SIGNED_DOWNLOAD_TTL_SECONDS: 300,
      downloadUploadedFile: async (path: string) => sampleFileBytes(path),
      createSignedUpload: async (path: string) => ({ path, token: `seed-final:${path}` }),
      createSignedDownloadUrl: async (path: string) => `https://storage.seed-final.invalid/${path}`,
      removeStoredFiles: async (paths: readonly string[]) => ({ removed: [...paths], failed: [] }),
    })
  }
  if (!options.withStorage) {
    // ไฟล์ export pack / ไฟล์โอนธนาคาร: เก็บในหน่วยความจำ (ระหว่างพัฒนา) — `--with-storage` ใช้ bucket จริง
    const memory = new Map<string, Uint8Array>()
    const put = async (input: { path: string; bytes: Uint8Array }) => {
      memory.set(input.path, input.bytes)
    }
    const read = async (path: string) => memory.get(path) ?? new Uint8Array()
    stubModule('../../lib/exports/pack-storage', {
      ...(req('../../lib/exports/pack-storage') as Record<string, unknown>),
      uploadPackFile: put,
      removePackFiles: async (paths: readonly string[]) => [...paths],
      downloadPackFile: read,
    })
    stubModule('../../lib/payout/payment-file-storage', {
      ...(req('../../lib/payout/payment-file-storage') as Record<string, unknown>),
      uploadPaymentFile: put,
      downloadPaymentFile: read,
    })
  }
  if (!options.realAuth) {
    // บัญชี Auth จำลอง (uid คงที่จากอีเมล) — ใช้กับ --bootstrap-personas บนเครื่องเท่านั้น
    const fakeUid = (email: string) => {
      const hex = createHash('sha256').update(`seed-final-auth:${email}`).digest('hex')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
    }
    stubModule('../../lib/users/provisioning', {
      ...(req('../../lib/users/provisioning') as Record<string, unknown>),
      findAuthUserIdByEmail: async () => null,
      createAuthAccount: async (email: string) => fakeUid(email),
      verifyPassword: async () => false,
      setAuthPassword: async () => undefined,
      getAuthEmail: async () => null,
      deleteAuthAccount: async () => undefined,
      syncAuthEmail: async (_uid: string, email: string) => email,
    })
  }

}
