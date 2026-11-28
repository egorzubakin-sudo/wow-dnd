set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
begin
 begin
  perform public.atlas_game_read('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
  raise exception 'Player obtained raw game state';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.atlas_game_write('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    2,'{}','50000000-0000-0000-0000-000000000001','{}');
  raise exception 'Player wrote raw game state';
 exception when insufficient_privilege then null;
 end;
end; $$;
reset role;

set role service_role;
do $$
declare
 c uuid:='10000000-0000-0000-0000-000000000001';
 u uuid:='00000000-0000-0000-0000-000000000002';
 k uuid:='50000000-0000-0000-0000-000000000001';
 data jsonb; result jsonb;
begin
 data:=public.atlas_game_read(c,u);
 if data#>>'{actor,heroes,0}' is distinct from 'hero1' then raise exception 'Actor hero missing'; end if;
 begin
  perform public.atlas_game_read(c,'00000000-0000-0000-0000-000000000004');
  raise exception 'Outsider obtained raw game state';
 exception when insufficient_privilege then null;
 end;
 result:=public.atlas_game_write(c,u,2,data->'actor',k,jsonb_set(data->'document','{company,gold}','50'));
 if result->>'status' is distinct from 'saved' then raise exception 'Unable to update campaign'; end if;
 result:=public.atlas_game_write(c,u,2,data->'actor',k,data->'document');
 if result->>'status' is distinct from 'duplicate' then raise exception 'Operation applied twice'; end if;
 result:=public.atlas_game_write(c,u,2,data->'actor','50000000-0000-0000-0000-000000000002',data->'document');
 if result->>'status' is distinct from 'conflict' then raise exception 'Stale operation applied'; end if;
 data:=public.atlas_game_read(c,u);
 if data#>>'{document,company,gold}' is distinct from '50' or data->>'revision' is distinct from '3'
 then raise exception 'Saved state or revision differs'; end if;
end; $$;
reset role;
