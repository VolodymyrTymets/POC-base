/*
  Warnings:

  - A unique constraint covering the columns `[resetTokenHash]` on the table `AccountIdentity` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `AccountProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AccountIdentity" ADD COLUMN     "resetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AccountIdentity_resetTokenHash_key" ON "AccountIdentity"("resetTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AccountProfile_email_key" ON "AccountProfile"("email");
