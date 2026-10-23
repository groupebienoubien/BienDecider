-- Story 3.1 : prénom et nom du dirigeant, facultatif (migration additive).
ALTER TABLE "Company" ADD COLUMN "ownerName" TEXT;
