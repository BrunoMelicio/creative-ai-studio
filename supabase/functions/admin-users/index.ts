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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!["GET", "POST"].includes(req.method)) return Response.json({ error: "Method not allowed." }, { status: 405, headers: cors });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Authentication required." }, { status: 401, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return Response.json({ error: "Server configuration error." }, { status: 500, headers: cors });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const actor = authData?.user;
  if (authError || !actor) return Response.json({ error: "Your session is no longer valid." }, { status: 401, headers: cors });
  if (actor.app_metadata?.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: cors });

  if (req.method === "GET") {
    const requestUrl = new URL(req.url);
    const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
    const perPage = Math.min(200, Math.max(1, Number(requestUrl.searchParams.get("perPage") || 100)));
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });

    const ids = data.users.map((user) => user.id);
    const profileResult = ids.length
      ? await admin.from("profiles").select("id,display_name,username,country,created_at").in("id", ids)
      : { data: [], error: null };
    if (profileResult.error) return Response.json({ error: profileResult.error.message }, { status: 400, headers: cors });
    const profileMap = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));

    const users = data.users.map((user) => ({
      id: user.id,
      email: user.email ?? "",
      display_name: profileMap.get(user.id)?.display_name ?? user.user_metadata?.display_name ?? "",
      username: profileMap.get(user.id)?.username ?? null,
      country: profileMap.get(user.id)?.country ?? "",
      role: user.app_metadata?.role === "admin" ? "admin" : "user",
      confirmed: Boolean(user.email_confirmed_at),
      suspended: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null
    }));

    return Response.json({ users, page }, { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const payload = await req.json().catch(() => ({}));
  const action = String(payload?.action ?? "");
  const userId = String(payload?.userId ?? "");
  if (!userId) return Response.json({ error: "A target user is required." }, { status: 400, headers: cors });
  if (userId === actor.id && ["delete", "suspend", "set-role"].includes(action)) {
    return Response.json({ error: "You cannot remove, suspend, or change your own administrator access here." }, { status: 400, headers: cors });
  }

  const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
  const target = targetData?.user;
  if (targetError || !target) return Response.json({ error: "User not found." }, { status: 404, headers: cors });

  let operationError: { message: string } | null = null;
  let auditDetails: Record<string, unknown> = { email: target.email ?? null };

  if (action === "suspend") {
    ({ error: operationError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }));
  } else if (action === "restore") {
    ({ error: operationError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" }));
  } else if (action === "set-role") {
    const role = payload?.role === "admin" ? "admin" : "user";
    ({ error: operationError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...target.app_metadata, role }
    }));
    auditDetails = { ...auditDetails, role };
  } else if (action === "delete") {
    ({ error: operationError } = await admin.auth.admin.deleteUser(userId));
  } else {
    return Response.json({ error: "Unsupported administrator action." }, { status: 400, headers: cors });
  }

  if (operationError) return Response.json({ error: operationError.message }, { status: 400, headers: cors });

  await admin.from("admin_activity").insert({
    actor_id: actor.id,
    target_user_id: userId,
    action,
    details: auditDetails
  });

  return Response.json({ ok: true }, { headers: { ...cors, "Content-Type": "application/json" } });
});
