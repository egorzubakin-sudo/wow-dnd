import { gameHandler } from "./handler.mjs";

Deno.serve(gameHandler({
  url: Deno.env.get("SUPABASE_URL"),
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
}));
