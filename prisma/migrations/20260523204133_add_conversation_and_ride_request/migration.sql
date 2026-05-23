-- CreateEnum
CREATE TYPE "ConversationStep" AS ENUM ('AWAITING_NAME', 'AWAITING_PICKUP', 'AWAITING_DESTINATION', 'COMPLETE');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('PENDING', 'MATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ConversationState" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "step" "ConversationStep" NOT NULL DEFAULT 'AWAITING_NAME',
    "firstName" TEXT,
    "lastName" TEXT,
    "pickup" TEXT,
    "destination" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideRequest" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "pickup" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'PENDING',
    "driverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_phone_key" ON "ConversationState"("phone");

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
