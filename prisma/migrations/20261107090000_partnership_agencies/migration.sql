-- Partenariats (#316) : e-mail professionnel et secteur des agences, envoi tracé par destinataire.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "email" TEXT,
ADD COLUMN     "sector" TEXT;

-- CreateTable
CREATE TABLE "PublicationRecipient" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicationRecipient_leadId_idx" ON "PublicationRecipient"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationRecipient_publicationId_email_key" ON "PublicationRecipient"("publicationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_companyId_email_key" ON "Lead"("companyId", "email");

-- AddForeignKey
ALTER TABLE "PublicationRecipient" ADD CONSTRAINT "PublicationRecipient_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRecipient" ADD CONSTRAINT "PublicationRecipient_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
