// บันทึกขั้นทดสอบ AG1 ลง <A>/steps.json — node uat/bin/r7/ag1-step.mjs '<json>' ['<json>' ...]
import { step } from './_lib.mjs'
for (const a of process.argv.slice(2)) step(JSON.parse(a))
