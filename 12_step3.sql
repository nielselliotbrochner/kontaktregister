-- Trin 3: modenhed (forslag + manuel overstyring) og intel på virksomhed eller kontakt
alter table company add column if not exists stage_override boolean not null default false;

create table if not exists intel (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references company(id) on delete cascade,
  contact_id uuid references contact(id) on delete cascade,
  intel_date date not null default current_date,
  title text not null,
  source_url text,
  note text,
  file_name text,
  file_path text,
  file_size bigint,
  file_mime text,
  intel_text text,
  owner_id uuid not null default auth.uid() references app_user(id),
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now(),
  check (num_nonnulls(company_id, contact_id) = 1)
);
create index if not exists intel_owner_idx on intel(owner_id);
create index if not exists intel_company_idx on intel(company_id);
create index if not exists intel_contact_idx on intel(contact_id);
alter table intel enable row level security;
create policy owner on intel for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger intel_lm before update on intel for each row execute function set_last_modified();
