-- Trin 1: engelsk skema, opslagstabeller, employee, roles, contact_company, aktivitetsstatus
-- Alle ids forbliver uuid. Dummydata flyttes med.

-- ===== A. Fjern ting, der afhænger af gamle navne =====
drop view if exists v_person_seneste_aktivitet;
drop view if exists v_pipeline_vaegtet;
drop view if exists v_projekt_overhalet;
drop trigger if exists projekt_log_trg on projekt;
drop trigger if exists projekt_oprettet_trg on projekt;
drop function if exists log_projekt_aendring();
drop function if exists log_projekt_oprettet();
drop function if exists u(text);
drop function if exists aktuelt_kvartal();

create function current_quarter() returns text language sql stable set search_path = public as
$$ select to_char(current_date, 'YYYY') || ' K' || extract(quarter from current_date)::int $$;

create function set_last_modified() returns trigger language plpgsql set search_path = public as
$$ begin new.last_modified := now(); return new; end $$;

-- ===== B. Bruger =====
alter table bruger rename to app_user;
alter table app_user rename column navn to name;
alter table app_user rename column rolle to role;
alter table app_user rename column oprettet_at to created_at;
alter table app_user drop constraint bruger_rolle_check;
update app_user set role = case role when 'ejer' then 'owner' else 'member' end;
alter table app_user add constraint app_user_role_check check (role in ('owner', 'member'));
alter table app_user alter column role set default 'owner';
alter policy bruger_egen on app_user rename to own_row;

create function is_owner() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_user where id = (select auth.uid()) and role = 'owner') $$;

-- ===== C. Opslagstabeller =====
do $$
declare t text;
begin
  foreach t in array array['company_category', 'developer_type', 'company_stage', 'project_stage', 'project_source', 'activity_type', 'activity_status',
                           'employee_title', 'contact_function', 'affiliation_type', 'participant_role'] loop
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

alter table developer_type add column group_name text, add column sector text;
alter table project_stage add column default_probability numeric(5, 2) not null default 0, add column is_open boolean not null default false;
alter table participant_role add column kind text not null default 'company' check (kind in ('company', 'contact'));

insert into company_category (code, name, sort_order, is_system) values
  ('bygherre', 'Bygherre', 1, true), ('arkitekt', 'Arkitekt', 2, true), ('entreprenoer', 'Entreprenør', 3, true), ('raadgiver', 'Rådgiver', 4, true),
  ('leverandoer', 'Leverandør', 5, true), ('myndighed', 'Myndighed', 6, true), ('egen', 'Egen virksomhed', 7, true), ('andet', 'Andet', 8, true);

insert into developer_type (code, name, sort_order, group_name, sector, is_system) values
  ('private_company', 'Privat - Firma', 1, 'Privat', 'Privat', true),
  ('private_investor', 'Privat - Investor', 2, 'Privat', 'Privat', true),
  ('private_developer', 'Privat - Developer', 3, 'Privat', 'Privat', true),
  ('private_foundation', 'Privat - Fond, Stiftelse, selvejende institution', 4, 'Privat', 'Privat', true),
  ('public_state', 'Offentlig - Stat', 5, 'Offentlig - Stat', 'Offentlig', true),
  ('public_municipality', 'Offentlig - Kommune', 6, 'Offentlig - Kommune', 'Offentlig', true),
  ('public_region', 'Offentlig - Region', 7, 'Offentlig - Region', 'Offentlig', true),
  ('housing_cooperative', 'Boligselskab - Andel', 8, 'Privat', 'Privat', true),
  ('housing_social', 'Boligselskab - Almen', 9, 'Boligselskab - Almen', 'Privat', true),
  ('housing_owner', 'Boligselskab - Ejer', 10, 'Privat', 'Privat', true);

insert into company_stage (code, name, sort_order, is_system) values
  ('unknown', 'Ukendt', 1, true), ('known', 'Kendt', 2, true), ('active_dialogue', 'Aktiv dialog', 3, true),
  ('customer', 'Kunde', 4, true), ('strategic_partner', 'Strategisk partner', 5, true), ('dormant', 'Sovende', 6, true);

insert into project_stage (code, name, sort_order, default_probability, is_open, is_system) values
  ('rygte', 'Rygte', 1, 10, true, true), ('kval', 'Kvalificeret', 2, 25, true, true), ('pq', 'PQ', 3, 40, true, true), ('tilbud', 'Tilbud', 4, 55, true, true),
  ('vundet', 'Vundet', 5, 100, false, true), ('tabt', 'Tabt', 6, 0, false, true), ('fravalgt', 'Fravalgt', 7, 0, false, true);

insert into project_source (code, name, sort_order, is_system) values
  ('aktivitet', 'Aktivitet', 1, true), ('byggefakta', 'Byggefakta', 2, true), ('hubexo', 'HUBEXO', 3, true), ('andet', 'Andet', 4, true);

insert into activity_type (code, name, sort_order, is_system) values
  ('kaffemoede', 'Kaffemøde', 1, true), ('frokostmoede', 'Frokostmøde', 2, true), ('kundemoede', 'Kundemøde', 3, true), ('reception', 'Reception', 4, true),
  ('konference', 'Konference', 5, true), ('netvaerksarrangement', 'Netværksarrangement', 6, true), ('telefonsamtale', 'Telefonsamtale', 7, true),
  ('gaahjemmoede', 'Gå-hjem-møde', 8, false), ('webinar', 'Webinar', 9, false), ('andet', 'Andet', 10, true);

insert into activity_status (code, name, sort_order, is_system) values
  ('planned', 'Planlagt', 1, true), ('canceled', 'Aflyst', 2, true), ('completed', 'Gennemført', 3, true);

insert into employee_title (name, sort_order) values
  ('Forretningsdirektør', 1), ('Afdelingsleder', 2), ('Projektleder', 3), ('Bid manager', 4), ('Rådgiver', 5);

insert into contact_function (name, sort_order) values
  ('Direktør', 1), ('Projektchef', 2), ('Projektleder', 3), ('Teknisk chef', 4), ('Indkøber', 5);

insert into affiliation_type (code, name, sort_order, is_system) values
  ('employee', 'Ansat', 1, true), ('board_member', 'Bestyrelsesmedlem', 2, true), ('board_chair', 'Bestyrelsesformand', 3, true),
  ('owner', 'Ejer', 4, false), ('advisor', 'Rådgiver', 5, false), ('other', 'Andet', 6, false);

insert into participant_role (code, name, kind, sort_order, is_system) values
  ('client', 'Bygherre', 'company', 1, true), ('total_consultant', 'Totalrådgiver', 'company', 2, false), ('architect', 'Arkitekt', 'company', 3, false),
  ('engineer', 'Ingeniør', 'company', 4, false), ('landscape_architect', 'Landskabsarkitekt', 'company', 5, false), ('contractor', 'Entreprenør', 'company', 6, false),
  ('sub_consultant', 'Underrådgiver', 'company', 7, false), ('competitor', 'Konkurrent', 'company', 8, true),
  ('decision_maker', 'Beslutningstager', 'contact', 9, false), ('client_project_manager', 'Projektleder hos bygherre', 'contact', 10, false),
  ('buyer', 'Indkøber', 'contact', 11, false), ('technical_contact', 'Teknisk kontakt', 'contact', 12, false);

-- ===== D. Employee =====
insert into employee_title (name, sort_order)
select distinct t, 100 from (
  select coalesce((select a.titel from ansaettelse a where a.person_id = p.id and a.til_dato is null order by a.fra_dato desc nulls last limit 1), p.titel) t
  from person p where p.er_kollega) x
where t is not null and t <> '' and not exists (select 1 from employee_title e where e.name = x.t);

create table employee (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text,
  last_name text,
  initials text,
  title_id uuid references employee_title(id),
  user_id uuid references app_user(id) on delete set null,
  email text, phone text, notes text,
  active boolean not null default true,
  owner_id uuid not null default auth.uid() references app_user(id),
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);
create index on employee(owner_id);
create index on employee(title_id);
create index on employee(user_id);

insert into employee (id, first_name, middle_name, last_name, title_id, email, phone, notes, owner_id, created_at)
select p.id, p.fornavn, p.mellemnavn, p.efternavn,
  (select t.id from employee_title t where t.name = coalesce((select a.titel from ansaettelse a where a.person_id = p.id and a.til_dato is null order by a.fra_dato desc nulls last limit 1), p.titel) limit 1),
  p.email, p.telefon, p.noter, p.ejer_id, p.oprettet_at
from person p where p.er_kollega;

update employee e set initials = x.ini || case when x.rn > 1 then x.rn::text else '' end
from (select id, upper(left(first_name, 2) || left(coalesce(last_name, ''), 2)) ini,
        row_number() over (partition by upper(left(first_name, 2) || left(coalesce(last_name, ''), 2)) order by created_at, id) rn from employee) x
where x.id = e.id;

alter table employee enable row level security;
create policy owner on employee for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger employee_lm before update on employee for each row execute function set_last_modified();

-- ===== E. Virksomhed -> company =====
alter table virksomhed rename to company;
alter table company rename column navn to name;
alter table company rename column adresse to address1;
alter table company rename column postnr to postal_code;
alter table company rename column "by" to city;
alter table company rename column noter to notes;
alter table company rename column ejer_id to owner_id;
alter table company rename column oprettet_at to created_at;
alter table company rename column underkategori to subcategory;
alter table company rename column antal_medarbejdere to employee_count;
alter table company add column category_id uuid references company_category(id);
update company c set category_id = (select k.id from company_category k where k.code = c.type::text);
alter table company alter column category_id set not null;
alter table company drop column type;
alter table company add column address2 text,
  add column country text not null default 'Danmark',
  add column developer_type_id uuid references developer_type(id),
  add column stage_id uuid references company_stage(id),
  add column responsible_id uuid references employee(id) on delete set null,
  add column last_modified timestamptz not null default now();
create index on company(category_id);
create index on company(developer_type_id);
create index on company(responsible_id);
create trigger company_lm before update on company for each row execute function set_last_modified();
alter policy ejer on company rename to owner;

-- ===== F. Aktivitet -> activity =====
alter table aktivitet rename to activity;
alter table activity rename column dato to date;
alter table activity rename column titel to title;
alter table activity rename column noter to notes;
alter table activity rename column sted to place;
alter table activity rename column jeg_deltog to attended;
alter table activity rename column ejer_id to owner_id;
alter table activity rename column oprettet_at to created_at;
alter table activity add column type_id uuid references activity_type(id);
update activity a set type_id = (select t.id from activity_type t where t.code = a.type::text);
alter table activity alter column type_id set not null;
alter table activity drop column type;
alter table activity add column status_id uuid references activity_status(id);
update activity set status_id = (select id from activity_status where code = 'completed');
alter table activity alter column status_id set not null;
alter table activity add column via_employee_id uuid references employee(id) on delete set null;
update activity set via_employee_id = via_kollega_id where via_kollega_id in (select id from employee);
alter table activity drop column via_kollega_id;
alter table activity add column last_modified timestamptz not null default now();
create index on activity(type_id);
create index on activity(status_id);
create index on activity(via_employee_id);
create trigger activity_lm before update on activity for each row execute function set_last_modified();
alter policy ejer on activity rename to owner;

-- ===== G. Deltagere: kolleger flyttes til activity_employee =====
create table activity_employee (
  activity_id uuid not null references activity(id) on delete cascade,
  employee_id uuid not null references employee(id) on delete cascade,
  primary key (activity_id, employee_id)
);
create index on activity_employee(employee_id);
alter table activity_employee enable row level security;
create policy via_activity on activity_employee for all to authenticated
  using (exists (select 1 from activity a where a.id = activity_id and a.owner_id = (select auth.uid())))
  with check (exists (select 1 from activity a where a.id = activity_id and a.owner_id = (select auth.uid())));

insert into activity_employee (activity_id, employee_id)
select d.aktivitet_id, d.person_id from aktivitet_deltager d where d.person_id in (select id from employee);
delete from aktivitet_deltager where person_id in (select id from employee);

alter table aktivitet_deltager rename to activity_contact;
alter table activity_contact rename column aktivitet_id to activity_id;
alter table activity_contact rename column person_id to contact_id;
alter table activity_contact rename column var_til_stede to was_present;
alter policy via_aktivitet on activity_contact rename to via_activity;

alter table aktivitet_projekt rename to activity_project;
alter table activity_project rename column aktivitet_id to activity_id;
alter table activity_project rename column projekt_id to project_id;
alter policy via_aktivitet on activity_project rename to via_activity;

-- ===== H. Opfølgning -> followup =====
alter table opfoelgning add column employee_id uuid references employee(id) on delete set null;
update opfoelgning set employee_id = person_id, person_id = null where person_id in (select id from employee);
alter table opfoelgning rename to followup;
alter table followup rename column person_id to contact_id;
alter table followup rename column aktivitet_id to activity_id;
alter table followup rename column projekt_id to project_id;
alter table followup rename column forfald to due_date;
alter table followup rename column varsel_dage to warning_days;
alter table followup rename column tekst to task;
alter table followup rename column udfoert_at to done_at;
alter table followup rename column ejer_id to owner_id;
alter table followup add column created_at timestamptz not null default now(), add column last_modified timestamptz not null default now();
create index on followup(employee_id);
create trigger followup_lm before update on followup for each row execute function set_last_modified();
alter policy ejer on followup rename to owner;

-- ===== I. Label =====
delete from label_kobling where person_id in (select id from employee);

-- ===== J. Person -> contact (kolleger er flyttet) =====
insert into ansaettelse (person_id, virksomhed_id, titel, fra_dato)
select p.id, p.virksomhed_id, p.titel, p.bekendt_siden from person p
where not p.er_kollega and p.virksomhed_id is not null
  and not exists (select 1 from ansaettelse a where a.person_id = p.id and a.til_dato is null);

delete from person where er_kollega;   -- fjerner også kollegernes ansættelser

alter table person rename to contact;
alter table contact rename column fornavn to first_name;
alter table contact rename column mellemnavn to middle_name;
alter table contact rename column efternavn to last_name;
alter table contact rename column telefon to phone;
alter table contact rename column noter to notes;
alter table contact rename column bekendt_siden to acquainted_since;
alter table contact rename column ikke_invitation to no_invitation;
alter table contact rename column ejer_id to owner_id;
alter table contact rename column oprettet_at to created_at;
alter table contact drop column virksomhed_id;
alter table contact drop column titel;
alter table contact drop column er_kollega;
alter table contact add column active boolean not null default true, add column last_modified timestamptz not null default now();
create trigger contact_lm before update on contact for each row execute function set_last_modified();
alter policy ejer on contact rename to owner;

alter table ansaettelse rename to contact_company;
alter table contact_company rename column person_id to contact_id;
alter table contact_company rename column virksomhed_id to company_id;
alter table contact_company rename column titel to title;
alter table contact_company rename column fra_dato to from_date;
alter table contact_company rename column til_dato to to_date;
alter table contact_company add column affiliation_type_id uuid references affiliation_type(id),
  add column function_id uuid references contact_function(id) on delete set null,
  add column is_primary boolean not null default false,
  add column created_at timestamptz not null default now(),
  add column last_modified timestamptz not null default now();
update contact_company set affiliation_type_id = (select id from affiliation_type where code = 'employee');
alter table contact_company alter column affiliation_type_id set not null;
update contact_company c set is_primary = true
from (select distinct on (contact_id) id from contact_company where to_date is null order by contact_id, from_date desc nulls last, id) x
where x.id = c.id;
create unique index contact_company_one_primary on contact_company(contact_id) where is_primary;
create index on contact_company(affiliation_type_id);
create index on contact_company(function_id);
create trigger contact_company_lm before update on contact_company for each row execute function set_last_modified();
alter policy via_person on contact_company rename to via_contact;

alter table label_kobling rename to label_link;
alter table label_link rename column person_id to contact_id;
alter table label_link rename column virksomhed_id to company_id;
alter table label_link rename column projekt_id to project_id;

alter table label rename column navn to name;
alter table label rename column farve to color;
alter table label rename column er_invitationsliste to is_invitation_list;
alter table label rename column ejer_id to owner_id;
alter table label rename column beskrivelse to description;
alter table label add column created_at timestamptz not null default now(), add column last_modified timestamptz not null default now();
create trigger label_lm before update on label for each row execute function set_last_modified();
alter policy ejer on label rename to owner;

-- ===== K. Projekt -> project =====
alter table projekt rename to project;
alter table project rename column navn to title;
alter table project rename column rsm_nummer to rsm;
alter table project rename column bygherre_navn to developer_name;
alter table project rename column honorar to own_value;
alter table project rename column anlaegssum to value;
alter table project rename column anlaegssum_effektiv to effective_value;
alter table project rename column start_kvartal to construction_start_quarter;
alter table project rename column begrundelse to rationale;
alter table project rename column adresse to address1;
alter table project rename column postnr to postal_code;
alter table project rename column "by" to city;
alter table project rename column ejer_id to owner_id;
alter table project rename column oprettet_at to created_at;
alter table project add column stage_id uuid references project_stage(id), add column source_id uuid references project_source(id);
update project p set stage_id = (select s.id from project_stage s where s.code = p.fase::text), source_id = (select s.id from project_source s where s.code = p.kilde::text);
alter table project alter column stage_id set not null;
alter table project alter column source_id set not null;
alter table project add column last_modified timestamptz not null default now();
create index on project(stage_id);
create index on project(source_id);

-- Bygherre bliver en rolle
create table roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references company(id) on delete cascade,
  contact_id uuid references contact(id) on delete cascade,
  project_id uuid references project(id) on delete cascade,
  role_id uuid not null references participant_role(id),
  is_winner boolean not null default false,
  notes text,
  owner_id uuid not null default auth.uid() references app_user(id),
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now(),
  check (num_nonnulls(company_id, contact_id) >= 1),
  check (num_nonnulls(project_id) >= 1)
);
create index on roles(company_id);
create index on roles(contact_id);
create index on roles(project_id);
create index on roles(role_id);
create index on roles(owner_id);
alter table roles enable row level security;
create policy owner on roles for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger roles_lm before update on roles for each row execute function set_last_modified();

insert into roles (company_id, project_id, role_id, owner_id)
select p.bygherre_id, p.id, (select id from participant_role where code = 'client'), p.owner_id from project p where p.bygherre_id is not null;

alter table project drop column bygherre_id;
alter table project drop column fase;
alter table project drop column kilde;
create trigger project_lm before update on project for each row execute function set_last_modified();
alter policy ejer on project rename to owner;

alter table projekt_log rename to project_log;
alter table project_log rename column projekt_id to project_id;
alter table project_log rename column tidspunkt to changed_at;
alter table project_log rename column felt to field;
alter table project_log rename column gammel_vaerdi to old_value;
alter table project_log rename column ny_vaerdi to new_value;
alter table project_log rename column bruger_id to user_id;
update project_log set field = case field
  when 'fase' then 'stage' when 'start_kvartal' then 'construction_start_quarter' when 'honorar' then 'own_value' when 'anlaegssum' then 'value'
  when 'rsm_nummer' then 'rsm' when 'begrundelse' then 'rationale' when 'bygherre_id' then 'developer_id' when 'kilde' then 'source' when 'oprettet' then 'created'
  else field end;
alter policy via_projekt on project_log rename to via_project;

-- ===== L. Typologi, vedhæftning =====
alter table typologi rename to typology;
alter table typology rename column navn to name;
alter table typology rename column beskrivelse to description;
alter table typology drop column gruppe;
alter policy laes_alle on typology rename to read_all;

alter table virksomhed_typologi rename to company_typology;
alter table company_typology rename column virksomhed_id to company_id;
alter table company_typology rename column typologi_id to typology_id;
alter table company_typology rename column begrundelse to reason;
alter policy via_virksomhed on company_typology rename to via_company;

alter table vedhaeftning rename to attachment;
alter table attachment rename column aktivitet_id to activity_id;
alter table attachment rename column projekt_id to project_id;
alter table attachment rename column filnavn to file_name;
alter table attachment rename column sti to path;
alter table attachment rename column stoerrelse to size;
alter table attachment rename column mimetype to mime_type;
alter table attachment rename column ejer_id to owner_id;
alter table attachment rename column oprettet_at to created_at;
alter table attachment add column last_modified timestamptz not null default now();
create trigger attachment_lm before update on attachment for each row execute function set_last_modified();
alter policy ejer on attachment rename to owner;

drop type virksomhedstype;
drop type aktivitetstype;
drop type projektfase;
drop type projektkilde;
drop type typologigruppe;

-- ===== M. Logning af projektændringer =====
create function log_project_change() returns trigger language plpgsql security definer set search_path = public as
$$
declare r record;
begin
  for r in select * from (values
      ('stage', (select code from project_stage where id = old.stage_id), (select code from project_stage where id = new.stage_id)),
      ('construction_start_quarter', old.construction_start_quarter, new.construction_start_quarter),
      ('own_value', old.own_value::text, new.own_value::text),
      ('value', old.value::text, new.value::text),
      ('rsm', old.rsm, new.rsm),
      ('rationale', old.rationale, new.rationale),
      ('source', (select code from project_source where id = old.source_id), (select code from project_source where id = new.source_id))
    ) as v(f, o, n) loop
    if r.o is distinct from r.n then
      insert into project_log(project_id, field, old_value, new_value) values (new.id, r.f, r.o, r.n);
    end if;
  end loop;
  return new;
end $$;

create function log_project_created() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into project_log(project_id, field, new_value) values (new.id, 'created', (select code from project_source where id = new.source_id));
  return new;
end $$;

create function log_client_change() returns trigger language plpgsql security definer set search_path = public as
$$
declare cid uuid := (select id from participant_role where code = 'client');
begin
  if tg_op = 'INSERT' and new.role_id = cid and new.project_id is not null then
    insert into project_log(project_id, field, new_value) values (new.project_id, 'developer_id', new.company_id::text);
  elsif tg_op = 'UPDATE' and new.role_id = cid and new.project_id is not null and old.company_id is distinct from new.company_id then
    insert into project_log(project_id, field, old_value, new_value) values (new.project_id, 'developer_id', old.company_id::text, new.company_id::text);
  elsif tg_op = 'DELETE' and old.role_id = cid and old.project_id is not null and exists (select 1 from project where id = old.project_id) then
    insert into project_log(project_id, field, old_value) values (old.project_id, 'developer_id', old.company_id::text);
  end if;
  return coalesce(new, old);
end $$;

create trigger project_log_trg after update on project for each row execute function log_project_change();
create trigger project_created_trg after insert on project for each row execute function log_project_created();
create trigger roles_client_log_trg after insert or update or delete on roles for each row execute function log_client_change();

-- ===== N. Visninger =====
create view v_contact_last_activity with (security_invoker = true) as
select c.id as contact_id, max(a.date) as last_date, count(a.id) as activity_count
from contact c left join activity_contact d on d.contact_id = c.id left join activity a on a.id = d.activity_id
group by c.id;

create view v_pipeline_weighted with (security_invoker = true) as
select p.*, s.code as stage_code, s.default_probability as probability,
  coalesce(p.own_value, 0) * s.default_probability / 100 as weighted_own_value
from project p join project_stage s on s.id = p.stage_id;

create view v_project_overdue with (security_invoker = true) as
select p.* from project p join project_stage s on s.id = p.stage_id
where s.is_open and p.construction_start_quarter is not null and p.construction_start_quarter < current_quarter();
