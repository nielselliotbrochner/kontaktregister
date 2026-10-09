-- Trin 5: grupper af associerede virksomheder (navn valgfrit)
create table if not exists group_role (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);
alter table group_role enable row level security;
create policy read_all on group_role for select using (true);
create policy owner_write on group_role for all using (is_owner()) with check (is_owner());
create trigger group_role_lm before update on group_role for each row execute function set_last_modified();
insert into group_role (code, name, sort_order, is_system) values
  ('member', 'Medlem', 1, true), ('parent', 'Moderselskab', 2, true), ('subsidiary', 'Datterselskab', 3, true),
  ('sister', 'Søsterselskab', 4, true), ('jv', 'Joint venture', 5, true), ('unknown', 'Ukendt', 6, true)
on conflict (code) do nothing;

create table if not exists company_group (
  id uuid primary key default gen_random_uuid(),
  name text,
  note text,
  owner_id uuid not null default auth.uid() references app_user(id),
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);
create index if not exists company_group_owner_idx on company_group(owner_id);
alter table company_group enable row level security;
create policy owner on company_group for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger company_group_lm before update on company_group for each row execute function set_last_modified();

create table if not exists company_group_member (
  group_id uuid not null references company_group(id) on delete cascade,
  company_id uuid not null references company(id) on delete cascade,
  role_id uuid references group_role(id),
  note text,
  primary key (group_id, company_id)
);
create index if not exists cgm_company_idx on company_group_member(company_id);
create index if not exists cgm_role_idx on company_group_member(role_id);
alter table company_group_member enable row level security;
create policy via_group on company_group_member for all to authenticated
  using (exists (select 1 from company_group g where g.id = group_id and g.owner_id = (select auth.uid())))
  with check (exists (select 1 from company_group g where g.id = group_id and g.owner_id = (select auth.uid())));
