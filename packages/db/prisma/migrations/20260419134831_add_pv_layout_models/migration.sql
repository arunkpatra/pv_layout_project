-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versions" (
    "id" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'QUEUED',
    "kmzS3Key" TEXT,
    "inputSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_jobs" (
    "id" TEXT NOT NULL DEFAULT '',
    "versionId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "kmzArtifactS3Key" TEXT,
    "svgArtifactS3Key" TEXT,
    "dxfArtifactS3Key" TEXT,
    "statsJson" JSONB,
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "layout_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_jobs" (
    "id" TEXT NOT NULL DEFAULT '',
    "versionId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "pdfArtifactS3Key" TEXT,
    "statsJson" JSONB,
    "irradianceSource" TEXT,
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "energy_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versions_projectId_number_key" ON "versions"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "layout_jobs_versionId_key" ON "layout_jobs"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "energy_jobs_versionId_key" ON "energy_jobs"("versionId");

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_jobs" ADD CONSTRAINT "layout_jobs_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_jobs" ADD CONSTRAINT "energy_jobs_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
