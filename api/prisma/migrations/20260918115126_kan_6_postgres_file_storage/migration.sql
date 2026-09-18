/*
  Warnings:

  - You are about to drop the column `key` on the `File` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "File" DROP COLUMN "key",
ADD COLUMN     "content" BYTEA;
