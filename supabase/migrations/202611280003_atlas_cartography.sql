begin;

-- Both legacy write RPCs refresh atlas_world before saving the backup. Refine that
-- public preview in the same transaction using the final placement visibility.
create function atlas_private.refresh_overview()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_nodes jsonb;
  v_routes jsonb;
begin
  if jsonb_typeof(new.document#>'{engine,mapPlacements}') is distinct from 'array' then
    return new;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',n->>'id','name',left(n->>'name',120),
    'x',p->'x','y',p->'y') order by n->>'id'),'[]'::jsonb)
  into v_nodes
  from jsonb_array_elements(new.document->'nodes') n
  join jsonb_array_elements(new.document#>'{engine,mapPlacements}') p
    on p->>'node_id'=n->>'id' and p->>'map_id'='overview'
  where n->>'visibility'='known' and n->'hidden' is distinct from 'true'::jsonb
    and p->'hidden' is distinct from 'true'::jsonb
    and jsonb_typeof(p->'x')='number' and p->'x' between '0'::jsonb and '1'::jsonb
    and jsonb_typeof(p->'y')='number' and p->'y' between '0'::jsonb and '1'::jsonb;

  select coalesce(jsonb_agg(jsonb_build_object('a',r->>'a','b',r->>'b') order by r->>'id'),'[]'::jsonb)
  into v_routes from jsonb_array_elements(new.document->'routes') r
  where r->>'visibility'='known' and r->'hidden' is distinct from 'true'::jsonb
    and v_nodes @> jsonb_build_array(jsonb_build_object('id',r->>'a'))
    and v_nodes @> jsonb_build_array(jsonb_build_object('id',r->>'b'))
    and (jsonb_typeof(new.document#>'{engine,routeGeometries}') is distinct from 'array' or exists (
      select 1 from jsonb_array_elements(new.document#>'{engine,routeGeometries}') g
      where g->>'route_id'=r->>'id' and g->>'map_id'='overview'
        and g->'hidden' is distinct from 'true'::jsonb));

  update public.atlas_world set nodes=v_nodes,routes=v_routes where campaign_id=new.campaign_id;
  return new;
end;
$$;
revoke all on function atlas_private.refresh_overview() from public,anon,authenticated;
create trigger atlas_cartography_overview
after insert or update of document on atlas_private.backups
for each row execute function atlas_private.refresh_overview();

-- Existing backups with explicit layouts acquire the same filtered preview.
update atlas_private.backups set document=document
where jsonb_typeof(document#>'{engine,mapPlacements}')='array';

create or replace function public.atlas_game_read(p_campaign uuid,p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_actor jsonb := atlas_private.game_actor(p_campaign,p_user); v_result jsonb;
begin
 if v_actor is null then raise exception 'Доступ к кампании закрыт' using errcode='42501'; end if;
 select jsonb_build_object('actor',v_actor,'revision',c.revision,'document',b.document,
   'prefix',case when b.import_id is not null then c.id::text||'/'||b.import_id::text||'/' end,
   'share_map',w.campaign_id is not null,'map_layout',true,'map_path',w.map_path,'portraits',coalesce((select jsonb_object_agg(h.hero_id,h.portrait_path)
     from public.atlas_heroes h where h.campaign_id=c.id and h.portrait_path is not null),'{}'::jsonb))
 into v_result from public.atlas_campaigns c
 left join atlas_private.backups b on b.campaign_id=c.id
 left join public.atlas_world w on w.campaign_id=c.id where c.id=p_campaign;
 return v_result;
end;
$$;

commit;
