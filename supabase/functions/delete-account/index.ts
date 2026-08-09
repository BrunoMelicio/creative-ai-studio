import { createClient } from "npm:@supabase/supabase-js@2.102.0";

const corsHeaders = (origin: string | null) => {
  const allowed = new Set([
    "https://studio.brunomelicio.com",
    "http://127.0.0.1:4176",
    "http://localhost:4176"
  ]);
  return {
    "Access-Control-Allow-Origin": origin && allowed.has(origin) ? origin : "https://studio.brunomelicio.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers: cors });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Authentication required." }, { status: 401, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return Response.json({ error: "Server configuration error." }, { status: 500, headers: cors });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return Response.json({ error: "Your session is no longer valid." }, { status: 401, headers: cors });

  const payload = await req.json().catch(() => ({}));
  if (payload?.confirmation !== "DELETE") {
    return Response.json({ error: "Type DELETE to confirm account deletion." }, { status: 400, headers: cors });
  }

  await admin.from("admin_activity").insert({
    actor_id: user.id,
    target_user_id: user.id,
    action: "self_delete",
    details: { email: user.email ?? null }
  });

  await fetch(`${url}/auth/v1/logout?scope=global`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: serviceKey }
  }).catch(() => null);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400, headers: cors });

  return Response.json({ ok: true }, { headers: { ...cors, "Content-Type": "application/json" } });
});
