/*
  Warnings:

  - Added the required column `carModel` to the `Driver` table without a default value. This is not possible if the table is not empty.
  - Added the required column `carNameplate` to the `Driver` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ConversationStep" ADD VALUE 'AWAITING_DRIVER_CONFIRMATION';

-- AlterTable
ALTER TABLE "ConversationState" ADD COLUMN     "pendingBookingId" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "carModel" TEXT NOT NULL,
ADD COLUMN     "carNameplate" TEXT NOT NULL,
ADD COLUMN     "photo" TEXT;
