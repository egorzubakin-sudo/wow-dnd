import { initializeGame, gameView, mutateGame, splitOnlineBackup, mapBackupValues, atlasStorageReference, atlasMediaName, validateBackup } from "./engine.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
function response(data,status=200) {
  return Response.json(data,{status,headers:cors});
}
export function gameHandler(config, transport=fetch) {
  const {url,serviceKey} = config;
  const server = (path,options={}) => transport(url+path,{
    ...options,
    headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,...options.headers},
  });
  const rpc = async (name,args) => {
    const result=await server("/rest/v1/rpc/"+name,{method:"POST",body:JSON.stringify(args),headers:{"Content-Type":"application/json"}});
    if (!result.ok) throw new Error(result.status===401||result.status===403?"Доступ к кампании закрыт":"Сервер кампании не принял запрос");
    return result.json();
  };
  const view = (access) => ({
    actor: access.actor,
    revision: access.revision,
    prefix: access.prefix,
    shareMap: !!access.share_map,
    document: access.document ? gameView(initializeGame(access.document),access) : null,
  });
  return async (request) => {
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    if (request.method!=="POST") return response({error:"Используйте POST"},405);
    const auth=request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return response({error:"Войдите в онлайн-кампанию"},401);
    try {
      const userResponse=await server("/auth/v1/user",{headers:{Authorization:auth}});
      if (!userResponse.ok) return response({error:"Сеанс входа недействителен"},401);
      const {id:user}=await userResponse.json();
      if (!uuid.test(user)) return response({error:"Сеанс входа недействителен"},401);
      const text=await request.text();
      if (text.length>24*1024*1024) return response({error:"Слишком большой запрос"},413);
      const body=JSON.parse(text);
      if (!uuid.test(body?.campaign)) return response({error:"Не указана кампания"},400);
      const identity={p_campaign:body.campaign,p_user:user};
      const access=await rpc("atlas_game_read",identity);
      if (body.action==="state") return response(view(access));
      if (body.action!=="command" || !uuid.test(body.request) ||
          !Number.isSafeInteger(body.revision) || typeof body.name!=="string" ||
          typeof body.key!=="string" || !body.key.length || body.key.length>180)
        return response({error:"Некорректная команда"},400);
      if (!access.document) return response({error:"Сначала импортируйте кампанию"},409);
      if (access.revision!==body.revision) return response({conflict:true,...view(access)});
      const key="online:"+user+":"+body.key;
      if (access.document.engine?.receipts?.some((receipt)=>receipt.key===key))
        return response(view(access));
      let next;
      try {
        next=mutateGame(access,body.name,body.payload,key);
      } catch(error) {
        return response({error:access.actor.role==="master"?error.message:"Действие недоступно. Проверьте условия, время и ресурсы."},422);
      }
      // Only images that already belonged to this import, or bytes uploaded by this request, may be referenced.
      const previous=new Set();
      mapBackupValues(access.document,(value)=>{if(value.startsWith(atlasStorageReference)) previous.add(value);return value;});
      mapBackupValues(next,(value)=>{
        if (value.startsWith(atlasStorageReference) && (!previous.has(value)||!atlasMediaName.test(value.slice(atlasStorageReference.length))))
          throw new Error("Недоступное изображение");
        return value;
      });
      const packed=await splitOnlineBackup(next,{allowReferences:true});
      for (const [name,blob] of packed.images) {
        const upload=await server("/storage/v1/object/atlas-campaign-media/"+access.prefix+name,{
          method:"POST",body:blob,headers:{"Content-Type":blob.type,"x-upsert":"true"},
        });
        if (!upload.ok) return response({error:"Не удалось сохранить изображение"},502);
      }
      validateBackup(packed.document);
      const saved=await rpc("atlas_game_write",{
        ...identity,p_expected:access.revision,p_actor:access.actor,p_command:body.request,p_document:packed.document,
      });
      const latest=await rpc("atlas_game_read",identity);
      return response({conflict:saved.status==="conflict",...view(latest)});
    } catch(error) {
      if (error.message==="Доступ к кампании закрыт") return response({error:error.message},403);
      return response({error:"Кампания не обновлена. Обновите страницу и повторите действие."},400);
    }
  };
}
