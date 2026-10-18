// บันทึก step ของ AG4: node uat/bin/r7/ag3-step.mjs '<json>'  (R7_SP/R7_PHASE=AG4)
import { step } from './_lib.mjs'
step(JSON.parse(process.argv[2]))
