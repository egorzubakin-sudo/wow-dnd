begin;

create schema atlas_private;
revoke all on schema atlas_private from public, anon, authenticated;

create table public.atlas_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.atlas_members (
  campaign_id uuid not null references public.atlas_campaigns on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  nickname text not null check (length(btrim(nickname)) between 1 and 50),
  role text not null check (role in ('master', 'captain', 'player', 'observer')),
  primary key (campaign_id, user_id)
);
create index atlas_members_user_idx on public.atlas_members (user_id);
create unique index atlas_members_nickname_idx on public.atlas_members (campaign_id, lower(nickname));

create table public.atlas_heroes (
  campaign_id uuid not null references public.atlas_campaigns on delete cascade,
  hero_id text not null,
  name text not null,
  portrait_path text,
  primary key (campaign_id, hero_id)
);
create table public.atlas_hero_links (
  campaign_id uuid not null,
  user_id uuid not null,
  hero_id text not null,
  primary key (campaign_id, user_id, hero_id),
  foreign key (campaign_id, user_id) references public.atlas_members on delete cascade,
  foreign key (campaign_id, hero_id) references public.atlas_heroes on delete cascade
);
create index atlas_hero_links_hero_idx on public.atlas_hero_links (campaign_id, hero_id);

create table public.atlas_world (
  campaign_id uuid primary key references public.atlas_campaigns on delete cascade,
  nodes jsonb not null,
  routes jsonb not null,
  map_path text,
  map_width integer,
  map_height integer
);
create unique index atlas_world_map_path_idx on public.atlas_world (map_path) where map_path is not null;
create unique index atlas_hero_portrait_path_idx
  on public.atlas_heroes (campaign_id, hero_id, portrait_path) where portrait_path is not null;
create index atlas_hero_portrait_lookup_idx on public.atlas_heroes (portrait_path) where portrait_path is not null;

create table atlas_private.imports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.atlas_campaigns on delete cascade,
  author uuid references auth.users on delete set null,
  base_revision bigint not null,
  stage text not null default 'open' check (stage in ('open','active','retired','abandoned')),
  created_at timestamptz not null default now()
);
create unique index atlas_one_open_import on atlas_private.imports (campaign_id) where stage = 'open';
create table atlas_private.backups (
  campaign_id uuid primary key references public.atlas_campaigns on delete cascade,
  import_id uuid not null references atlas_private.imports,
  document jsonb not null
);

create function atlas_private.member_role(p_campaign uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select role from public.atlas_members where campaign_id = p_campaign and user_id = auth.uid()
$$;

create function atlas_private.can_read_hero(p_campaign uuid, p_hero text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(atlas_private.member_role(p_campaign) = 'master' or
    (atlas_private.member_role(p_campaign) in ('captain','player') and exists (
      select 1 from public.atlas_hero_links where campaign_id = p_campaign
      and user_id = auth.uid() and hero_id = p_hero
    )), false)
$$;

alter table public.atlas_campaigns enable row level security;
alter table public.atlas_members enable row level security;
alter table public.atlas_heroes enable row level security;
alter table public.atlas_hero_links enable row level security;
alter table public.atlas_world enable row level security;
alter table atlas_private.imports enable row level security;
alter table atlas_private.backups enable row level security;

revoke all on public.atlas_campaigns, public.atlas_members, public.atlas_heroes,
  public.atlas_hero_links, public.atlas_world from public, anon, authenticated;
grant select on public.atlas_campaigns, public.atlas_members, public.atlas_heroes,
  public.atlas_hero_links, public.atlas_world to authenticated;

create policy atlas_campaign_select on public.atlas_campaigns for select to authenticated
  using (atlas_private.member_role(id) is not null);
create policy atlas_member_select on public.atlas_members for select to authenticated
  using (user_id = (select auth.uid()) or atlas_private.member_role(campaign_id) = 'master');
create policy atlas_hero_select on public.atlas_heroes for select to authenticated
  using (atlas_private.can_read_hero(campaign_id, hero_id));
create policy atlas_hero_links_select on public.atlas_hero_links for select to authenticated
  using (atlas_private.can_read_hero(campaign_id, hero_id) and
    (user_id = (select auth.uid()) or atlas_private.member_role(campaign_id) = 'master'));
create policy atlas_world_select on public.atlas_world for select to authenticated
  using (atlas_private.member_role(campaign_id) is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atlas-campaign-media', 'atlas-campaign-media', false, 20971520,
  array['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/avif']);

create function atlas_private.media_access(p_name text, p_access text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpeg|webp|gif|bmp|avif)$'
  and exists (
    select 1 from atlas_private.imports as i
    where i.campaign_id::text = split_part(p_name,'/',1) and i.id::text = split_part(p_name,'/',2)
    and case p_access
      when 'upload' then i.stage = 'open' and i.author = auth.uid()
        and atlas_private.member_role(i.campaign_id) = 'master'
      when 'delete' then i.stage in ('retired','abandoned')
        and atlas_private.member_role(i.campaign_id) = 'master'
      when 'read' then atlas_private.member_role(i.campaign_id) = 'master'
        or (i.stage = 'active' and (
          exists (select 1 from public.atlas_world as w where w.campaign_id = i.campaign_id
            and w.map_path = p_name and atlas_private.member_role(w.campaign_id) is not null)
          or exists (select 1 from public.atlas_heroes as h where h.campaign_id = i.campaign_id
            and h.portrait_path = p_name and atlas_private.can_read_hero(h.campaign_id,h.hero_id))
        ))
      else false end
  )
$$;

create policy atlas_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'atlas-campaign-media' and atlas_private.media_access(name, 'upload'));
create policy atlas_media_read on storage.objects for select to authenticated
  using (bucket_id = 'atlas-campaign-media' and atlas_private.media_access(name, 'read'));
create policy atlas_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'atlas-campaign-media' and atlas_private.media_access(name, 'delete'));

create function atlas_private.require_master(p_campaign uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if atlas_private.member_role(p_campaign) is distinct from 'master' then
    raise exception 'Требуется роль мастера' using errcode = '42501';
  end if;
end;
$$;

create function public.atlas_manage_member(p_campaign uuid, p_user uuid, p_nickname text, p_role text, p_heroes text[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.atlas_campaigns where id = p_campaign for update;
  perform atlas_private.require_master(p_campaign);
  if p_user = auth.uid() and p_role is distinct from 'master' then
    raise exception 'Мастер не может изменить собственную роль';
  end if;
  if p_role is null or p_role not in ('master','captain','player','observer') or p_nickname is null then
    raise exception 'Укажите никнейм и роль';
  end if;
  if (p_role = 'observer' and cardinality(p_heroes) > 0) or exists (
    select 1 from unnest(p_heroes) as h
    where not exists (select 1 from public.atlas_heroes where campaign_id = p_campaign and hero_id = h)
  ) then
    raise exception 'Недопустимая привязка героя';
  end if;
  insert into public.atlas_members values (p_campaign, p_user, btrim(p_nickname), p_role)
  on conflict (campaign_id,user_id) do update set nickname = excluded.nickname, role = excluded.role;
  delete from public.atlas_hero_links where campaign_id = p_campaign and user_id = p_user;
  insert into public.atlas_hero_links select distinct p_campaign,p_user,h from unnest(p_heroes) as h;
end;
$$;

create function public.atlas_begin_import(p_campaign uuid, p_revision bigint)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_revision bigint;
begin
  select revision into v_revision from public.atlas_campaigns where id = p_campaign for update;
  perform atlas_private.require_master(p_campaign);
  if v_revision is distinct from p_revision then
    raise exception 'Кампания изменилась. Обновите страницу перед импортом.' using errcode = '40001';
  end if;
  if exists (select 1 from atlas_private.imports where campaign_id = p_campaign and stage = 'open') then
    raise exception 'Есть незавершённая загрузка. Отмените её в управлении импортом.';
  end if;
  insert into atlas_private.imports (campaign_id, author, base_revision)
    values (p_campaign,auth.uid(),p_revision) returning id into v_id;
  return v_id;
end;
$$;

create function atlas_private.extract_media(p_value jsonb)
returns setof text language sql immutable set search_path = ''
as $$
  with recursive walk(value) as (
    select p_value
    union all
    select child.value from walk cross join lateral (
      select value from jsonb_each(case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end)
      union all
      select value from jsonb_array_elements(case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end)
    ) as child
  )
  select value #>> '{}' from walk where jsonb_typeof(value) = 'string'
    and ((value #>> '{}') like 'atlas-storage:v1:%' or (value #>> '{}') ~* '^data:image/')
$$;

create function atlas_private.media_path(p_prefix text, p_reference text)
returns text language sql immutable set search_path = ''
as $$
  select case when p_reference ~ '^atlas-storage:v1:[0-9a-f]{64}\.(png|jpeg|webp|gif|bmp|avif)$'
    then p_prefix || substr(p_reference,18) end
$$;

create function public.atlas_finish_import(p_campaign uuid, p_import uuid, p_document jsonb,
  p_share_world boolean, p_share_images boolean)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_import atlas_private.imports;
  v_revision bigint; v_prefix text; v_nodes jsonb;
  v_map text; v_width integer; v_height integer;
begin
  select revision into v_revision from public.atlas_campaigns where id = p_campaign for update;
  perform atlas_private.require_master(p_campaign);
  select * into v_import from atlas_private.imports where id = p_import and campaign_id = p_campaign for update;
  if not found or v_import.author is distinct from auth.uid() or v_import.stage <> 'open'
    or v_import.base_revision <> v_revision then
    raise exception 'Загрузка уже закрыта или кампания изменилась' using errcode = '40001';
  end if;
  if jsonb_typeof(p_document) is distinct from 'object' or p_document->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_document->'company') is distinct from 'object'
    or jsonb_typeof(p_document#>'{company,members}') is distinct from 'array'
    or jsonb_typeof(p_document->'nodes') is distinct from 'array'
    or jsonb_typeof(p_document->'routes') is distinct from 'array'
    or jsonb_typeof(p_document->'factions') is distinct from 'array'
    or p_document ?| array['accounts','password','hash','salt','secrets']
    or octet_length(p_document::text) > 8388608 then
    raise exception 'Некорректное сохранение Atlas или JSON превышает 8 МиБ';
  end if;
  v_prefix := p_campaign::text || '/' || p_import::text || '/';
  if exists (
    select 1 from (select distinct ref from atlas_private.extract_media(p_document) as ref) as refs
    where not exists (
      select 1 from storage.objects as o where o.bucket_id = 'atlas-campaign-media'
      and o.name = atlas_private.media_path(v_prefix, refs.ref) and coalesce(o.metadata->>'size','0') <> '0'
    )
  ) then raise exception 'Сохранение содержит неподготовленное изображение'; end if;

  insert into public.atlas_heroes (campaign_id,hero_id,name,portrait_path)
  select p_campaign, h->>'id', left(coalesce(nullif(h->>'name',''),nullif(h->>'role',''),'Герой'),120),
    case when p_share_images then atlas_private.media_path(v_prefix,h->>'image') end
  from jsonb_array_elements(p_document#>'{company,members}') as h
  where jsonb_typeof(h->'id') = 'string' and length(h->>'id') between 1 and 140
  on conflict (campaign_id,hero_id) do update set name = excluded.name, portrait_path = excluded.portrait_path;
  delete from public.atlas_heroes as old where old.campaign_id = p_campaign and not exists (
    select 1 from jsonb_array_elements(p_document#>'{company,members}') as h where h->>'id' = old.hero_id);

  delete from public.atlas_world where campaign_id = p_campaign;
  if p_share_world then
    select coalesce(jsonb_agg(jsonb_build_object('id', left(n->>'id',140),
      'name',left(n->>'name',120),'x',n->'x','y',n->'y')), '[]'::jsonb)
    into v_nodes from jsonb_array_elements(p_document->'nodes') as n
    where n->>'visibility' = 'known' and jsonb_typeof(n->'id') = 'string'
      and jsonb_typeof(n->'name') = 'string' and jsonb_typeof(n->'x') = 'number'
      and jsonb_typeof(n->'y') = 'number' and n->'x' between '0'::jsonb and '1'::jsonb
      and n->'y' between '0'::jsonb and '1'::jsonb;
    if p_share_images then
      v_map := atlas_private.media_path(v_prefix,p_document#>>'{map,src}');
      if v_map is not null then
        if coalesce(p_document#>>'{map,w}','') !~ '^[1-9][0-9]{0,5}$'
          or coalesce(p_document#>>'{map,h}','') !~ '^[1-9][0-9]{0,5}$' then
          raise exception 'Некорректный размер подложки';
        end if;
        v_width := (p_document#>>'{map,w}')::integer;
        v_height := (p_document#>>'{map,h}')::integer;
      end if;
    end if;
    insert into public.atlas_world
    select p_campaign, v_nodes, coalesce(jsonb_agg(jsonb_build_object('a',r->>'a','b',r->>'b')), '[]'::jsonb),
      v_map,v_width,v_height
    from jsonb_array_elements(p_document->'routes') as r
    where r->>'visibility' = 'known'
      and v_nodes @> jsonb_build_array(jsonb_build_object('id',r->>'a'))
      and v_nodes @> jsonb_build_array(jsonb_build_object('id',r->>'b'));
  end if;

  update atlas_private.imports set stage = 'retired' where campaign_id = p_campaign and stage = 'active';
  update atlas_private.imports set stage = 'active' where id = p_import;
  insert into atlas_private.backups values (p_campaign,p_import,p_document)
    on conflict (campaign_id) do update set import_id = excluded.import_id, document = excluded.document;
  update public.atlas_campaigns set revision = revision + 1, updated_at = now()
  where id = p_campaign returning revision into v_revision;
  return v_revision;
end;
$$;

create function public.atlas_export_campaign(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  perform atlas_private.require_master(p_campaign);
  select jsonb_build_object('document',document,'prefix',campaign_id::text || '/' || import_id::text || '/')
  into v_result from atlas_private.backups where campaign_id = p_campaign;
  return v_result;
end;
$$;

create function public.atlas_manage_uploads(p_campaign uuid, p_abandon boolean default false)
returns table (id uuid, stage text) language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.atlas_campaigns where atlas_campaigns.id = p_campaign for update;
  perform atlas_private.require_master(p_campaign);
  if p_abandon then
    update atlas_private.imports as i set stage = 'abandoned' where i.campaign_id = p_campaign and i.stage = 'open';
  end if;
  return query select i.id,i.stage from atlas_private.imports as i where i.campaign_id = p_campaign and
    (i.stage = 'open' or (i.stage in ('retired','abandoned') and exists (
      select 1 from storage.objects o where o.bucket_id = 'atlas-campaign-media'
        and split_part(o.name,'/',1) = p_campaign::text and split_part(o.name,'/',2) = i.id::text
    )));
end;
$$;

revoke all on all functions in schema atlas_private from public, anon, authenticated;
grant execute on function atlas_private.member_role(uuid), atlas_private.can_read_hero(uuid,text),
  atlas_private.media_access(text,text) to authenticated;
revoke all on function public.atlas_manage_member(uuid,uuid,text,text,text[]),
  public.atlas_begin_import(uuid,bigint), public.atlas_finish_import(uuid,uuid,jsonb,boolean,boolean),
  public.atlas_export_campaign(uuid), public.atlas_manage_uploads(uuid,boolean) from public, anon, authenticated;
grant execute on function public.atlas_manage_member(uuid,uuid,text,text,text[]),
  public.atlas_begin_import(uuid,bigint), public.atlas_finish_import(uuid,uuid,jsonb,boolean,boolean),
  public.atlas_export_campaign(uuid), public.atlas_manage_uploads(uuid,boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.atlas_campaigns;
end;
$$;
commit;
