-- Performance Optimization Indexes (Stage 1)
-- Added to resolve sequential scans identified in pg_stat_user_tables audit:
-- 1. conversations: 50K+ seq scans -> add contact_id and (org_id, external_thread_id)
-- 2. messages: 1.3K seq scans reading 138M rows -> add replied_by_user_id
-- 3. appointments: 94K seq scans -> add contact_id, assigned_user_id, (org_id, status, appointment_date)
-- 4. friends: add (org_id, zalo_uid_in_nick) for chat-routes un-indexed lookup

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_contact_id_idx" ON "conversations"("contact_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_org_id_external_thread_id_idx" ON "conversations"("org_id", "external_thread_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_replied_by_user_id_idx" ON "messages"("replied_by_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_contact_id_idx" ON "appointments"("contact_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_assigned_user_id_idx" ON "appointments"("assigned_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_org_id_status_appointment_date_idx" ON "appointments"("org_id", "status", "appointment_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "friends_org_id_zalo_uid_in_nick_idx" ON "friends"("org_id", "zalo_uid_in_nick");
