-- US #301 (story 13.2) : ouverture des canaux et acces par entreprise tant que les fournisseurs n'ont pas approuve l'application. Additif ; sans ligne, un canal est ouvert a tous. Retour arriere : supprimer les deux tables.
-- CreateTable
CREATE TABLE "ChannelRollout" (
    "channel" TEXT NOT NULL,
    "openToAll" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelRollout_pkey" PRIMARY KEY ("channel")
);

-- CreateTable
CREATE TABLE "ChannelAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3),
    "grantedAt" TIMESTAMP(3),
    "grantedBy" TEXT,

    CONSTRAINT "ChannelAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAccess_companyId_channel_key" ON "ChannelAccess"("companyId", "channel");

-- AddForeignKey
ALTER TABLE "ChannelAccess" ADD CONSTRAINT "ChannelAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


