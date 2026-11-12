-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "heartbeatTokenHash" TEXT;

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "endedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketNote" ADD COLUMN     "fromUser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "internal" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "adminId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ReminderLog" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Consult" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "quantity" INTEGER,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consult_status_createdAt_idx" ON "Consult"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_heartbeatTokenHash_key" ON "Device"("heartbeatTokenHash");

-- CreateIndex
CREATE INDEX "TicketNote_ticketId_idx" ON "TicketNote"("ticketId");

