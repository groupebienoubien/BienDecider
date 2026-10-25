-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "facebookPageCandidateUrl" TEXT,
ADD COLUMN     "facebookPageDeclinedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "facebookPageUrl" TEXT;
