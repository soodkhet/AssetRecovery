// AG3 — statement ธนาคาร (KBank xlsx) เงินเข้าจากลูกค้า 18/10/2569 : R7_SP=<SP> node uat/bin/r7/ag3-mkstmt.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const X = require('/Users/beer/AssetRecovery/node_modules/xlsx')
const F = `${process.env.R7_SP}/AG3/files/`
const H = ['วันที่', 'รายละเอียด', 'เลขที่อ้างอิง', 'เงินเข้า', 'เงินออก']
const w = X.utils.book_new()
X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([H,
  ['18/10/2569', 'รับโอน บจก. มือถือทันใจ ลีสซิ่ง (MT6) ชำระ BL-2569-008 หัก ณ ที่จ่าย 3%', 'KB25691018710101', 3432.00, null],
  ['18/10/2569', 'รับโอน บจก. เค ที พี โฟนลีส (MT7) ชำระ BL-2569-005 หัก ณ ที่จ่าย 1.5%', 'KB25691018720202', 1578.06, null],
  ['18/10/2569', 'รับโอน บจก. เงินด่วนโฟน (MT6) ชำระบางส่วน BL-2569-006 งวดแรก', 'KB25691018730303', 1000.00, null],
  ['18/10/2569', 'รับโอน บจก. เงินด่วนโฟน (MT6) ชำระคงเหลือ BL-2569-006 หัก ณ ที่จ่าย 3%', 'KB25691018740404', 516.26, null],
]), 'ข้อมูล')
X.writeFile(w, F + 'kbank-stmt-MT7-1018.xlsx')
console.log('ok', F + 'kbank-stmt-MT7-1018.xlsx')
