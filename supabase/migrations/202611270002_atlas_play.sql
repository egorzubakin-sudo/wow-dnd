begin;

-- The browser can only enter this boundary through the authenticated Edge Function.
alter table public.atlas_members add column travel boolean not null default false;
create table atlas_private.game_commands (
  campaign_id uuid not null references public.atlas_campaigns on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  command_id uuid not null,
  revision bigint not null,
  primary key (campaign_id, user_id, command_id)
);
alter table atlas_private.game_commands enable row level security;

create function atlas_private.game_actor(p_campaign uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
 select jsonb_build_object(
   'role',m.role,'name',m.nickname,'nick',m.user_id,'travel',m.travel,
   'heroes',coalesce((select jsonb_agg(l.hero_id order by l.hero_id)
     from public.atlas_hero_links l
     where l.campaign_id=m.campaign_id and l.user_id=m.user_id),'[]'::jsonb)
 ) from public.atlas_members m where m.campaign_id=p_campaign and m.user_id=p_user
$$;

create function public.atlas_game_read(p_campaign uuid,p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_actor jsonb := atlas_private.game_actor(p_campaign,p_user); v_result jsonb;
begin
 if v_actor is null then raise exception 'Доступ к кампании закрыт' using errcode='42501'; end if;
 select jsonb_build_object('actor',v_actor,'revision',c.revision,'document',b.document,
   'prefix',case when b.import_id is not null then c.id::text||'/'||b.import_id::text||'/' end,
   'share_map',w.campaign_id is not null,'map_path',w.map_path,'portraits',coalesce((select jsonb_object_agg(h.hero_id,h.portrait_path)
     from public.atlas_heroes h where h.campaign_id=c.id and h.portrait_path is not null),'{}'::jsonb))
 into v_result from public.atlas_campaigns c
 left join atlas_private.backups b on b.campaign_id=c.id
 left join public.atlas_world w on w.campaign_id=c.id where c.id=p_campaign;
 return v_result;
end;
$$;

create function public.atlas_game_write(p_campaign uuid,p_user uuid,p_expected bigint,p_actor jsonb,
  p_command uuid,p_document jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_revision bigint; v_actor jsonb; v_prefix text; v_import uuid;
begin
 select revision into v_revision from public.atlas_campaigns where id=p_campaign for update;
 v_actor:=atlas_private.game_actor(p_campaign,p_user);
 if v_actor is null then raise exception 'Доступ к кампании закрыт' using errcode='42501'; end if;
 if exists(select 1 from atlas_private.game_commands where campaign_id=p_campaign and user_id=p_user and command_id=p_command)
   then return jsonb_build_object('status','duplicate','revision',v_revision); end if;
 if v_revision is distinct from p_expected or v_actor is distinct from p_actor
   then return jsonb_build_object('status','conflict','revision',v_revision); end if;
 select import_id into v_import from atlas_private.backups where campaign_id=p_campaign;
 if v_import is null then raise exception 'Сначала импортируйте кампанию'; end if;
 if jsonb_typeof(p_document) is distinct from 'object' or p_document->'version' is distinct from '1'::jsonb
    or octet_length(p_document::text)>8388608 then raise exception 'Некорректный размер сохранения'; end if;
 v_prefix:=p_campaign::text||'/'||v_import::text||'/';

 -- Keep hero bindings in sync without opening access to new portraits implicitly.
 insert into public.atlas_heroes(campaign_id,hero_id,name)
 select p_campaign,h->>'id',left(coalesce(nullif(h->>'name',''),nullif(h->>'role',''),'Герой'),120)
 from jsonb_array_elements(p_document#>'{company,members}') h
 on conflict(campaign_id,hero_id) do update set name=excluded.name;
 delete from public.atlas_heroes as old where old.campaign_id=p_campaign and not exists (
   select 1 from jsonb_array_elements(p_document#>'{company,members}') h where h->>'id'=old.hero_id);
 update public.atlas_heroes as old set portrait_path=null where old.campaign_id=p_campaign and old.portrait_path is not null
  and not exists (select 1 from jsonb_array_elements(p_document#>'{company,members}') h
    where h->>'id'=old.hero_id and old.portrait_path=atlas_private.media_path(v_prefix,h->>'image'));
 with known as (
   select coalesce(jsonb_agg(jsonb_build_object('id',n->>'id','name',left(n->>'name',120),
     'x',n->'x','y',n->'y')),'[]'::jsonb) nodes
   from jsonb_array_elements(p_document->'nodes') n
   where n->>'visibility'='known' and n->'hidden' is distinct from 'true'::jsonb
     and jsonb_typeof(n->'x')='number' and jsonb_typeof(n->'y')='number'
     and n->'x' between '0'::jsonb and '1'::jsonb and n->'y' between '0'::jsonb and '1'::jsonb
 )
 update public.atlas_world w set nodes=k.nodes,routes=(
   select coalesce(jsonb_agg(jsonb_build_object('a',r->>'a','b',r->>'b')),'[]'::jsonb)
   from jsonb_array_elements(p_document->'routes') r
   where r->>'visibility'='known' and r->'hidden' is distinct from 'true'::jsonb
     and k.nodes @> jsonb_build_array(jsonb_build_object('id',r->>'a'))
     and k.nodes @> jsonb_build_array(jsonb_build_object('id',r->>'b'))
 ), map_path=case when w.map_path=atlas_private.media_path(v_prefix,p_document#>>'{map,src}') then w.map_path end,
    map_width=case when w.map_path=atlas_private.media_path(v_prefix,p_document#>>'{map,src}') then w.map_width end,
    map_height=case when w.map_path=atlas_private.media_path(v_prefix,p_document#>>'{map,src}') then w.map_height end
 from known k where w.campaign_id=p_campaign;

 update atlas_private.backups set document=p_document where campaign_id=p_campaign;
 update public.atlas_campaigns set revision=revision+1,updated_at=now()
 where id=p_campaign returning revision into v_revision;
 insert into atlas_private.game_commands values(p_campaign,p_user,p_command,v_revision);
 return jsonb_build_object('status','saved','revision',v_revision);
end;
$$;

-- Update travels separately from auth membership, using the same campaign lock as commands.
create function public.atlas_set_captain_travel(p_campaign uuid,p_user uuid,p_travel boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 perform 1 from public.atlas_campaigns where id=p_campaign for update;
 perform atlas_private.require_master(p_campaign);
 update public.atlas_members set travel=p_travel where campaign_id=p_campaign and user_id=p_user and role='captain';
 if not found then raise exception 'Сначала назначьте капитана'; end if;
end;
$$;

revoke all on function atlas_private.game_actor(uuid,uuid) from public,anon,authenticated;
revoke all on function public.atlas_game_read(uuid,uuid),public.atlas_game_write(uuid,uuid,bigint,jsonb,uuid,jsonb)
from public,anon,authenticated;
grant execute on function public.atlas_game_read(uuid,uuid),public.atlas_game_write(uuid,uuid,bigint,jsonb,uuid,jsonb) to service_role;
revoke all on function public.atlas_set_captain_travel(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.atlas_set_captain_travel(uuid,uuid,boolean) to authenticated;
commit;
