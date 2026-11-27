# PomoRead

読書に特化したポモドーロタイマーアプリです。集中セッションを記録しながら、読書の習慣をサポートします。

## 機能

- **ポモドーロタイマー** — 25 分集中 + 休憩のサイクルで読書を管理
- **本棚管理** — 読んでいる本・読了済みの本を登録・管理
- **統計** — セッション数・集中時間・読了冊数をグラフで可視化
- **デバイス同期** — ログインすることで複数デバイス間でデータを同期
- **テーマ** — ライト / ダーク / システム設定に対応
- **管理者パネル** — ユーザー管理・BAN・ロール変更・操作履歴（管理者のみ）

## 不具合の報告・要望

GitHub の Issue から受け付けています（フォームに沿って入力できます）。

- [不具合を報告する](https://github.com/daiki0828/PomoRead/issues/new?template=1-bug.yml)
- [機能を要望する](https://github.com/daiki0828/PomoRead/issues/new?template=2-feature.yml)
- [調査・質問を立てる](https://github.com/daiki0828/PomoRead/issues/new?template=3-investigation.yml)
- [Issue 一覧](https://github.com/daiki0828/PomoRead/issues)

アプリの使い方についての質問は、support@pomoread.com までメールでお問い合わせください。

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フロントエンド | React 18 + TypeScript |
| ビルドツール | Vite |
| バックエンド / DB | Supabase (PostgreSQL + RLS) |
| 認証 | Supabase Auth（メール・Google OAuth） |
| グラフ | Recharts |
| アイコン | Tabler Icons |

## セットアップ

### 必要なもの

- Node.js 18+
- Supabase アカウント

### 1. リポジトリのクローン

```bash
git clone https://github.com/daiki0828/PomoRead.git
cd PomoRead
npm install
```

### 2. Supabase の設定

[Supabase](https://supabase.com) でプロジェクトを作成し、以下の SQL を実行してテーブルを作成します。

```sql
-- profiles
create table profiles (
  id uuid references auth.users primary key,
  email text not null default '',
  role text not null default 'user',
  banned boolean not null default false,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for select using (auth.uid() = id);

-- books
create table books (
  id text primary key,
  user_id uuid references auth.users not null,
  title text not null,
  author text not null,
  publisher text not null default '',
  genre text not null default '',
  total_pages int not null default 0,
  current_page int not null default 0,
  sessions int not null default 0,
  status text not null default 'reading',
  created_at timestamptz default now(),
  isbn text not null default '',
  c_code text not null default '',
  catalog_number text not null default '',
  ndc text not null default ''
);
alter table books enable row level security;
create policy "own books" on books for all using (auth.uid() = user_id);

-- sessions
create table sessions (
  id text primary key,
  user_id uuid references auth.users not null,
  book_id text not null,
  book_title text not null default '',
  date text not null,
  duration int not null
);
alter table sessions enable row level security;
create policy "own sessions" on sessions for all using (auth.uid() = user_id);

-- admin_actions
create table admin_actions (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references auth.users not null,
  target_user_id uuid references auth.users not null,
  action_type text not null,
  previous_value text not null,
  new_value text not null,
  reason text not null,
  created_at timestamptz default now()
);
alter table admin_actions enable row level security;

-- ロール取得用関数（RLS で使用）
create or replace function public.get_my_role()
returns text language sql security definer
as $$ select role from profiles where id = auth.uid() $$;

create policy "admins manage admin_actions" on admin_actions
  for all using (public.get_my_role() = 'admin');

create policy "admins read all profiles" on profiles
  for select using (public.get_my_role() = 'admin');

create policy "admins update profiles" on profiles
  for update using (public.get_my_role() = 'admin');
```

ユーザー登録時に profiles レコードを自動作成するトリガーも設定します。

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

### 3. 環境変数の設定

プロジェクトルートに `.env.local` を作成します。

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Supabase Dashboard → Project Settings → API から取得できます。

### 4. 起動

```bash
npm run dev
```

`http://localhost:5173` でアプリが起動します。

## ビルド

```bash
npm run build
```

`dist/` フォルダに成果物が出力されます。

## ライセンス

MIT
