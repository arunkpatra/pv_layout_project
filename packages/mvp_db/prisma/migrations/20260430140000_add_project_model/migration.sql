-- CreateTable
CREATE TABLE "projects" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "kmzBlobUrl" TEXT NOT NULL,
    "kmzSha256"  TEXT NOT NULL,
    "edits"      JSONB NOT NULL DEFAULT '{}',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    "deletedAt"  TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "projects_userId_idx" ON "projects"("userId");

-- CreateIndex
CREATE INDEX "projects_deletedAt_idx" ON "projects"("deletedAt");
