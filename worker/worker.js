// Free CORS proxy for recipe pages. Deploy on Cloudflare Workers (free tier: 100k requests/day).
//   cd worker && npx wrangler deploy
// Then paste the worker URL into Mise > Settings. Usage: GET /?url=https://example.com/recipe
const ALLOW_ORIGINS = ['*']; // tighten to ['https://<you>.github.io'] once it works

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const allowed = ALLOW_ORIGINS.includes('*') || ALLOW_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? (ALLOW_ORIGINS.includes('*') ? '*' : origin) : 'null',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!allowed) return new Response('Forbidden', { status: 403, headers: cors });

    const target = new URL(req.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
    if (!/^https?:$/.test(u.protocol)) return new Response('Bad protocol', { status: 400, headers: cors });
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return new Response('Blocked', { status: 400, headers: cors });

    const res = await fetch(u.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MiseRecipeImporter/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cf: { cacheTtl: 3600 },
    });
    const body = await res.text();
    return new Response(body.slice(0, 3_000_000), {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
