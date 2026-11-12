-- CreateEnum
CREATE TYPE "Term" AS ENUM ('m1', 'm3', 'm6', 'm12');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('new', 'renew');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'verifying', 'failed', 'queued', 'active', 'done', 'cancelled', 'refunding', 'refunded', 'renewed');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('idle', 'assigned', 'in_use', 'expiring', 'grace', 'recycling', 'maintenance', 'fault', 'retired');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('active', 'expiring', 'grace', 'ended');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('support', 'ops', 'admin');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('refunding', 'refunded');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'processing', 'resolved', 'closed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "wechat" TEXT,
    "telegram" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "term" "Term" NOT NULL,
    "months" INTEGER NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "xianyuUrl" TEXT,
    "xianyuQrImage" TEXT,
    "dedicatedSupport" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("term")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL DEFAULT 'new',
    "renewLeaseId" TEXT,
    "term" "Term" NOT NULL,
    "months" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "priceSnapshot" JSONB NOT NULL,
    "contactWechat" TEXT,
    "contactTelegram" TEXT,
    "xianyuOrderNo" TEXT,
    "xianyuBuyerNick" TEXT,
    "xianyuSubmittedAt" TIMESTAMP(3),
    "paidCents" INTEGER,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "rackLocation" TEXT NOT NULL,
    "publicIp" TEXT NOT NULL,
    "chip" TEXT NOT NULL DEFAULT 'M4',
    "memoryGb" INTEGER NOT NULL DEFAULT 16,
    "storageGb" INTEGER NOT NULL DEFAULT 256,
    "status" "DeviceStatus" NOT NULL DEFAULT 'idle',
    "note" TEXT,
    "currentLeaseId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "graceEndAt" TIMESTAMP(3) NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseRenewal" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "prevEndAt" TIMESTAMP(3) NOT NULL,
    "newEndAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "uuDeviceCode" TEXT NOT NULL,
    "uuPasswordEnc" TEXT NOT NULL,
    "macUsername" TEXT NOT NULL,
    "macPasswordEnc" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialView" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "userId" TEXT,
    "adminId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecycleRecord" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "leaseId" TEXT,
    "wipedAndReinstalled" BOOLEAN NOT NULL DEFAULT false,
    "uuReset" BOOLEAN NOT NULL DEFAULT false,
    "passwordChanged" BOOLEAN NOT NULL DEFAULT false,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecycleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "calcDetail" JSONB NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'refunding',
    "xianyuRefundNo" TEXT,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaseId" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "recoveryCodeHashes" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PriceChangeLog" (
    "id" TEXT NOT NULL,
    "term" "Term" NOT NULL,
    "oldCents" INTEGER NOT NULL,
    "newCents" INTEGER NOT NULL,
    "adminId" TEXT NOT NULL,
    "xianyuSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Order_no_key" ON "Order"("no");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_deadlineAt_idx" ON "Order"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "Order_xianyuOrderNo_idx" ON "Order"("xianyuOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Device_code_key" ON "Device"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serial_key" ON "Device"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "Device_publicIp_key" ON "Device"("publicIp");

-- CreateIndex
CREATE UNIQUE INDEX "Device_currentLeaseId_key" ON "Device"("currentLeaseId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Lease_userId_idx" ON "Lease"("userId");

-- CreateIndex
CREATE INDEX "Lease_status_endAt_idx" ON "Lease"("status", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseRenewal_orderId_key" ON "LeaseRenewal"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_leaseId_key" ON "Credential"("leaseId");

-- CreateIndex
CREATE INDEX "CredentialView_leaseId_createdAt_idx" ON "CredentialView"("leaseId", "createdAt");

-- CreateIndex
CREATE INDEX "RecycleRecord_deviceId_idx" ON "RecycleRecord"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_no_key" ON "Ticket"("no");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "AuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_target_idx" ON "AuditLog"("target");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseRenewal" ADD CONSTRAINT "LeaseRenewal_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
