-- DropIndex
DROP INDEX "contacts_pool_robin_idx";

-- DropIndex
DROP INDEX "zalo_accounts_org_id_archived_at_idx";

-- AlterTable
ALTER TABLE "automation_triggers" ALTER COLUMN "welcome_delay_seconds" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "is_marked_unread" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "lead_notify_acks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_org_id_pooled_count_last_pooled_at_idx" ON "contacts"("org_id", "pooled_count", "last_pooled_at");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_zalo_account_id_fkey" FOREIGN KEY ("source_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "lead_pool_distributions_org_id_assigned_to_user_id_distributed_" RENAME TO "lead_pool_distributions_org_id_assigned_to_user_id_distribu_idx";
