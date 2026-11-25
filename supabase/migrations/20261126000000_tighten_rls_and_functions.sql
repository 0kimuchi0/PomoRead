-- Supabase Advisors の警告への対応
--  1. 一般ユーザーが自分の profiles.role / banned を書き換えられた問題を修正（管理者のみ更新可）
--  2. 重複していたポリシー（ダッシュボードで作られたものと migration のもの）を 1 操作 1 ポリシーに統合
--  3. auth.uid() / get_my_role() を (select ...) で包み、行ごとの再評価を防ぐ
--  4. SECURITY DEFINER 関数の実行権限を必要なロールだけに絞る

-- ============================================================
-- 既存ポリシーをすべて削除
-- ============================================================
DROP POLICY IF EXISTS "admin_actions_admin_only"    ON public.admin_actions;
DROP POLICY IF EXISTS "admins manage admin_actions" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_admin"         ON public.admin_actions;

DROP POLICY IF EXISTS "admin read all books" ON public.books;
DROP POLICY IF EXISTS "own books"            ON public.books;
DROP POLICY IF EXISTS "books_select"         ON public.books;
DROP POLICY IF EXISTS "books_insert"         ON public.books;
DROP POLICY IF EXISTS "books_update"         ON public.books;
DROP POLICY IF EXISTS "books_delete"         ON public.books;

DROP POLICY IF EXISTS "admin read all sessions" ON public.sessions;
DROP POLICY IF EXISTS "own sessions"            ON public.sessions;
DROP POLICY IF EXISTS "sessions_select"         ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert"         ON public.sessions;
DROP POLICY IF EXISTS "sessions_update"         ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete"         ON public.sessions;

DROP POLICY IF EXISTS "admin read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin update profiles"   ON public.profiles;
DROP POLICY IF EXISTS "own profile"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"     ON public.profiles;

DROP POLICY IF EXISTS "feedback_admin_read"   ON public.feedback;
DROP POLICY IF EXISTS "feedback_admin_update" ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert"       ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert_anon"  ON public.feedback;

DROP POLICY IF EXISTS "suggest_books_admin_write" ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_read"        ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_user_insert" ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_write"       ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_select"      ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_insert"      ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_update_admin" ON public.suggest_books;
DROP POLICY IF EXISTS "suggest_books_delete_admin" ON public.suggest_books;

-- ============================================================
-- admin_actions: 管理者のみ
-- ============================================================
CREATE POLICY "admin_actions_admin" ON public.admin_actions
  FOR ALL TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin')
  WITH CHECK ((SELECT public.get_my_role()) = 'admin');

-- ============================================================
-- books: 本人は全操作 / 管理者は読み取りのみ
-- ============================================================
CREATE POLICY "books_select" ON public.books
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.get_my_role()) = 'admin');

CREATE POLICY "books_insert" ON public.books
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "books_update" ON public.books
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "books_delete" ON public.books
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- sessions: 本人は全操作 / 管理者は読み取りのみ
-- ============================================================
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.get_my_role()) = 'admin');

CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "sessions_update" ON public.sessions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "sessions_delete" ON public.sessions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- profiles: 本人と管理者は読み取り可 / 更新は管理者のみ
-- （作成は handle_new_user、削除は delete_user_account が行う）
-- ============================================================
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.get_my_role()) = 'admin');

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin')
  WITH CHECK ((SELECT public.get_my_role()) = 'admin');

-- ============================================================
-- feedback: 誰でも送信可 / 読み取り・更新は管理者のみ
-- ============================================================
CREATE POLICY "feedback_insert" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "feedback_insert_anon" ON public.feedback
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "feedback_admin_read" ON public.feedback
  FOR SELECT TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin');

CREATE POLICY "feedback_admin_update" ON public.feedback
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin')
  WITH CHECK ((SELECT public.get_my_role()) = 'admin');

-- ============================================================
-- suggest_books: ログインユーザーは読み取り・追加可 / 更新・削除は管理者のみ
-- ============================================================
CREATE POLICY "suggest_books_select" ON public.suggest_books
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "suggest_books_insert" ON public.suggest_books
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "suggest_books_update_admin" ON public.suggest_books
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin')
  WITH CHECK ((SELECT public.get_my_role()) = 'admin');

CREATE POLICY "suggest_books_delete_admin" ON public.suggest_books
  FOR DELETE TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin');

-- ============================================================
-- SECURITY DEFINER 関数
-- ============================================================
-- handle_new_user / rls_auto_enable はダッシュボードで作成されたため、存在する場合のみ処理する
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    -- 本文はすべてスキーマ修飾済みなので、search_path を空に固定する
    ALTER FUNCTION public.handle_new_user() SET search_path = '';
    -- トリガー専用。API から直接呼ばせない
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    -- イベントトリガー専用。API から直接呼ばせない
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

-- ログインユーザーだけが呼べる（アカウント削除 / RLS での管理者判定）
REVOKE EXECUTE ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role()         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_role()         TO authenticated;
