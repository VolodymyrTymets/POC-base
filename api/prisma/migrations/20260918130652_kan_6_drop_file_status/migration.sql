/*
  Warnings:

  - You are about to drop the column `status` on the `File` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "File_createdAt_mimeType_status_idx";

-- AlterTable
ALTER TABLE "File" DROP COLUMN "status";

-- DropEnum
DROP TYPE "FileStatus";

-- CreateIndex
CREATE INDEX "File_createdAt_mimeType_idx" ON "File"("createdAt" DESC, "mimeType");
