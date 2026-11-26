-- 新しいフィードバックを管理者にメールで知らせたかどうか（notify-feedback が同じものを二度送らないため）
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- これまでに届いていた分は通知済みとして扱う（最初の通知で過去分がまとめて送られないように）
UPDATE public.feedback SET notified_at = created_at WHERE notified_at IS NULL;
