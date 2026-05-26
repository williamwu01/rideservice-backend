-- AlterEnum
ALTER TYPE "ConversationStep" ADD VALUE 'AWAITING_PICKUP_TIME';

-- AlterTable
ALTER TABLE "ConversationState" ADD COLUMN     "pickupTime" TEXT;

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "pickupTime" TEXT;
