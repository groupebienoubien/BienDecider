-- Story 5.5 : photos du site d'une page, stockées sur Vercel Blob (migration additive).
CREATE TABLE "SitePhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SitePhoto_companyId_idx" ON "SitePhoto"("companyId");

ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
