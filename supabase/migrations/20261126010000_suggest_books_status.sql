-- サジェストに承認状態と登録者を持たせる（Issue #80）
--   approved: 全ユーザーの入力候補に表示（管理者が追加したもの / 既存のもの）
--   pending : ユーザーの本棚登録から自動で追加されたもの。登録した本人と管理者だけが見られる
--   hidden  : 管理者だけが見られる（だれの候補にも出さない）

ALTER TABLE public.suggest_books
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suggest_books_status_check') THEN
    ALTER TABLE public.suggest_books
      ADD CONSTRAINT suggest_books_status_check CHECK (status IN ('approved', 'pending', 'hidden'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS suggest_books_status_idx ON public.suggest_books (status);
CREATE INDEX IF NOT EXISTS suggest_books_created_by_idx ON public.suggest_books (created_by);

-- 追加時の状態と登録者は、送られてきた値ではなくサーバー側で決める
CREATE OR REPLACE FUNCTION public.suggest_books_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.created_by := auth.uid();
  IF public.get_my_role() = 'admin' THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.suggest_books_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS suggest_books_before_insert ON public.suggest_books;
CREATE TRIGGER suggest_books_before_insert
  BEFORE INSERT ON public.suggest_books
  FOR EACH ROW EXECUTE FUNCTION public.suggest_books_before_insert();

-- 読み取り: 公開中のもの、自分が登録した承認待ちのもの、管理者はすべて
DROP POLICY IF EXISTS "suggest_books_select" ON public.suggest_books;
CREATE POLICY "suggest_books_select" ON public.suggest_books
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR (status = 'pending' AND created_by = (SELECT auth.uid()))
    OR (SELECT public.get_my_role()) = 'admin'
  );
