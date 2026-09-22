-- Coaching Notebook — lesson days + AI-maintained student README
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Lesson days (0 = Sunday ... 6 = Saturday, same numbering as JS Date.getDay())
-- ---------------------------------------------------------------------------
alter table students
  add column if not exists lesson_days smallint[] not null default '{}';

alter table students drop constraint if exists students_lesson_days_valid;
alter table students
  add constraint students_lesson_days_valid
  check (lesson_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

-- ---------------------------------------------------------------------------
-- Student README: a living markdown profile the AI reads instead of the full
-- log history.
--   profile_md            the README text (AI-maintained, coach-editable)
--   profile_updated_at    bumped by the trigger below on every change to
--                         profile_md; the Edge Function uses it as a
--                         compare-and-swap guard so it never overwrites a
--                         hand edit made while it was thinking
--   profile_logs_through  created_at of the newest session log already folded
--                         into the README; logs created after this are "new"
-- ---------------------------------------------------------------------------
alter table students
  add column if not exists profile_md text,
  add column if not exists profile_updated_at timestamptz,
  add column if not exists profile_logs_through timestamptz;

-- ---------------------------------------------------------------------------
-- student_profile_versions: every README that gets replaced is archived here,
-- so a bad AI rewrite (or a bad hand edit) can always be rolled back.
-- ---------------------------------------------------------------------------
create table if not exists student_profile_versions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  content text not null,
  saved_at timestamptz not null
);

create index if not exists student_profile_versions_student_idx
  on student_profile_versions (student_id, saved_at desc);

alter table student_profile_versions enable row level security;

drop policy if exists "authenticated users can do everything on student_profile_versions"
  on student_profile_versions;
create policy "authenticated users can do everything on student_profile_versions"
  on student_profile_versions
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create or replace function students_archive_profile()
returns trigger
language plpgsql
as $$
begin
  if new.profile_md is distinct from old.profile_md then
    if old.profile_md is not null and btrim(old.profile_md) <> '' then
      insert into student_profile_versions (student_id, content, saved_at)
      values (old.id, old.profile_md, coalesce(old.profile_updated_at, now()));
    end if;
    new.profile_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists students_archive_profile on students;
create trigger students_archive_profile
  before update of profile_md on students
  for each row
  execute function students_archive_profile();
