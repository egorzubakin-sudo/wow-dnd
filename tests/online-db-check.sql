insert into auth.users values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005');
insert into public.atlas_campaigns (id,name) values
  ('10000000-0000-0000-0000-000000000001','Fixture atlas'), ('10000000-0000-0000-0000-000000000002','Other atlas');
insert into public.atlas_members values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','GM','master');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.atlas_begin_import('10000000-0000-0000-0000-000000000001',0) as import_id \gset
select set_config('atlas.test_import', :'import_id', false);
insert into storage.objects
select 'atlas-campaign-media', '10000000-0000-0000-0000-000000000001/' || :'import_id' || '/' || repeat(hex,64) || '.png', '{"size":8}'::jsonb
from unnest(array['a','b','c','d']) as hex;
select public.atlas_finish_import('10000000-0000-0000-0000-000000000001', :'import_id',
  jsonb_build_object('version',1, 'company',jsonb_build_object('gold',999999,'members',jsonb_build_array(
    jsonb_build_object('id','hero1','name','Mine','notes','PRIVATE_HERO','image','atlas-storage:v1:'||repeat('a',64)||'.png'),
    jsonb_build_object('id','hero2','name','Other hero','image','atlas-storage:v1:'||repeat('b',64)||'.png')
  )), 'nodes','[
    {"id":"gate","name":"Gate","x":0,"y":0.2,"visibility":"known","notes":"PRIVATE_NODE","desc":"UNPUBLISHED_DESC"},
    {"id":"keep","name":"Keep","x":0.9,"y":1,"visibility":"known"},
    {"id":"trap","name":"Hidden place","x":1,"y":1,"visibility":"hidden"}
  ]'::jsonb,'routes','[
    {"a":"gate","b":"keep","visibility":"known","events":["PRIVATE_EVENT"]},
    {"a":"gate","b":"trap","visibility":"known"},
    {"a":"keep","b":"gate","visibility":"hidden"}
  ]'::jsonb,'factions','[]'::jsonb,'map',jsonb_build_object('src','atlas-storage:v1:'||repeat('d',64)||'.png','w',640,'h',480),
  'settings',jsonb_build_object('privateImage','atlas-storage:v1:'||repeat('c',64)||'.png'),'journal','["PRIVATE_JOURNAL"]'::jsonb),
  true,true);
select public.atlas_manage_member('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Player','player',array['hero1']);
select public.atlas_manage_member('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Observer','observer','{}');
select public.atlas_manage_member('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','Captain','captain',array['hero2']);

do $$
begin
  if (select revision from public.atlas_campaigns) <> 1 or
    (public.atlas_export_campaign('10000000-0000-0000-0000-000000000001')#>>'{document,company,gold}') <> '999999' then
    raise exception 'Committed snapshot or current revision differs';
  end if;
  begin
    perform public.atlas_begin_import('10000000-0000-0000-0000-000000000001',0);
    raise exception 'Accepted an old revision';
  exception when serialization_failure then null;
  end;
end; $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
begin
  if (select count(*) from public.atlas_members) <> 1 or (select array_agg(hero_id) from public.atlas_heroes) <> array['hero1']
    or (select count(*) from storage.objects) <> 2 or (select count(*) from public.atlas_campaigns) <> 1
    or (select nodes from public.atlas_world) <> '[{"id":"gate","name":"Gate","x":0,"y":0.2},{"id":"keep","name":"Keep","x":0.9,"y":1}]'::jsonb
    or (select routes from public.atlas_world) <> '[{"a":"gate","b":"keep"}]'::jsonb then
    raise exception 'Incorrect player projection';
  end if;
  begin
    perform public.atlas_export_campaign('10000000-0000-0000-0000-000000000001');
    raise exception 'Player read raw backup';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.atlas_manage_member('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Escalated','master','{}');
    raise exception 'Player gained master role';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects values ('atlas-campaign-media','forged','{}');
    raise exception 'Player wrote to media bucket';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.atlas_campaigns set revision = 99;
    raise exception 'Player wrote to campaign';
  exception when insufficient_privilege then null;
  end;
end; $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from public.atlas_heroes) <> 0 or (select count(*) from storage.objects) <> 1 then
    raise exception 'Observer can read a personal asset';
  end if;
end; $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ begin
  if (select array_agg(hero_id) from public.atlas_heroes) <> array['hero2'] then raise exception 'Wrong captain projection'; end if;
end; $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ begin
  if (select count(*) from public.atlas_campaigns) + (select count(*) from public.atlas_world)
     + (select count(*) from storage.objects) <> 0 then raise exception 'Outsider can see campaign'; end if;
end; $$;

reset role;
set role anon;
do $$ begin
  begin
    perform public.atlas_export_campaign('10000000-0000-0000-0000-000000000001');
    raise exception 'Anonymous can invoke export';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.atlas_begin_import('10000000-0000-0000-0000-000000000001',1) as second_id \gset
select set_config('atlas.test_second', :'second_id', false);
do $$
begin
  if (select count(*) from public.atlas_manage_uploads('10000000-0000-0000-0000-000000000001',false) where stage = 'open') <> 1 then
    raise exception 'Open import not listed';
  end if;
  begin
    perform public.atlas_finish_import('10000000-0000-0000-0000-000000000001',
      current_setting('atlas.test_second')::uuid,'{"version":1,"company":{"members":[]},"nodes":[],"routes":[],"factions":[],"missing":"atlas-storage:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"}'::jsonb,false,false);
    raise exception 'An absent media file was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Сохранение содержит неподготовленное изображение' then raise; end if;
  end;
  delete from storage.objects;
  if not exists (select 1 from storage.objects) then raise exception 'Active media was deleted'; end if;
end; $$;
select public.atlas_finish_import('10000000-0000-0000-0000-000000000001', :'second_id',
  '{"version":1,"company":{"members":[{"id":"hero1","name":"Mine"}]},"nodes":[],"routes":[],"factions":[]}'::jsonb,
  false,false);
select * from public.atlas_manage_uploads('10000000-0000-0000-0000-000000000001',false);
delete from storage.objects;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select array_agg(hero_id) from public.atlas_heroes) <> array['hero1']
    or (select count(*) from storage.objects) + (select count(*) from public.atlas_world) <> 0 then
    raise exception 'Republish failed to preserve bindings or revoke former world access';
  end if;
end; $$;
reset role;
do $$ begin
  if exists (select 1 from storage.objects) or not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='atlas_campaigns')
  then raise exception 'Cleanup or Realtime publication failed'; end if;
end; $$;
