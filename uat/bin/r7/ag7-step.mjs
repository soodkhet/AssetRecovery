// บันทึกขั้นทดสอบ AG7 ลง <A>/steps.json — node uat/bin/r7/ag7-step.mjs '<json>' ['<json>' ...]
import { step } from './_lib.mjs'
for (const a of process.argv.slice(2)) step(JSON.parse(a))
