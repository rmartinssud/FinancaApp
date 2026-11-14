-- Fase 8: Educação financeira (artigos, vídeos, materiais, cursos, progresso) e papel de plataforma no usuário
-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'REGISTERED', 'VIP');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "edu_authors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "photoKey" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_contents" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT,
    "videoId" TEXT,
    "coverKey" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "categoryId" TEXT,
    "authorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_courses" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "coverKey" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "categoryId" TEXT,
    "authorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_course_lessons" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "edu_course_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_materials" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "title" TEXT,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_progress" (
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_progress_pkey" PRIMARY KEY ("userId","contentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "edu_authors_photoKey_key" ON "edu_authors"("photoKey");

-- CreateIndex
CREATE UNIQUE INDEX "edu_authors_userId_key" ON "edu_authors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_categories_name_key" ON "edu_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "edu_categories_slug_key" ON "edu_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "edu_contents_slug_key" ON "edu_contents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "edu_contents_coverKey_key" ON "edu_contents"("coverKey");

-- CreateIndex
CREATE INDEX "edu_contents_status_publishedAt_idx" ON "edu_contents"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "edu_contents_categoryId_idx" ON "edu_contents"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_courses_slug_key" ON "edu_courses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "edu_courses_coverKey_key" ON "edu_courses"("coverKey");

-- CreateIndex
CREATE INDEX "edu_courses_status_publishedAt_idx" ON "edu_courses"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "edu_course_lessons_contentId_idx" ON "edu_course_lessons"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_course_lessons_courseId_contentId_key" ON "edu_course_lessons"("courseId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_materials_storageKey_key" ON "edu_materials"("storageKey");

-- CreateIndex
CREATE INDEX "edu_materials_contentId_idx" ON "edu_materials"("contentId");

-- CreateIndex
CREATE INDEX "edu_progress_contentId_idx" ON "edu_progress"("contentId");

-- AddForeignKey
ALTER TABLE "edu_authors" ADD CONSTRAINT "edu_authors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_contents" ADD CONSTRAINT "edu_contents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "edu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_contents" ADD CONSTRAINT "edu_contents_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "edu_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_contents" ADD CONSTRAINT "edu_contents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_courses" ADD CONSTRAINT "edu_courses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "edu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_courses" ADD CONSTRAINT "edu_courses_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "edu_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_courses" ADD CONSTRAINT "edu_courses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_course_lessons" ADD CONSTRAINT "edu_course_lessons_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "edu_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_course_lessons" ADD CONSTRAINT "edu_course_lessons_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "edu_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_materials" ADD CONSTRAINT "edu_materials_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "edu_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_progress" ADD CONSTRAINT "edu_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_progress" ADD CONSTRAINT "edu_progress_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "edu_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

