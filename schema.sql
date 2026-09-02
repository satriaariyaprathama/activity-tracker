-- Run this once in your Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time text,
  end_time text,
  name text not null,
  category text,
  status text default 'Planned',
  priority text default 'Medium',
  project text,
  notes text,
  calendar_event_id text,
  created_at timestamptz default now()
);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_date_idx on public.tasks (date);

-- Row Level Security: every user can only ever see/change their own rows.
alter table public.tasks enable row level security;

create policy "select own tasks" on public.tasks
  for select using (auth.uid() = user_id);

create policy "insert own tasks" on public.tasks
  for insert with check (auth.uid() = user_id);

create policy "update own tasks" on public.tasks
  for update using (auth.uid() = user_id);

create policy "delete own tasks" on public.tasks
  for delete using (auth.uid() = user_id);

-- Enable realtime so changes on one device show up on another automatically.
alter publication supabase_realtime add table public.tasks;
