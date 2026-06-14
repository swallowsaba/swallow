/* ============================================================
   worker_code.js — 字幕取得用 Cloudflare Worker のコード（コピー用）
   設定画面の「Workerコードをコピー」で使う。
   GET（HTML・字幕本文）とPOST（YouTube内部API）の両方を中継し、
   CORSヘッダーを付けて返すパススルー型。?url= に対象URLを入れる。
   window.EigoData.workerCode として公開。
   ============================================================ */
(function () {
  "use strict";
  window.EigoData = window.EigoData || {};
  window.EigoData.workerCode = [
    "// EigoMaster 字幕取得プロキシ (Cloudflare Worker)",
    "// 使い方: デプロイ後のURL末尾に /?url= を付けてアプリの設定に貼る",
    "// 例: https://your-name.workers.dev/?url=",
    "",
    "export default {",
    "  async fetch(request) {",
    "    const CORS = {",
    "      'Access-Control-Allow-Origin': '*',",
    "      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',",
    "      'Access-Control-Allow-Headers': 'Content-Type'",
    "    };",
    "    if (request.method === 'OPTIONS') {",
    "      return new Response(null, { headers: CORS });",
    "    }",
    "    const u = new URL(request.url);",
    "    const target = u.searchParams.get('url');",
    "    if (!target) {",
    "      return new Response('Missing ?url=', { status: 400, headers: CORS });",
    "    }",
    "    let targetUrl;",
    "    try { targetUrl = new URL(target); } catch (e) {",
    "      return new Response('Bad url', { status: 400, headers: CORS });",
    "    }",
    "    // 安全のため YouTube / Google 系のみ許可",
    "    const host = targetUrl.hostname;",
    "    const ok = /(^|\\.)youtube\\.com$/.test(host) ||",
    "               /(^|\\.)youtube-nocookie\\.com$/.test(host) ||",
    "               /(^|\\.)googlevideo\\.com$/.test(host) ||",
    "               /(^|\\.)google\\.com$/.test(host);",
    "    if (!ok) {",
    "      return new Response('Host not allowed', { status: 403, headers: CORS });",
    "    }",
    "    const init = {",
    "      method: request.method,",
    "      headers: {",
    "        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',",
    "        'Accept-Language': 'en-US,en;q=0.9'",
    "      }",
    "    };",
    "    if (request.method === 'POST') {",
    "      init.headers['Content-Type'] = 'application/json';",
    "      init.body = await request.text();",
    "    }",
    "    let resp;",
    "    try {",
    "      resp = await fetch(targetUrl.toString(), init);",
    "    } catch (e) {",
    "      return new Response('Fetch failed: ' + e.message, { status: 502, headers: CORS });",
    "    }",
    "    const body = await resp.arrayBuffer();",
    "    const headers = new Headers(CORS);",
    "    const ct = resp.headers.get('Content-Type');",
    "    if (ct) headers.set('Content-Type', ct);",
    "    return new Response(body, { status: resp.status, headers });",
    "  }",
    "};"
  ].join("\n");
})();
