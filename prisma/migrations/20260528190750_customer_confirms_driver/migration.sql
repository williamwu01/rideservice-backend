-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "proposedDriverId" TEXT,
ADD COLUMN     "triedDriverIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
