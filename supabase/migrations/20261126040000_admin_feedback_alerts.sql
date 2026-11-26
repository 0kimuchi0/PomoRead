-- 管理者向けのフィードバック通知
--   1. 管理画面を開いている間に届いたことが分かるよう、feedback の追加を Realtime で配信する
--      （RLS がそのまま効くので、受け取れるのは feedback を読める管理者だけ）
--   2. 管理者の iPhone にプッシュ通知を送るため、端末ごとの通知トークンを保存する

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feedback'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.push_tokens (
  token      TEXT        PRIMARY KEY CHECK (char_length(token) BETWEEN 1 AND 512),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- 自分の端末のトークンだけ見られる。追加・削除は下の関数から行う
DROP POLICY IF EXISTS "push_tokens_select_own" ON public.push_tokens;
CREATE POLICY "push_tokens_select_own" ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 端末のトークンを今ログインしている人のものとして登録する（同じ端末で別の人がログインしたら持ち主を付け替える）
CREATE OR REPLACE FUNCTION public.register_push_token(p_token TEXT, p_platform TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.push_tokens (token, user_id, platform)
  VALUES (p_token, (SELECT auth.uid()), p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now();
END;
$$;

-- ログアウトするとき、この端末のトークンを消す（自分のものだけ）
CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.register_push_token(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_push_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(TEXT) TO authenticated;
