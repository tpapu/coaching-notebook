-- Coaching Notebook — initial schema
-- Single-user app: every table gets Row Level Security enabled, with a single
-- permissive policy that allows any authenticated user full access. This app
-- is meant to be deployed with exactly one Supabase auth user (the coach), so we
-- don't need per-row ownership checks — just "must be logged in".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  skill_level text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table students enable row level security;

create policy "authenticated users can do everything on students"
  on students
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- session_logs
-- ---------------------------------------------------------------------------
create table if not exists session_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session_date timestamptz not null,
  content text not null,
  tags text[],
  created_at timestamptz not null default now()
);

create index if not exists session_logs_student_date_idx
  on session_logs (student_id, session_date desc);

alter table session_logs enable row level security;

create policy "authenticated users can do everything on session_logs"
  on session_logs
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create index if not exists conversations_student_idx
  on conversations (student_id, created_at desc);

alter table conversations enable row level security;

create policy "authenticated users can do everything on conversations"
  on conversations
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on chat_messages (conversation_id, created_at);

alter table chat_messages enable row level security;

create policy "authenticated users can do everything on chat_messages"
  on chat_messages
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- coaching_insights
-- ---------------------------------------------------------------------------
create table if not exists coaching_insights (
  id uuid primary key default gen_random_uuid(),
  skill_tag text not null,
  problem text not null,
  fix text not null,
  source_student_id uuid references students(id) on delete set null,
  source_log_id uuid references session_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  last_confirmed_at timestamptz
);

create index if not exists coaching_insights_skill_tag_idx
  on coaching_insights (skill_tag);

alter table coaching_insights enable row level security;

create policy "authenticated users can do everything on coaching_insights"
  on coaching_insights
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- lesson_plans
-- ---------------------------------------------------------------------------
create table if not exists lesson_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  generated_at timestamptz not null default now(),
  content text not null,
  used boolean not null default false
);

create index if not exists lesson_plans_student_idx
  on lesson_plans (student_id, generated_at desc);

alter table lesson_plans enable row level security;

create policy "authenticated users can do everything on lesson_plans"
  on lesson_plans
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
