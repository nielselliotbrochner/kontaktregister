-- Trin 2: rammeaftaler og nye projektfelter
-- Trin 2: rammeaftaler (framework), nye projektfelter, opslag
do $$
declare t text;
begin
  foreach t in array array['project_type', 'construction_type', 'award_type', 'our_role'] loop
    execute format($f$create table %I (
      id uuid primary key default gen_random_uuid(),
      code text unique,
      name text not null,
      sort_order integer not null default 0,
      active boolean not null default true,
      is_system boolean not null default false,
      created_at timestamptz not null default now(),
      last_modified timestamptz not null default now())$f$, t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to authenticated using (true)', t);
    execute format('create policy owner_write on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
    execute format('create trigger %I before update on %I for each row execute function set_last_modified()', t || '_lm', t);
  end loop;
end $$;

insert into project_type (code, name, sort_order, is_system) values
  ('advisory', 'Rådgivning', 1, true), ('total_advisory', 'Totalrådgivning', 2, true), ('project_management', 'Projektledelse', 3, true);
insert into construction_type (code, name, sort_order, is_system) values
  ('new_build', 'Nybyg', 1, true), ('renovation', 'Renovering', 2, true), ('extension', 'Tilbyg', 3, true),
  ('conversion', 'Ombygning', 4, true), ('listed', 'Fredet bygning', 5, true);
insert into award_type (code, name, sort_order, is_system) values
  ('direct_award', 'Direkte tildeling', 1, true), ('mini_tender', 'Miniudbud', 2, true);
insert into our_role (code, name, sort_order, is_system) values
  ('total_consultant', 'Totalrådgiver', 1, true), ('lead_consultant', 'Hovedrådgiver', 2, true), ('sub_consultant', 'Underrådgiver', 3, true);

create table framework (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source_id uuid references project_source(id),
  company_id uuid references company(id) on delete set null,
  stage_id uuid not null references project_stage(id),
  value numeric(10, 1),
  own_value numeric(10, 1),
  start_date date,
  end_date date,
  extension_note text,
  extension_end_date date,
  own_share numeric(5, 2),
  share_note text,
  weighting numeric(5, 2),
  responsible_id uuid references employee(id) on delete set null,
  owner_id uuid not null default auth.uid() references app_user(id),
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index on framework(owner_id);
create index on framework(company_id);
create index on framework(stage_id);
create index on framework(source_id);
create index on framework(responsible_id);
alter table framework enable row level security;
create policy owner on framework for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger framework_lm before update on framework for each row execute function set_last_modified();

alter table project
  add column project_type_id uuid references project_type(id),
  add column construction_type_id uuid references construction_type(id),
  add column our_role_id uuid references our_role(id),
  add column award_type_id uuid references award_type(id),
  add column framework_id uuid references framework(id) on delete set null,
  add column area numeric(10, 0),
  add column probability numeric(5, 2),
  add column pq_date date,
  add column tender_date date,
  add column project_start date,
  add column project_end date,
  add column construction_start date,
  add column construction_end date,
  add column description text,
  add column address2 text,
  add column district text,
  add column region text,
  add column country text not null default 'Danmark',
  add column tender_responsible_id uuid references employee(id) on delete set null,
  add column pq_responsible_id uuid references employee(id) on delete set null;
create index on project(project_type_id);
create index on project(construction_type_id);
create index on project(our_role_id);
create index on project(award_type_id);
create index on project(framework_id);
create index on project(tender_responsible_id);
create index on project(pq_responsible_id);

alter table roles add column framework_id uuid references framework(id) on delete cascade;
create index on roles(framework_id);
alter table roles drop constraint roles_project_id_check;
alter table roles add constraint roles_one_parent check (num_nonnulls(project_id, framework_id) = 1);

-- Dummydata til rammeaftaler
-- Dummydata til trin 2 (opfundet)
insert into framework (id, name, description, source_id, company_id, stage_id, value, own_value, start_date, end_date, extension_note, own_share, share_note, weighting, responsible_id, owner_id)
select gen_random_uuid(), x.name, x.descr, (select id from project_source where code = 'andet'), (select id from company where name = x.firm),
  (select id from project_stage where code = x.stage), x.val, x.own, x.sd::date, x.ed::date, x.ext, x.share, x.snote, x.w,
  (select id from employee order by created_at limit 1), (select id from app_user limit 1)
from (values
  ('Rammeaftale rådgivning Kystbyen', 'Rådgivning på mindre byggeprojekter i kommunen.', 'Kystbyen Kommune', 'vundet', 400, 24.0, '2025-01-01', '2027-04-30', '1+1 år', 33, 'Tre vindere. Antager lige deling.', null::numeric),
  ('Bygherrerådgivning Aldersro', 'Rammeaftale om bygherrerådgivning på pleje og skole.', 'Aldersro Kommune', 'tilbud', 600, 30.0, '2027-01-01', '2031-01-01', '2 år, 1+1', 25, 'Fire vindere forventes.', 40),
  ('PQ Brohus Invest partnere', 'Preferred supplier-aftale på logistikhaller.', 'Brohus Invest', 'pq', 250, 12.0, '2027-03-01', '2029-03-01', null, 50, null, null)
) as x(name, descr, firm, stage, val, own, sd, ed, ext, share, snote, w);

update project p set framework_id = (select id from framework where name = 'Rammeaftale rådgivning Kystbyen'), award_type_id = (select id from award_type where code = 'mini_tender')
where p.id in (select r.project_id from roles r join company c on c.id = r.company_id where c.name = 'Kystbyen Kommune' limit 2);
update project p set framework_id = (select id from framework where name = 'Rammeaftale rådgivning Kystbyen'), award_type_id = (select id from award_type where code = 'direct_award')
where p.id in (select r.project_id from roles r join company c on c.id = r.company_id where c.name = 'Kystbyen Kommune' and r.project_id not in (select id from project where framework_id is not null) limit 1);

update project set project_type_id = (select id from project_type where code = 'advisory'), construction_type_id = (select id from construction_type where code = 'new_build'),
  our_role_id = (select id from our_role where code = 'lead_consultant'), area = 4500
where stage_id in (select id from project_stage where code in ('pq', 'tilbud', 'vundet'));
update project set pq_date = '2026-10-10' where id = (select p.id from project p join project_stage s on s.id = p.stage_id where s.code = 'pq' order by p.created_at limit 1);
update project set tender_date = '2026-10-12' where id = (select p.id from project p join project_stage s on s.id = p.stage_id where s.code = 'tilbud' order by p.created_at limit 1);
update project set pq_date = '2026-11-20' where id = (select p.id from project p join project_stage s on s.id = p.stage_id where s.code = 'pq' order by p.created_at desc limit 1);
