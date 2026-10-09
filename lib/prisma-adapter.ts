import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Driver adapter ของ Prisma ที่ **ส่ง query บน connection เดียวกันทีละตัว** (staging S-022)
 *
 * ### ต้นเหตุ
 * Prisma 7 (query interpreter ใน `@prisma/client/runtime`) โหลด relation ที่ `include`/`select` ไว้
 * ด้วย query แยก แล้วยิง child ทุกตัว **พร้อมกัน** (`Promise.all(children.map(...))` ของ node `join`)
 * ⇒ นอก transaction แต่ละ child ได้ connection ของตัวเองจาก pool จึงไม่มีปัญหา แต่ **ใน `$transaction`**
 * ทุก child ใช้ connection เดียวกัน ⇒ ตั้งแต่ child ตัวที่ 3 `pg@8` เข้าคิวภายในแล้วพ่น
 * `DeprecationWarning: Calling client.query() when the client is already executing a query` (log ระดับ error
 * บน Vercel · พฤติกรรมนี้จะถูกถอดใน pg@9) — ไม่ใช่ `Promise.all` บน `tx` ในโค้ดแอป (Prisma ต่อคิว operation
 * ระดับบนใน interactive transaction ให้อยู่แล้ว)
 *
 * ### วิธีแก้
 * ต่อคิว `client.query()` แบบ promise ของแต่ละ connection เองก่อนส่งให้ `pg` ("external async flow control"
 * ตามที่ข้อความเตือนแนะนำ) — ลำดับและผลลัพธ์เหมือนเดิมทุกประการ เพราะ `pg` ก็ส่งทีละตัวบน connection
 * เดียวอยู่แล้ว (ตัวที่ล้มไม่ขวางตัวถัดไป เหมือนคิวของ `pg`) · callback / Submittable (ทางของ `pool.query()`
 * ซึ่งได้ connection เดี่ยวทุกครั้ง) ผ่านตรงไม่แตะ
 *
 * ไม่ import `pg` ตรง (ไม่ได้เป็น dependency ของแอป) — เข้าถึง pool ผ่าน `underlyingDriver()` ของ adapter
 */

type PgAdapter = Awaited<ReturnType<PrismaPg['connect']>>
type PgPool = ReturnType<PgAdapter['underlyingDriver']>

/** รูปขั้นต่ำของ `pg.Client#query` ที่ต้องใช้ — overload จริงของ pg หลายแบบเกินกว่าจะ override ตรง ๆ */
export interface QueryableConnection {
  query: (...args: unknown[]) => unknown
}

const SERIALIZED = Symbol.for('assetrecovery.pgSerializedQuery')

function isPassThrough(args: readonly unknown[]): boolean {
  if (typeof args[args.length - 1] === 'function') return true
  const first = args[0]
  return typeof first === 'object' && first !== null && typeof (first as { submit?: unknown }).submit === 'function'
}

/**
 * ห่อ `query()` ของ connection หนึ่งตัวให้ promise-style query รอตัวก่อนหน้า settle ก่อนส่ง — เรียกซ้ำได้ (idempotent)
 */
export function serializeConnectionQueries(connection: QueryableConnection): void {
  const marked = connection as QueryableConnection & { [SERIALIZED]?: true }
  if (marked[SERIALIZED]) return
  marked[SERIALIZED] = true

  const original = connection.query.bind(connection)
  let tail: Promise<unknown> = Promise.resolve()
  connection.query = (...args: unknown[]): unknown => {
    if (isPassThrough(args)) return original(...args)
    const run = tail.then(() => original(...args))
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function serializePool(pool: PgPool): void {
  pool.on('connect', (client) => serializeConnectionQueries(client as unknown as QueryableConnection))
}

/** `PrismaPg` ที่ทุก connection ใหม่ใน pool ถูกห่อด้วย `serializeConnectionQueries()` */
export class SerializedPrismaPg extends PrismaPg {
  override async connect(): Promise<PgAdapter> {
    const adapter = await super.connect()
    serializePool(adapter.underlyingDriver())
    return adapter
  }

  override async connectToShadowDb(): Promise<PgAdapter> {
    const adapter = await super.connectToShadowDb()
    serializePool(adapter.underlyingDriver())
    return adapter
  }
}

/** ทางเดียวที่โค้ดแอป/สคริปต์สร้าง driver adapter ของ Prisma */
export function createPgAdapter(connectionString: string): SerializedPrismaPg {
  return new SerializedPrismaPg({ connectionString })
}
