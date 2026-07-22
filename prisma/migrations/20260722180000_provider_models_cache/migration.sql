-- AlterTable
ALTER TABLE "AIProviderConfig" ADD COLUMN "modelsCacheJson" TEXT;
ALTER TABLE "AIProviderConfig" ADD COLUMN "modelsFetchedAt" TIMESTAMP(3);
