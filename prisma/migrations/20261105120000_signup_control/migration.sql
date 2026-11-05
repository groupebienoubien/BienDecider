-- US #274 (story 6.1) : réglage global des inscriptions et compteur par jour. Additif ; sans ligne de réglage, les inscriptions restent ouvertes et sans plafond.
-- CreateTable
CREATE TABLE "SignupControl" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "open" BOOLEAN NOT NULL DEFAULT true,
    "dailyCap" INTEGER,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupDay" (
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "SignupDay_pkey" PRIMARY KEY ("day")
);
