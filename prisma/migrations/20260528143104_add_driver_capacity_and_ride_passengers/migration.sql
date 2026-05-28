-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConversationStep" ADD VALUE 'AWAITING_PASSENGERS';
ALTER TYPE "ConversationStep" ADD VALUE 'AWAITING_LUGGAGE';

-- AlterTable
ALTER TABLE "ConversationState" ADD COLUMN     "luggage" INTEGER,
ADD COLUMN     "passengers" INTEGER;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxLuggage" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxPassengers" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "luggage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passengers" INTEGER NOT NULL DEFAULT 1;
