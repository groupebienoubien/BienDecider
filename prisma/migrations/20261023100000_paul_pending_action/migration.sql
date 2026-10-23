-- AlterTable : le rythme de nouveaux clients devient décimal, les valeurs existantes sont conservées.
ALTER TABLE "Company" ALTER COLUMN "newClientsPerMonth" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PaulPendingAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatMessageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaulPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaulPendingAction_companyId_status_idx" ON "PaulPendingAction"("companyId", "status");

-- CreateIndex
CREATE INDEX "PaulPendingAction_chatMessageId_idx" ON "PaulPendingAction"("chatMessageId");

-- AddForeignKey
ALTER TABLE "PaulPendingAction" ADD CONSTRAINT "PaulPendingAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaulPendingAction" ADD CONSTRAINT "PaulPendingAction_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
