import { DOMAINS, pushDomains } from "../../lib/domains.js";
import { sendDebox } from "../../lib/debox.js";
import { pushInbox } from "../../lib/inbox.js";
export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url), key = u.searchParams.get("key"), env = ctx.env;
  // ?push=1&key=工单口令：网页端也能一键群发新网址（DeBox 也被封时用）
  if (u.searchParams.get("push") === "1") {
    const ok = key && ((env.FEEDBACK_KEY && key === env.FEEDBACK_KEY) || (env.BACKUP_KEY && key === env.BACKUP_KEY));
    if (!ok) return Response.json({ error: "口令不对" }, { status: 403 });
    if (!env.TEAM_KV) return Response.json({ error: "no kv" }, { status: 503 });
    return Response.json(await pushDomains(env, env.TEAM_KV, sendDebox, pushInbox));
  }
  return Response.json({ list: DOMAINS, at: Date.now() }, { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
