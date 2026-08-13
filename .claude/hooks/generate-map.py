#!/usr/bin/env python3
# regenerate docs/00_MAP.md — รันที่ root ของ repo: python3 .claude/hooks/generate-map.py
# สแกน docs/*.md (>=15KB) + reference/*.html ทุกไฟล์ แล้วเขียนทับ docs/00_MAP.md
import os, re, glob, sys

ROOT = os.getcwd()
DOCS = os.path.join(ROOT, 'docs')
REF = os.path.join(ROOT, 'reference')
OUT = os.path.join(DOCS, '00_MAP.md')

out = []
out.append("""# 00_MAP.md — แผนที่ช่วงบรรทัดของไฟล์ใหญ่ (สำหรับ Read(offset, limit))

> **วิธีใช้**: ก่อนอ่านไฟล์ใหญ่ ให้เปิดไฟล์นี้หาบรรทัดเริ่มของ section ที่ต้องการ แล้ว `Read(file, offset=<บรรทัดเริ่ม>, limit=<ช่วงที่ต้องการ>)` — **ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์**
> ช่วงจบของแต่ละ section = บรรทัดเริ่มของ section ถัดไป − 1
> ⚠️ **ถ้ามีการแก้ไฟล์ spec/mockup จนบรรทัดเลื่อน ต้อง regenerate MAP นี้ใหม่** (สคริปต์อยู่ท้ายไฟล์)
> ครอบคลุม: ไฟล์ `.md` ใน docs/ ที่ ≥ 15KB ทุกไฟล์ + mockup `.html` ใน reference/ ทุกไฟล์

---

## ส่วนที่ 1 — Spec files (docs/)
""")

for f in sorted(glob.glob(os.path.join(DOCS, '*.md'))):
    name = os.path.basename(f)
    if name in ('00_MAP.md',):
        continue
    size = os.path.getsize(f)
    if size < 15000:
        continue
    lines = open(f, encoding='utf-8').read().split('\n')
    out.append(f"\n### `docs/{name}` ({size//1024} KB, {len(lines)} บรรทัด)\n")
    out.append("| บรรทัด | หัวข้อ |")
    out.append("|---|---|")
    n = 0
    for i, ln in enumerate(lines, 1):
        if re.match(r'^#{1,3}\s+\S', ln):
            t = ln.strip().replace('|', '\\|')
            if len(t) > 90: t = t[:87] + '...'
            out.append(f"| {i} | {t} |")
            n += 1
    if n == 0:
        out.append("| - | (ไม่มี heading) |")

out.append("""

---

## ส่วนที่ 2 — UI Mockups (reference/)

> mockup เป็น UI source of truth (โครงหน้าจอ/Tailwind pattern/ข้อมูลตัวอย่าง) — **ห้ามอ้าง business logic จาก mockup** ให้ยึด spec `.md` เสมอ
> ตารางนี้ชี้บรรทัดของ JavaScript function หลักในแต่ละไฟล์ — ใช้ Grep หา render function ที่ต้องการก่อน แล้ว Read เฉพาะช่วง
""")

for f in sorted(glob.glob(os.path.join(REF, '*.html'))):
    name = os.path.basename(f)
    size = os.path.getsize(f)
    lines = open(f, encoding='utf-8').read().split('\n')
    out.append(f"\n### `reference/{name}` ({size//1024} KB, {len(lines)} บรรทัด)\n")
    rows = []
    for i, ln in enumerate(lines, 1):
        m = re.search(r'^\s*(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\(|function|async))', ln)
        if m:
            rows.append((i, m.group(1) or m.group(2)))
    if rows:
        out.append("| บรรทัด | function |")
        out.append("|---|---|")
        for i, fn in rows:
            out.append(f"| {i} | `{fn}` |")
    else:
        out.append("(ไม่มี JS function — ไฟล์ HTML/CSS ล้วน)")

out.append("""

---

## สคริปต์ regenerate MAP

```bash
# รันที่ root ของ repo หลังแก้ไฟล์ spec/mockup ใดๆ
python3 .claude/hooks/generate-map.py
```
""")

open(OUT, 'w', encoding='utf-8').write('\n'.join(out))
print(f"wrote {OUT} ({len(chr(10).join(out))} chars)")
