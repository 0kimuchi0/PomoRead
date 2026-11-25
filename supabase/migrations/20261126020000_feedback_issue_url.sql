-- フィードバックから作成した GitHub Issue の URL を記録する（管理画面で同じフィードバックから二重に作らないため）
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS issue_url TEXT;
