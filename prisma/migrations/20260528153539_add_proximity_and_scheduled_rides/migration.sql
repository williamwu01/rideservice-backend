-- AlterEnum
ALTER TYPE "RideStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "scheduledPickupAt" TIMESTAMP(3);
