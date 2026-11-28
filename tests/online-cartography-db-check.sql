set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.atlas_begin_import('10000000-0000-0000-0000-000000000001',3) as chart_import \gset
select public.atlas_finish_import('10000000-0000-0000-0000-000000000001', :'chart_import', '{
  "version":1,"company":{"members":[{"id":"hero1","name":"Hero"}]},"factions":[],
  "nodes":[{"id":"gate","name":"Gate","visibility":"known","x":0.2,"y":0.2},
    {"id":"keep","name":"Keep","visibility":"known","x":0.85,"y":0.85}],
  "routes":[{"id":"road","a":"gate","b":"keep","visibility":"known"}],
  "engine":{"mapPlacements":[{"map_id":"overview","node_id":"gate","x":0.4,"y":0.5},
    {"map_id":"overview","node_id":"keep","x":0.85,"y":0.85,"hidden":true}],
    "routeGeometries":[{"map_id":"overview","route_id":"road","points":[]}]}
}',true,false);
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
 if (select nodes from public.atlas_world) is distinct from '[{"id":"gate","name":"Gate","x":0.4,"y":0.5}]'
  or (select routes from public.atlas_world) is distinct from '[]' then raise exception 'Import leaked a hidden placement'; end if;
end $$;
reset role;
set role service_role;
do $$
declare c uuid:='10000000-0000-0000-0000-000000000001'; u uuid:='00000000-0000-0000-0000-000000000001'; d jsonb;
begin
 d:=public.atlas_game_read(c,u);
 if d->'map_layout' is distinct from 'true' then raise exception 'Missing layout capability'; end if;
 perform public.atlas_game_write(c,u,4,d->'actor','50000000-0000-0000-0000-000000000009',
   jsonb_set(jsonb_set(d->'document','{engine,mapPlacements,1,hidden}','false'),
     '{engine,routeGeometries,0,hidden}','true'));
end $$;
reset role;
set role authenticated;
do $$ begin
 if (select jsonb_array_length(nodes) from public.atlas_world) is distinct from 2
  or (select routes from public.atlas_world) is distinct from '[]' then raise exception 'Write leaked a hidden route'; end if;
end $$;
reset role;
