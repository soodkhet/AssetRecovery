import { describeFuelRule } from '@/lib/compensation/plan'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * กล่อง "ค่าใช้จ่ายของทีม" (`38` §7.4) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * ⚠️ กติกาที่สเปคล็อกไว้: กล่องนี้ **แสดงข้อมูลดิบเท่านั้น** — ค่าที่ตั้งไว้ของ Compensation Plan
 * ที่ผูกกับทีมนั้น (ไฟล์ 11) · **ห้ามคำนวณหรือสรุปกำไร/ขาดทุนใดๆ ทั้งในข้อมูลและใน UI**
 * เพราะต้นทุนจริงต่อเคส (ค่าน้ำมันตามระยะทางจริง) รู้ไม่ได้จนกว่าจะลงพื้นที่
 * ⇒ ไฟล์นี้ **ไม่มีการคูณ/บวกยอดเงินใดๆ** มีแต่การจัดรูปแบบค่าที่ตั้งไว้ให้อ่านง่าย
 *
 * สูตรคำนวณเงินจริงอยู่ `22` §6.1–6.4 (pure module ของ Phase 3.1) ไม่ใช่ที่นี่
 */

/** ค่าตั้งของแผนค่าตอบแทนที่ผูกกับทีม — ชุดย่อยของ `compensation_plans` เท่าที่กล่องนี้ใช้ */
export interface TeamCostSnapshot {
  planId: string
  planName: string
  planVersion: number
  fuelMode: 'PER_KM' | 'DAILY_FLAT'
  fuelRatePerKmSatang: number | null
  fuelMaxPerCaseSatang: number | null
  fuelDailyFlatSatang: number | null
  allowanceSatang: number
  hotelMaxPerNightSatang: number | null
  commissionSatang: number
  noSuccessFeeSatang: number
}

/** แถวหนึ่งในกล่องค่าใช้จ่าย — `text` พร้อมแสดงบนหน้าจอ (แปลงสตางค์→บาทด้วย util กลางแล้ว) */
export interface TeamCostRow {
  key: 'fuel' | 'allowance' | 'hotel' | 'commission' | 'no_success_fee'
  label: string
  text: string
  /** หมายเหตุสั้นใต้ค่า (เช่น เพดานต่อเคส) — ไม่มีก็ `null` */
  note: string | null
}

const NOT_SET = 'ไม่กำหนด'

/**
 * ค่าตั้งของทีม → แถวสำหรับกล่องค่าใช้จ่าย (`38` §7.4 หัวข้อย่อย 4 กลุ่ม)
 * ลำดับแถวคงที่: ค่าน้ำมัน → เบี้ยเลี้ยง → ค่าที่พัก → คอมมิชชั่น → เบี้ยเสี่ยง
 */
export function describeTeamCost(cost: TeamCostSnapshot): TeamCostRow[] {
  const fuel = describeFuelRule(cost)

  const fuelRow: TeamCostRow =
    fuel.mode === 'PER_KM'
      ? {
          key: 'fuel',
          label: 'ค่าน้ำมัน (ตามระยะทาง)',
          text: `${fmtSatangSymbol(fuel.ratePerKmSatang)}/กม.`,
          note:
            fuel.maxPerCaseSatang === null
              ? 'ไม่จำกัดเพดานต่อเคส'
              : `เพดาน ${fmtSatangSymbol(fuel.maxPerCaseSatang)}/เคส`,
        }
      : {
          key: 'fuel',
          label: 'ค่าน้ำมัน (เหมาจ่ายรายวัน)',
          text: `${fmtSatangSymbol(fuel.dailyFlatSatang)}/วัน`,
          note: null,
        }

  return [
    fuelRow,
    {
      key: 'allowance',
      label: 'เบี้ยเลี้ยง',
      text: `${fmtSatangSymbol(cost.allowanceSatang)}/วัน`,
      note: null,
    },
    {
      key: 'hotel',
      label: 'ค่าที่พัก',
      text:
        cost.hotelMaxPerNightSatang === null
          ? NOT_SET
          : `${fmtSatangSymbol(cost.hotelMaxPerNightSatang)}/คืน`,
      note: null,
    },
    {
      key: 'commission',
      label: 'คอมมิชชั่น',
      text: fmtSatangSymbol(cost.commissionSatang),
      note: 'จ่ายเมื่อติดตามสำเร็จ',
    },
    {
      key: 'no_success_fee',
      label: 'เบี้ยเสี่ยง/ค่าออกพื้นที่',
      text: fmtSatangSymbol(cost.noSuccessFeeSatang),
      note: 'จ่ายเมื่อติดตามไม่สำเร็จ',
    },
  ]
}
