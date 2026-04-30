-- CreateTable
CREATE TABLE "runs" (
    "id"                  TEXT NOT NULL,
    "projectId"           TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "params"              JSONB NOT NULL,
    "inputsSnapshot"      JSONB NOT NULL,
    "layoutResultBlobUrl" TEXT,
    "energyResultBlobUrl" TEXT,
    "exportsBlobUrls"     JSONB NOT NULL DEFAULT '[]',
    "billedFeatureKey"    TEXT NOT NULL,
    "usageRecordId"       TEXT NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"           TIMESTAMP(3),

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "runs_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "runs_usageRecordId_fkey"
      FOREIGN KEY ("usageRecordId") REFERENCES "usage_records"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "runs_usageRecordId_key" ON "runs"("usageRecordId");

-- CreateIndex
CREATE INDEX "runs_projectId_idx" ON "runs"("projectId");

-- CreateIndex
CREATE INDEX "runs_deletedAt_idx" ON "runs"("deletedAt");
