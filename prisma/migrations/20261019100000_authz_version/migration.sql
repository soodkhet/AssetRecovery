-- มติ D7-02 (mytester7 S7-AG7-05) — สิทธิ์/สถานะผู้ใช้ต้องมีผลกับคำขอถัดไปทุก instance โดยไม่มี window
-- session cache ต่อ instance (`lib/auth/session-cache.ts`) เทียบ "เวอร์ชันสิทธิ์" กับฐานด้วย query เดียวทุกคำขอก่อนใช้ค่าใน cache
-- เวอร์ชันเดินด้วย trigger ชั้น DB เท่านั้น — ครอบทุกทางที่เขียนข้อมูล (service/สคริปต์/seed) ไม่ต้องพึ่งให้แอปจำไปเรียกเอง

ALTER TABLE "roles" ADD COLUMN "authz_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "authz_version" INTEGER NOT NULL DEFAULT 0;

-- ── users: ฟิลด์ที่อยู่ใน session (ตัวตน/role/scope/สถานะ/อายุ session/ธงเปลี่ยนรหัส) เปลี่ยน ⇒ +1 ──
CREATE OR REPLACE FUNCTION bump_user_authz_version() RETURNS trigger AS $$
BEGIN
  IF (NEW.organization_id, NEW.role_id, NEW.supabase_uid, NEW.username, NEW.email, NEW.full_name,
      NEW.team_id, NEW.company_id, NEW.status, NEW.last_login_at, NEW.must_change_password, NEW.deleted_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.role_id, OLD.supabase_uid, OLD.username, OLD.email, OLD.full_name,
      OLD.team_id, OLD.company_id, OLD.status, OLD.last_login_at, OLD.must_change_password, OLD.deleted_at)
  THEN
    NEW.authz_version := OLD.authz_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_authz_version
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION bump_user_authz_version();

-- ── roles: ชื่อ/กลุ่ม/การลบเปลี่ยน ⇒ +1 ──
CREATE OR REPLACE FUNCTION bump_role_authz_version() RETURNS trigger AS $$
BEGIN
  IF (NEW.organization_id, NEW.name, NEW.role_group, NEW.deleted_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.name, OLD.role_group, OLD.deleted_at)
  THEN
    NEW.authz_version := OLD.authz_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roles_authz_version
  BEFORE UPDATE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION bump_role_authz_version();

-- ── role_capabilities เปลี่ยน ⇒ role +1 (มีผลกับผู้ใช้ทุกคนของ role นั้นในคำขอถัดไป) ──
CREATE OR REPLACE FUNCTION bump_role_authz_version_from_capabilities() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "roles" SET "authz_version" = "authz_version" + 1 WHERE "id" = NEW.role_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "roles" SET "authz_version" = "authz_version" + 1 WHERE "id" = OLD.role_id;
  ELSE
    UPDATE "roles" SET "authz_version" = "authz_version" + 1 WHERE "id" IN (OLD.role_id, NEW.role_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_role_capabilities_authz_version
  AFTER INSERT OR UPDATE OR DELETE ON "role_capabilities"
  FOR EACH ROW EXECUTE FUNCTION bump_role_authz_version_from_capabilities();

-- ── team_managers เปลี่ยน ⇒ ผู้จัดการคนนั้น +1 (scope ทีมที่ดูแล) ──
CREATE OR REPLACE FUNCTION bump_user_authz_version_from_team_managers() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "users" SET "authz_version" = "authz_version" + 1 WHERE "id" = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "users" SET "authz_version" = "authz_version" + 1 WHERE "id" = OLD.user_id;
  ELSE
    UPDATE "users" SET "authz_version" = "authz_version" + 1 WHERE "id" IN (OLD.user_id, NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_team_managers_authz_version
  AFTER INSERT OR UPDATE OR DELETE ON "team_managers"
  FOR EACH ROW EXECUTE FUNCTION bump_user_authz_version_from_team_managers();

-- ── teams.supervisor_id เปลี่ยน ⇒ หัวหน้าเดิม/ใหม่ +1 (scope ทีมที่คุม) ──
CREATE OR REPLACE FUNCTION bump_user_authz_version_from_team_supervisor() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.supervisor_id IS NOT NULL THEN
      UPDATE "users" SET "authz_version" = "authz_version" + 1 WHERE "id" = NEW.supervisor_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.supervisor_id IS NOT NULL THEN
      UPDATE "users" SET "authz_version" = "authz_version" + 1 WHERE "id" = OLD.supervisor_id;
    END IF;
  ELSIF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id THEN
    UPDATE "users" SET "authz_version" = "authz_version" + 1
      WHERE "id" IN (OLD.supervisor_id, NEW.supervisor_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_teams_supervisor_authz_version
  AFTER INSERT OR UPDATE OF "supervisor_id" OR DELETE ON "teams"
  FOR EACH ROW EXECUTE FUNCTION bump_user_authz_version_from_team_supervisor();
