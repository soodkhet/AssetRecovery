// บันทึก step ของ AG3: node uat/bin/r7/ag3-step.mjs '<json>'  (R7_SP/R7_PHASE=AG3)
import { step } from './_lib.mjs'
step(JSON.parse(process.argv[2]))
