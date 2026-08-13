# 95-diagrams.md

# 95 — Diagrams (System Architecture / ER / Use Case / Workflow)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Format: Mermaid — render ได้บน GitHub, Notion, GitLab, และ Cursor
> เอกสารอ้างอิง: `01-architecture.md`, `02-database-schema-design.md`, `26-finance-data-model.md`, `06-menu-and-navigation-map.md`, `07-roles-permissions.md`, `00-project-overview.md`, `92-platform-data-model.md`, `94-decision-log.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | 02/07/2569 | สร้างไฟล์ครั้งแรก — System Architecture, ER Diagram, Use Case Diagram ×5, Main Workflow Diagram |
| v2 | 03/07/2569 | Reformat header ตามมาตรฐานเอกสารชุดใหม่ + เพิ่ม Decisions/Open Items — **Diagram ทั้ง 4 ตัวคงไว้ครบทุกบรรทัด ไม่มีการแก้ไข** (ตรวจสอบแล้วว่า Main Workflow §4 สอดคล้องกับ Warehouse gate ที่บันทึกไว้ใน `92-platform-data-model.md` §6.1 อยู่แล้ว) |

ขอบเขตเอกสารนี้: Diagram รวมของทั้งระบบ 4 ประเภท — System Architecture, ER Diagram, Use Case Diagram (5 module), Main Workflow (Business Flow ภาพรวม) — เป็น visual reference กลางที่ไฟล์อื่นชี้มาที่นี่แทนการวาดซ้ำ

**ไม่รวมอยู่ในไฟล์นี้**: Sequence diagram ระดับ use-case ย่อยของแต่ละ feature (อยู่กระจายในไฟล์ที่เกี่ยวข้อง เช่น `05-auth-and-access-control.md` §6.1, `91-platform-api-integration-jobs.md` §6.2), field เต็มของแต่ละ entity (ดู `02-database-schema-design.md`)

---

## 1. System Architecture Diagram

ภาพรวมโครงสร้างระบบ AssetRecovery ตาม Tech Stack ที่ตัดสินใจแล้ว (DEC-001 ถึง DEC-004)

```mermaid
graph TB
    subgraph USERS["👥 ผู้ใช้งาน"]
        U1["🏢 Back Office\n(Finance / Accounting / Admin)"]
        U2["📱 Field Agent\n(Mobile / Desktop)"]
        U3["🏦 Company User\n(บริษัทไฟแนนซ์)"]
    end

    subgraph FRONTEND["🖥️ Frontend — Next.js App Router + TypeScript (Vercel)"]
        FE1["Back Office Web App\n/finance /accounting /settings /warehouse"]
        FE2["Field Tracker\n/field (mobile-first)"]
        FE3["Company Portal\n/portal"]
    end

    subgraph API["⚙️ API Layer — Next.js API Routes / Server Actions"]
        MW1["Auth Middleware\n(Supabase JWT verify)"]
        MW2["Permission Middleware\n(Role + Scope check)"]
        subgraph MODULES["Business Modules"]
            M1["Settings Module\n(ไฟล์ 08-13)"]
            M2["Case Module\n(ไฟล์ 38-41)"]
            M3["Finance Module\n(ไฟล์ 15-21)"]
            M4["Accounting Module\n(ไฟล์ 30-37)"]
            M5["Warehouse Module\n(ไฟล์ 44)"]
        end
        SVC1["Audit Service\n(ทุก mutation)"]
        SVC2["Export Service\n(PDF / CSV / Bank File)"]
        SVC3["Notification Service\n(เฟส 2)"]
    end

    subgraph DATA["🗄️ Data Layer — Supabase (PostgreSQL + Storage + Auth)"]
        DB[("PostgreSQL\n(Prisma ORM)\n\nIdentity & Access\nMaster Data\nCase Workflow\nFinance Operation\nAccounting Handover\nPlatform Logs")]
        STORAGE["Supabase Storage\n\nรูปถ่ายหลักฐาน\nใบกำกับภาษี PDF\nใบส่งมอบ\nเอกสาร WHT\nExport Pack"]
        AUTH["Supabase Auth\nJWT + Session"]
    end

    subgraph JOBS["⏱️ Background Jobs — Vercel Cron / QStash"]
        J1["Export Pack Job\n(Accounting)"]
        J2["Bank File Job\n(Payout)"]
        J3["WHT Summary Job\n(รายเดือน)"]
        J4["Reassign Timeout Job\n(Field)"]
    end

    subgraph EXT["🔗 External Services"]
        EX1["Google Maps API\n(Distance Matrix)"]
        EX2["Email / SMS Gateway\n(เฟส 2)"]
        EX3["e-Tax / e-WHT\nกรมสรรพากร (เฟส 2)"]
        EX4["Bank\n(ไฟล์โอนเงิน)"]
    end

    U1 --> FE1
    U2 --> FE2
    U3 --> FE3

    FE1 & FE2 & FE3 --> MW1
    MW1 --> MW2
    MW2 --> MODULES

    MODULES --> SVC1
    MODULES --> SVC2
    MODULES --> DB
    SVC2 --> STORAGE
    MW1 --> AUTH

    JOBS --> DB
    JOBS --> STORAGE
    JOBS --> EXT

    M2 --> EX1
    SVC3 --> EX2
    SVC2 --> EX3
    SVC2 --> EX4

    style USERS fill:#f0f9ff,stroke:#0ea5e9
    style FRONTEND fill:#f5f3ff,stroke:#7c3aed
    style API fill:#fef9c3,stroke:#ca8a04
    style DATA fill:#f0fdf4,stroke:#16a34a
    style JOBS fill:#fff7ed,stroke:#ea580c
    style EXT fill:#fdf2f8,stroke:#a21caf
```

---

## 2. ER Diagram (Entity Relationship)

แสดงความสัมพันธ์หลักของ entities ทั้งระบบ (อ้างอิงไฟล์ 02, 26, 44)

```mermaid
erDiagram
    %% ══════════════════════════════════════
    %% MASTER DATA
    %% ══════════════════════════════════════
    Organization ||--o{ FinanceCompany : "คู่ค้า"
    Organization ||--o{ Team : "ทีมติดตาม"
    Organization ||--o{ User : "ผู้ใช้งาน"

    FinanceCompany ||--o{ ServiceFeeTemplate : "กติกาค่าบริการ"
    FinanceCompany ||--o{ CompanyUser : "บัญชีไฟแนนซ์"
    FinanceCompany ||--o{ Case : "ส่งเคส"

    Team ||--|| CompensationPlan : "ผูกแผนค่าตอบแทน"
    Team ||--o{ TeamMember : "สมาชิก"
    User ||--o{ TeamMember : ""

    %% ══════════════════════════════════════
    %% CASE WORKFLOW
    %% ══════════════════════════════════════
    Case ||--o{ CaseAssignment : "มอบหมาย"
    Case ||--|| CaseOutcome : "ผลการติดตาม"
    Case ||--o{ Evidence : "หลักฐาน"
    Case ||--o{ CheckIn : "เช็คอิน"
    CaseAssignment }o--|| User : "Field Agent"

    %% ══════════════════════════════════════
    %% WAREHOUSE (ไฟล์ 44)
    %% ══════════════════════════════════════
    Case ||--o| Asset : "ทรัพย์ที่ยึดได้"
    Asset }o--o| HandoverLot : "ล็อตส่งมอบ"
    HandoverLot }o--|| FinanceCompany : "ส่งคืน"

    %% ══════════════════════════════════════
    %% FINANCE OPERATION
    %% ══════════════════════════════════════
    Case ||--o{ Expense : "รายการเบิก"
    Case ||--o| Revenue : "รายได้"

    Expense }o--|| PayeeProfile : "ผู้รับเงิน"
    Expense }o--o| PayoutBatchItem : ""
    PayoutBatchItem }o--|| PayoutBatch : "รอบจ่ายเงิน"

    Revenue }o--o| BillingBatch : "รอบวางบิล"
    BillingBatch }o--|| FinanceCompany : ""

    PayeeProfile }o--|| TaxProfile : "กติกาภาษี"
    PayeeProfile ||--|| User : ""

    Case ||--o{ Advance : "เงินทดรอง"
    Advance }o--|| PayeeProfile : ""

    %% ══════════════════════════════════════
    %% ACCOUNTING HANDOVER
    %% ══════════════════════════════════════
    AccountingPeriod ||--o{ SalesRecord : "รายได้บัญชี"
    AccountingPeriod ||--o{ ExpenseRecord : "ค่าใช้จ่ายบัญชี"
    AccountingPeriod ||--o{ BankTransaction : "รายการธนาคาร"
    AccountingPeriod ||--o{ WHTCertificate : "ใบ 50 ทวิ"
    AccountingPeriod ||--o{ Exception : "ข้อยกเว้น"
    AccountingPeriod ||--o{ AccountantQuestion : "คำถาม"
    AccountingPeriod ||--o{ ExportRecord : "ประวัติ Export"

    SalesRecord ||--o{ TaxInvoice : "ใบกำกับภาษี"
    BillingBatch ||--|| SalesRecord : ""
    BankTransaction }o--o| BillingBatch : "จับคู่"
    BankTransaction }o--o| PayoutBatch : "จับคู่"

    ExpenseRecord ||--o{ WHTCertificate : ""

    %% ══════════════════════════════════════
    %% ADJUSTMENT (polymorphic)
    %% ══════════════════════════════════════
    Adjustment }o--o| Revenue : "ปรับปรุง"
    Adjustment }o--o| Expense : "ปรับปรุง"
    Adjustment }o--o| BillingBatch : "ปรับปรุง"
    Adjustment }o--o| PayoutBatch : "ปรับปรุง"

    %% ══════════════════════════════════════
    %% PLATFORM
    %% ══════════════════════════════════════
    AuditLog }o--|| User : "actor"
```

---

## 3. Use Case Diagram

แสดงความสัมพันธ์ระหว่าง Actor และ Use Case หลักของแต่ละ module

### 3.1 งานติดตามทรัพย์ (Case Workflow)

```mermaid
graph LR
    subgraph ACTORS_CASE["Actors"]
        AC1(["🏦 บริษัทไฟแนนซ์\n(Company User)"])
        AC2(["👤 เจ้าหน้าที่\nอนุมัติเคส"])
        AC3(["👔 ผู้จัดการทีม\n/ หัวหน้า"])
        AC4(["🧑 Field Agent"])
    end

    subgraph UC_CASE["Use Cases — งานติดตามทรัพย์"]
        UC1["ยื่นเคสใหม่"]
        UC2["ติดตามสถานะเคส"]
        UC3["รับ / ปฏิเสธเคส"]
        UC4["มอบหมายงานให้ Agent"]
        UC5["เปลี่ยนผู้รับผิดชอบ"]
        UC6["รับงาน / จัดวันลงพื้นที่"]
        UC7["เช็คอินและบันทึกหลักฐาน"]
        UC8["ปิดงาน (สำเร็จ / ไม่สำเร็จ)"]
        UC9["ตีกลับหลักฐาน (QC)"]
        UC10["เบิกค่าใช้จ่าย"]
    end

    AC1 --> UC1
    AC1 --> UC2
    AC2 --> UC3
    AC2 --> UC9
    AC3 --> UC4
    AC3 --> UC5
    AC4 --> UC6
    AC4 --> UC7
    AC4 --> UC8
    AC4 --> UC10
```

### 3.2 คลังสินค้า (Warehouse)

```mermaid
graph LR
    subgraph ACTORS_WH["Actors"]
        AW1(["🗂️ ธุรการ / Admin"])
        AW2(["🏦 บริษัทไฟแนนซ์"])
    end

    subgraph UC_WH["Use Cases — คลังสินค้า (ไฟล์ 44)"]
        UW1["รับเครื่องเข้าคลัง\n(ตรวจ IMEI + สภาพ + รูป)"]
        UW2["ตีกลับ IMEI ไม่ตรง"]
        UW3["สร้าง Lot นัดส่งมอบ"]
        UW4["ออกใบส่งมอบ PDF"]
        UW5["แนบเอกสารยืนยัน\nและปิด Lot"]
        UW6["ดูสถานะทรัพย์\n(ของบริษัทตัวเอง)"]
    end

    AW1 --> UW1
    AW1 --> UW2
    AW1 --> UW3
    AW1 --> UW4
    AW1 --> UW5
    AW2 --> UW6
```

### 3.3 การเงิน (Finance)

```mermaid
graph LR
    subgraph ACTORS_FIN["Actors"]
        AF1(["💼 การเงิน\n(Finance)"])
        AF2(["👔 ผู้จัดการทีม"])
        AF3(["👔 Executive"])
        AF4(["🧑 Field Agent"])
    end

    subgraph UC_FIN["Use Cases — การเงิน (ไฟล์ 15-21)"]
        UF1["อนุมัติ / ตีกลับ Claim"]
        UF2["อนุมัติเงินทดรองจ่าย"]
        UF3["สร้างรอบจ่ายเงิน (Payout)"]
        UF4["ตรวจสอบ Payee Profile"]
        UF5["วางบิลรายได้\n(Billing Batch)"]
        UF6["บันทึกเงินรับ"]
        UF7["สร้าง Adjustment"]
        UF8["อนุมัติ Adjustment\n(locked period)"]
        UF9["ดูรายงานกำไร"]
    end

    AF2 --> UF1
    AF1 --> UF1
    AF1 --> UF2
    AF1 --> UF3
    AF1 --> UF4
    AF1 --> UF5
    AF1 --> UF6
    AF1 --> UF7
    AF3 --> UF8
    AF1 --> UF9
    AF4 --> UF2
```

### 3.4 บัญชี (Accounting)

```mermaid
graph LR
    subgraph ACTORS_ACC["Actors"]
        AA1(["📊 บัญชี\n(Accounting)"])
        AA2(["👔 Executive"])
        AA3(["🏢 สำนักงานบัญชี"])
    end

    subgraph UC_ACC["Use Cases — บัญชี (ไฟล์ 30-37)"]
        UA1["ตรวจความพร้อมปิดรอบ\n(Readiness Check)"]
        UA2["ออกใบกำกับภาษี"]
        UA3["กระทบยอดธนาคาร\n(Reconcile)"]
        UA4["จัดการ WHT Certificate"]
        UA5["แก้ไข Exception"]
        UA6["Export Accounting Pack"]
        UA7["ส่งมอบให้สำนักงานบัญชี"]
        UA8["ล็อกงวดบัญชี"]
        UA9["ตอบข้อซักถาม"]
        UA10["อนุมัติ Authorized Exception"]
    end

    AA1 --> UA1
    AA1 --> UA2
    AA1 --> UA3
    AA1 --> UA4
    AA1 --> UA5
    AA1 --> UA6
    AA1 --> UA7
    AA1 --> UA9
    AA2 --> UA8
    AA2 --> UA10
    AA3 --> UA9
```

### 3.5 ตั้งค่า (Settings)

```mermaid
graph LR
    subgraph ACTORS_SET["Actors"]
        AS1(["🔑 Superadmin"])
        AS2(["💼 การเงิน / บัญชี"])
    end

    subgraph UC_SET["Use Cases — ตั้งค่า (ไฟล์ 08-13)"]
        US1["จัดการผู้ใช้งาน"]
        US2["จัดการทีมติดตามทรัพย์"]
        US3["จัดการบริษัทไฟแนนซ์"]
        US4["ตั้งค่าแผนค่าตอบแทน"]
        US5["ตั้งค่า Service Fee Template"]
        US6["ตั้งค่าบัญชี / การเงิน\n(รอบบิล / WHT / VAT)"]
        US7["จัดการ Payee Profile"]
        US8["ตั้งค่าข้อมูลองค์กร"]
    end

    AS1 --> US1
    AS1 --> US2
    AS1 --> US3
    AS1 --> US4
    AS1 --> US5
    AS1 --> US8
    AS2 --> US6
    AS2 --> US7
```

---

## 4. Main Workflow Diagram (Business Flow ภาพรวม)

```mermaid
flowchart TD
    START(["บริษัทไฟแนนซ์\nส่งเคสเข้าระบบ"])

    subgraph CASE["งานติดตามทรัพย์"]
        C1["เจ้าหน้าที่รับ/ปฏิเสธเคส"]
        C2["ผู้จัดการมอบหมาย\nให้ Field Agent"]
        C3["Agent ลงพื้นที่\nเช็คอิน + หลักฐาน"]
        C4{"ผล?"}
        C5["closed_success\n(ได้เครื่องคืน)"]
        C6["closed_fail\n(ไม่สำเร็จ)"]
    end

    subgraph WH["คลังสินค้า"]
        W1["รับเครื่องเข้าคลัง\nตรวจ IMEI + สภาพ"]
        W2["สร้าง Lot + ออกใบส่งมอบ"]
        W3["ส่งมอบเครื่องคืน\nบริษัทไฟแนนซ์"]
        W4["ยืนยัน Lot confirmed"]
    end

    subgraph FIN["การเงิน"]
        F1["Expense สร้างอัตโนมัติ\n(pending_warehouse_confirm)"]
        F2["Expense ปลดล็อก\n→ pending_approval"]
        F3["อนุมัติค่าตอบแทน"]
        F4["สร้างรอบจ่ายเงิน\n(Payout Batch)"]
        F5["Revenue เกิด\n(ready_for_billing)"]
        F6["วางบิลบริษัทไฟแนนซ์\n(Billing Batch)"]
        F7["รับเงิน → Cash Receipt"]
    end

    subgraph ACC["บัญชี (รายเดือน)"]
        A1["ตรวจความพร้อม\nReadiness Check"]
        A2["Export Accounting Pack\n(01-08 files)"]
        A3["ส่งสำนักงานบัญชี"]
        A4["Executive ล็อกงวด"]
    end

    START --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4
    C4 --> C5
    C4 --> C6

    C5 --> W1
    W1 --> W2
    W2 --> W3
    W3 --> W4

    C5 --> F1
    W4 --> F2
    C6 --> F2

    F2 --> F3
    F3 --> F4
    F4 --> F5
    W4 --> F5
    F5 --> F6
    F6 --> F7

    F4 & F7 --> A1
    A1 --> A2
    A2 --> A3
    A3 --> A4

    style CASE fill:#eff6ff,stroke:#3b82f6
    style WH fill:#f5f3ff,stroke:#7c3aed
    style FIN fill:#f0fdf4,stroke:#16a34a
    style ACC fill:#fff7ed,stroke:#ea580c
```

---

## 5. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Diagram ทั้งหมดในไฟล์นี้สร้างจาก Mermaid** — แก้ไขได้โดยตรงในไฟล์นี้ ไม่ต้องใช้เครื่องมือวาดภาพภายนอก
- **System Architecture Diagram สะท้อน DEC-001~004 ครบ** (Next.js/Prisma/Supabase/Vercel, Permission middleware ไม่ใช่ RLS, Supabase Storage, Background Jobs)
- **Main Workflow Diagram (§4) ยืนยันแล้วว่าสอดคล้องกับ Warehouse gate**: Revenue (F5) เกิดจาก Lot confirmed (W4) เป็นหลัก ไม่ใช่จาก Case close (C5) ตรงๆ — ตรงกับที่บันทึกไว้ใน `92-platform-data-model.md` §6.1
- **ไฟล์นี้เป็น single source of truth ของ diagram ระดับระบบ** — ไฟล์อื่นที่ต้องการ diagram ระดับนี้ให้ลิงก์มาที่นี่แทนการวาดซ้ำ (ยกเว้น sequence diagram ระดับ use-case ย่อยที่อยู่ในไฟล์นั้นๆ เอง)

## 6. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] **ไฟล์นี้ต้องอัปเดตทุกครั้งที่มีการเปลี่ยน Entity, Role, หรือ Flow สำคัญ** (หมายเหตุเดิม) — ยังไม่มี process อัตโนมัติตรวจว่า diagram sync กับ schema จริงหรือไม่ ต้องอาศัยวินัย manual update
- [x] ~~Company Portal (`/portal`) ใน System Architecture Diagram มาร์คเป็น "เฟส 2"~~ ✅ **แก้แล้ว 04/07/2569** — Product Owner ยืนยัน Client Portal deploy เป็นส่วนหนึ่งของ Phase 1 (`97-client-portal.md` v4) — ลบ label "เฟส 2" ออกจาก diagram (§1) แล้ว
- [ ] Notification Service ใน System Architecture Diagram มาร์คเป็น "เฟส 2" — ต้อง sync กับการตัดสินใจ Notification channel ที่ยังค้างอยู่ (ดู `90-platform-audit-notification-reporting.md` §18)

---

*เอกสารนี้เป็นไฟล์สุดท้ายในหมวด Platform (90–95) และเป็นไฟล์สุดท้ายของ Batch 1 (Foundation & Platform) — Batch 1 เสร็จสมบูรณ์ครบ 13/13 ไฟล์*
