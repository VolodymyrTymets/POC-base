-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "AccountRoleType" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('IMG', 'VIDEO');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('FILE_STATUS_CREATED', 'FILE_STATUS_UPLOAD_IN_PROGRESS', 'FILE_STATUS_UPLOAD_COMPLETED', 'FILE_STATUS_UPLOAD_FAILED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3) NOT NULL,
    "lastAccountRoleId" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRole" (
    "id" TEXT NOT NULL,
    "type" "AccountRoleType" NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccountRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOnRole" (
    "roleId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccountOnRole_pkey" PRIMARY KEY ("roleId","accountId")
);

-- CreateTable
CREATE TABLE "AccountIdentity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "hash" TEXT,
    "salt" TEXT,
    "otpHash" TEXT,
    "otpSalt" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "refreshToken" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccountIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "dataOfBirth" TEXT,
    "SSN" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "is18YearOld" BOOLEAN NOT NULL DEFAULT false,
    "avatarId" TEXT,

    CONSTRAINT "AccountProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "key" TEXT,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "status" "FileStatus" NOT NULL DEFAULT 'FILE_STATUS_CREATED',
    "createdById" TEXT NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "notificationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("notificationId","accountId")
);

-- CreateTable
CREATE TABLE "DeletedHistory" (
    "id" TEXT NOT NULL,
    "relationId" TEXT NOT NULL,
    "deletedAt" BOOLEAN NOT NULL,
    "deletedBy" TEXT,

    CONSTRAINT "DeletedHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Migration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Migration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_createdAt_idx" ON "Account"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AccountRole_type_key" ON "AccountRole"("type");

-- CreateIndex
CREATE INDEX "AccountRole_type_deleted_idx" ON "AccountRole"("type", "deleted");

-- CreateIndex
CREATE INDEX "AccountOnRole_deleted_idx" ON "AccountOnRole"("deleted");

-- CreateIndex
CREATE UNIQUE INDEX "AccountIdentity_accountId_key" ON "AccountIdentity"("accountId");

-- CreateIndex
CREATE INDEX "AccountIdentity_deleted_idx" ON "AccountIdentity"("deleted");

-- CreateIndex
CREATE UNIQUE INDEX "AccountProfile_accountId_key" ON "AccountProfile"("accountId");

-- CreateIndex
CREATE INDEX "AccountProfile_deleted_idx" ON "AccountProfile"("deleted");

-- CreateIndex
CREATE INDEX "File_createdAt_mimeType_status_idx" ON "File"("createdAt" DESC, "mimeType", "status");

-- CreateIndex
CREATE INDEX "DeletedHistory_relationId_idx" ON "DeletedHistory"("relationId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_lastAccountRoleId_fkey" FOREIGN KEY ("lastAccountRoleId") REFERENCES "AccountRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOnRole" ADD CONSTRAINT "AccountOnRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccountRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOnRole" ADD CONSTRAINT "AccountOnRole_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountIdentity" ADD CONSTRAINT "AccountIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountProfile" ADD CONSTRAINT "AccountProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountProfile" ADD CONSTRAINT "AccountProfile_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
