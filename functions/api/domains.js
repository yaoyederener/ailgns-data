// GET → { list: [{ h, main, note }] }：网址池，App 壳页每次打开都拉一次（拉不到就用页里写死的）
import { DOMAINS } from "../../lib/domains.js";
export async function onRequestGet() {
  return Response.json({ list: DOMAINS, at: Date.now() }, { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
