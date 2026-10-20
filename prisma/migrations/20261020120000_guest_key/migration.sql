-- AlterTable
ALTER TABLE "User" ADD COLUMN     "guestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_guestKey_key" ON "User"("guestKey");
