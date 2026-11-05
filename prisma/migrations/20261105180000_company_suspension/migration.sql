-- US #73 (story 7.1) : suspension réversible d'une entreprise ; null = active. Additif.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "suspendedAt" TIMESTAMP(3);
