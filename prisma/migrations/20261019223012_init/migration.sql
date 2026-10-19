-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "balanceCents" BIGINT NOT NULL DEFAULT 10000000,
    "lastBonusAt" TIMESTAMP(3),
    "referralCode" TEXT,
    "referredById" TEXT,
    "referredAt" TIMESTAMP(3),
    "signupIp" TEXT,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "bonusStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "rebirths" INTEGER NOT NULL DEFAULT 0,
    "unlimitedBets" BOOLEAN NOT NULL DEFAULT false,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "lifetimeWageredCents" BIGINT NOT NULL DEFAULT 0,
    "lifetimeWonCents" BIGINT NOT NULL DEFAULT 0,
    "biggestWinCents" BIGINT NOT NULL DEFAULT 0,
    "bestMultiplierX100" INTEGER NOT NULL DEFAULT 0,
    "careerDays" INTEGER NOT NULL DEFAULT 0,
    "careerStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "betsThisLife" INTEGER NOT NULL DEFAULT 0,
    "venueId" TEXT NOT NULL DEFAULT 'back-room',
    "comebacksUsed" INTEGER NOT NULL DEFAULT 0,
    "deathCause" TEXT,
    "diedAt" TIMESTAMP(3),
    "livesLived" INTEGER NOT NULL DEFAULT 0,
    "peakBalanceCents" BIGINT NOT NULL DEFAULT 10000000,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "visitedVenuesJson" TEXT NOT NULL DEFAULT '["back-room"]',
    "eventsToday" INTEGER NOT NULL DEFAULT 0,
    "eventDayKey" TEXT NOT NULL DEFAULT '',
    "adminRole" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetUsername" TEXT,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minBetCentsOverride" BIGINT,
    "maxBetCentsOverride" BIGINT,
    "disabledNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "SiteFlag" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SiteFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "targetId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "grantCents" BIGINT NOT NULL DEFAULT 0,
    "grantXp" INTEGER NOT NULL DEFAULT 0,
    "maxRedemptions" INTEGER NOT NULL DEFAULT 0,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "bets" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "wageredCents" BIGINT NOT NULL DEFAULT 0,
    "wonCents" BIGINT NOT NULL DEFAULT 0,
    "biggestWinCents" BIGINT NOT NULL DEFAULT 0,
    "bestMultiplierX100" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "seenJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "choiceKey" TEXT,
    "outcomeText" TEXT,
    "stakeCents" BIGINT NOT NULL DEFAULT 0,
    "netCents" BIGINT NOT NULL DEFAULT 0,
    "reputationDelta" INTEGER NOT NULL DEFAULT 0,
    "daysDelta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LifeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Life" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "cause" TEXT NOT NULL,
    "ageAtEnd" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "rebirths" INTEGER NOT NULL,
    "venueId" TEXT NOT NULL,
    "epitaph" TEXT NOT NULL,
    "peakBalanceCents" BIGINT NOT NULL,
    "lifetimeWageredCents" BIGINT NOT NULL,
    "biggestWinCents" BIGINT NOT NULL,
    "betsPlaced" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Life_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "betCents" BIGINT NOT NULL,
    "payoutCents" BIGINT NOT NULL,
    "netCents" BIGINT NOT NULL,
    "outcome" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "balanceAfterCents" BIGINT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "betCents" BIGINT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Strike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportsBet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stakeCents" BIGINT NOT NULL,
    "priceDecimal" DOUBLE PRECISION NOT NULL,
    "payoutCents" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "SportsBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportsBetLeg" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "leagueTitle" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "commenceTime" TIMESTAMP(3) NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "point" DOUBLE PRECISION,
    "priceDecimal" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "SportsBetLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsCache" (
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OddsCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashRound" (
    "id" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "crashPoint" DOUBLE PRECISION NOT NULL,
    "crashAt" TIMESTAMP(3) NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashBet" (
    "id" TEXT NOT NULL,
    "roundId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "betCents" BIGINT NOT NULL,
    "autoTarget" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cashedAt" DOUBLE PRECISION,
    "payoutCents" BIGINT NOT NULL DEFAULT 0,
    "progressJson" TEXT,
    "progressSeen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashBet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_adminRole_idx" ON "User"("adminRole");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE INDEX "User_signupIp_idx" ON "User"("signupIp");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "Announcement_active_targetId_idx" ON "Announcement"("active", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_codeId_userId_key" ON "PromoRedemption"("codeId", "userId");

-- CreateIndex
CREATE INDEX "GameStat_userId_idx" ON "GameStat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameStat_userId_game_key" ON "GameStat"("userId", "game");

-- CreateIndex
CREATE INDEX "AchievementUnlock_userId_idx" ON "AchievementUnlock"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementUnlock_userId_key_key" ON "AchievementUnlock"("userId", "key");

-- CreateIndex
CREATE INDEX "ChallengeProgress_userId_periodKey_idx" ON "ChallengeProgress"("userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeProgress_userId_key_period_periodKey_key" ON "ChallengeProgress"("userId", "key", "period", "periodKey");

-- CreateIndex
CREATE INDEX "LifeEvent_userId_status_idx" ON "LifeEvent"("userId", "status");

-- CreateIndex
CREATE INDEX "Life_userId_ordinal_idx" ON "Life"("userId", "ordinal");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_kind_createdAt_idx" ON "Transaction"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Round_userId_status_idx" ON "Round"("userId", "status");

-- CreateIndex
CREATE INDEX "Strike_userId_createdAt_idx" ON "Strike"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SportsBet_userId_status_idx" ON "SportsBet"("userId", "status");

-- CreateIndex
CREATE INDEX "SportsBet_status_idx" ON "SportsBet"("status");

-- CreateIndex
CREATE INDEX "SportsBetLeg_betId_idx" ON "SportsBetLeg"("betId");

-- CreateIndex
CREATE INDEX "SportsBetLeg_status_sportKey_idx" ON "SportsBetLeg"("status", "sportKey");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "CrashBet_userId_createdAt_idx" ON "CrashBet"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrashBet_roundId_userId_key" ON "CrashBet"("roundId", "userId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameStat" ADD CONSTRAINT "GameStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementUnlock" ADD CONSTRAINT "AchievementUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgress" ADD CONSTRAINT "ChallengeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Life" ADD CONSTRAINT "Life_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strike" ADD CONSTRAINT "Strike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsBet" ADD CONSTRAINT "SportsBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsBetLeg" ADD CONSTRAINT "SportsBetLeg_betId_fkey" FOREIGN KEY ("betId") REFERENCES "SportsBet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CrashRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
