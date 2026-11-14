// HarmonyVoice server: translation API, conversation rooms, the lobby and accounts (Durable Objects).
// The Gemini key lives only here (secret GEMINI_API_KEY), so visitors need no key.
import { DurableObject } from 'cloudflare:workers';

const LANGS = {
  yue: 'Cantonese (written Cantonese, Traditional Chinese, Hong Kong)', en: 'English',
  zh: 'Mandarin Chinese (Simplified Chinese)', hi: 'Hindi', es: 'Spanish', ar: 'Modern Standard Arabic',
  fr: 'French', bn: 'Bengali', pt: 'Portuguese', id: 'Indonesian', ur: 'Urdu',
};
const SEATS = ['A', 'B'];
const GESTURES = ['wave', 'bow', 'nod'];
const MAX_TURNS = 60, MAX_RINGS = 8;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const str = (v, max) => String(v ?? '').slice(0, max);
const arr = v => (Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : []);
const code = (v, max = 12) => (/^[a-z0-9]+$/.test(String(v)) ? String(v).slice(0, max) : '');
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const post = (stub, path, body, token) => stub.fetch(new Request('https://do' + path, { method: 'POST', body: JSON.stringify(body || {}), headers: token ? { 'x-token': token } : {} }));
const lobbyOf = env => env.LOBBY.get(env.LOBBY.idFromName('main'));
const userOf = (env, uid) => env.USER.get(env.USER.idFromName(uid));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ code: 'forbidden' }, 403);
    try {
      if (path === '/api/config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || '' });
      if (path === '/api/warm') { ctx.waitUntil(pickModel(env).catch(() => {})); return json({ ok: true }); }
      if (path === '/api/translate' && method === 'POST') return json(await translate(env, await request.json()));
      if (path === '/api/lobby') return lobbyOf(env).fetch(request);
      const room = path.match(/^\/api\/room\/([A-Za-z0-9_-]{1,40})$/);
      if (room) {
        // a signed-in visitor's friend code is checked here, so the room can trust it
        const me = await whoami(env, url.searchParams.get('t'));
        const headers = new Headers(request.headers);
        headers.set('x-room', room[1]); headers.set('x-uid', me ? me.uid : '');
        return env.ROOM.get(env.ROOM.idFromName(room[1])).fetch(new Request(request, { headers }));
      }
      if (path === '/api/login' && method === 'POST') return json(await login(env, await request.json()));
      if (path.startsWith('/api/me') || path.startsWith('/api/friends') || path === '/api/logout') {
        const bearer = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
        const [uid, token] = bearer.split('.');
        if (!code(uid, 16) || !token) throw fail(401, 'not_signed_in');
        const mine = userOf(env, uid), body = method === 'GET' ? {} : await request.json().catch(() => ({}));
        const call = async (stub, p, b, t) => { const r = await post(stub, p, b, t); const d = await r.json(); if (!r.ok) throw fail(r.status, d.code); return d; };
        if (path === '/api/me' && method === 'GET') {
          const me = await call(mine, '/me', {}, token);
          const where = await call(lobbyOf(env), '/where', { uids: Object.keys(me.friends) });
          for (const f of Object.values(me.friends)) f.at = where[f.uid] || null;
          return json(me);
        }
        if (path === '/api/me' && method === 'PUT') return json(await call(mine, '/save', body, token));
        if (path === '/api/logout') return json(await call(mine, '/logout', {}, token));
        const other = code(body.uid, 16);
        if (!other || other === uid) throw fail(400, 'bad_request');
        if (path === '/api/friends') {
          const { card } = await call(mine, '/card', {}, token);
          return json(await call(userOf(env, other), '/request', { card }));
        }
        if (path === '/api/friends/accept') {
          const { card } = await call(mine, '/accept', { uid: other }, token);
          return json(await call(userOf(env, other), '/befriend', { card }));
        }
        if (path === '/api/friends/remove') {
          await call(mine, '/remove', { uid: other }, token);
          return json(await call(userOf(env, other), '/unfriend', { uid }));
        }
      }
      return json({ code: 'not_found' }, 404);
    } catch (e) {
      return json({ code: e.code || 'server_error' }, e.status || 500);
    }
  },
};
async function whoami(env, bearer) {
  const [uid, token] = String(bearer || '').split('.');
  if (!code(uid, 16) || !token) return null;
  const r = await post(userOf(env, uid), '/card', {}, token);
  return r.ok ? { uid } : null;
}

/* ---------- Google sign-in ---------- */
let certs = null, certsAt = 0;
async function login(env, b) {
  if (!env.GOOGLE_CLIENT_ID) throw fail(500, 'no_login');
  let sub, name;
  try {
    const [h, p, sig] = String(b.credential).split('.');
    const dec = x => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const parse = x => JSON.parse(new TextDecoder().decode(dec(x)));
    const header = parse(h), claims = parse(p);
    if (!certs || Date.now() - certsAt > 3600e3) { // GOOGLE_CERTS_URL: local tests only
      certs = (await (await fetch(env.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs')).json()).keys; certsAt = Date.now();
    }
    const key = await crypto.subtle.importKey('jwk', certs.find(k => k.kid === header.kid), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, dec(sig), new TextEncoder().encode(h + '.' + p));
    if (!ok || claims.aud !== env.GOOGLE_CLIENT_ID || !/^(https:\/\/)?accounts\.google\.com$/.test(claims.iss) || claims.exp * 1000 < Date.now()) throw 0;
    sub = claims.sub; name = claims.given_name || claims.name || '';
  } catch { throw fail(401, 'bad_login'); }
  // the friend code is derived from the Google account id; the email address is never stored
  const uid = (await sha('harmonyvoice:' + sub)).slice(0, 12);
  const r = await post(userOf(env, uid), '/login', { uid, name: str(name, 20) });
  return r.json();
}

/* ---------- Gemini ---------- */
const geminiBase = env => env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/models'; // GEMINI_BASE: local tests only
let models = null;
async function pickModel(env) {
  // newest plain "gemini-X-flash" this key can use: more accurate than Flash-Lite, which is kept as the fallback
  if (models) return models;
  const res = await fetch(`${geminiBase(env)}?pageSize=200`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  if (!res.ok) throw fail(502, res.status === 429 ? 'rate_limited' : 'ai_key');
  const names = ((await res.json()).models || []).map(m => String(m.name).replace('models/', ''));
  const newest = re => names.filter(n => re.test(n)).sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]))[0];
  return (models = { main: newest(/^gemini-\d+(\.\d+)?-flash$/) || 'gemini-2.5-flash', lite: newest(/^gemini-\d+(\.\d+)?-flash-lite$/) });
}
async function gemini(env, prompt, quick) {
  if (!env.GEMINI_API_KEY) throw fail(500, 'no_key');
  const { main, lite } = await pickModel(env);
  const ask = m => {
    const generationConfig = { responseMimeType: 'application/json' };
    // translation keeps the accurate model but thinks less, so it answers fast
    if (quick) generationConfig.thinkingConfig = /^gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
    return fetch(`${geminiBase(env)}/${m}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
    });
  };
  let res = await ask(main);
  if ((res.status === 429 || res.status === 503) && quick && lite) res = await ask(lite); // busy or out of quota: deliver with the lighter model rather than fail
  if (!res.ok) throw fail(res.status === 429 ? 429 : 502, res.status === 429 ? 'rate_limited' : res.status === 503 ? 'overloaded' : 'ai_error');
  const text = ((await res.json()).candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { throw fail(502, 'invalid_json'); }
}

/* ---------- topic themes (pick the backdrop) ---------- */
const THEMES = {
  ai: /\bAI\b|人工智能|人工智慧|機械人|機器人|robot|algorithm|演算法|科技|社交媒體|social media|internet|網上|网络|tech/i,
  school: /學校|学校|老師|老师|考試|考试|功課|作業|教育|學生|学生|大學|school|teacher|exam|homework|educat|student|universit/i,
  nature: /環境|环境|環保|气候|氣候|減碳|塑膠|塑料|保育|污染|動物|climate|environment|plastic|pollut|nature|animal|recycl/i,
  city: /城市|住屋|房屋|交通|私家車|汽車|地鐵|遙距|辦公室|租金|city|housing|traffic|transport|remote work|office|rent/i,
  home: /家庭|父母|小朋友|孩子|仔女|家務|婚姻|結婚|family|parent|child|kid|marriage|housework/i,
  health: /健康|醫療|医疗|醫生|精神|糖稅|運動量|睡眠|疫苗|health|medical|doctor|mental|sleep|vaccin|diet/i,
  money: /經濟|经济|工作|收入|人工|薪|買樓|投資|稅|失業|economy|work week|job|income|salary|wage|invest|tax|money/i,
  food: /飲食|食物|食肉|素食|外賣|菜式|餐|food|meat|vegetarian|vegan|cook|restaurant|takeaway/i,
  culture: /文化|傳統|传统|節日|语言|語言|母語|藝術|音樂|旅遊|宗教|culture|tradition|festival|language|art|music|travel|religio/i,
  space: /科學|科学|太空|火星|基因|科研|宇宙|science|space|mars|gene|research|universe/i,
  sport: /運動|运动|體育|电竞|電競|足球|奧運|sport|football|soccer|olympic|esport|game/i,
  world: /和平|社會|社会|言論|自由|民主|匿名|戰爭|意見|平等|peace|society|speech|freedom|democra|anonym|war|equal/i,
};
async function themeOf(env, topic) {
  for (const [k, re] of Object.entries(THEMES)) if (re.test(topic)) return k;
  try {
    const r = await gemini(env, `Pick the one category that best fits this discussion question: """${topic}"""\nCategories: ${Object.keys(THEMES).join(', ')}, general.\nReply with only JSON: {"theme": "<category>"}`, true);
    return THEMES[r.theme] ? r.theme : 'general';
  } catch { return 'general'; }
}

/* ---------- translation ---------- */
async function translate(env, b) {
  const text = str(b.text, 2000).trim(), src = b.src, topic = str(b.topic, 200);
  if (!text || !LANGS[src]) throw fail(400, 'bad_request');
  const targets = [...new Set(arr(b.targets))].filter(c => LANGS[c] && c !== src);
  const codes = [src, ...targets];
  const r = await gemini(env, `You are the live translation layer in HarmonyVoice, a voice chat where people who speak different languages discuss a topic calmly.
Topic: ${topic}
Speaker language: ${LANGS[src]}
Utterance: """${text}"""
The utterance may come from speech recognition, so it can lack punctuation and contain small recognition errors.

Do three things:
1. Translate the whole utterance, every clause, into each of these languages: ${targets.map(c => `${c} = ${LANGS[c]}`).join('; ') || '(none needed)'}. Keep the meaning, stance and strength exactly. Do not soften, strengthen, add or drop anything. Fix an obvious recognition error only when the intended word is clear.
2. Give a short tone label (1-4 words, e.g. sincere, joking, frustrated, asking, proposing) in each of these languages: ${codes.map(c => `${c} = ${LANGS[c]}`).join('; ')}.
3. Decide whether the utterance attacks a person (insults, mocks or demeans the other speaker or a group of people) rather than an argument. Strong disagreement with an idea is NOT an attack. If it is an attack, set attack to true and write a suggestion in the speaker's language that keeps the same stance but addresses the argument instead of the person.

Reply with only JSON in this shape, using exactly these language codes as keys (${codes.join(', ')}):
{"translations": {"<code>": "<text>"}, "tone": {"<code>": "<label>"}, "attack": false, "suggestion": ""}`, true);
  const tr = {}, tone = {};
  for (const c of targets) if (r.translations?.[c]) tr[c] = str(r.translations[c], 3000);
  for (const c of codes) if (r.tone?.[c]) tone[c] = str(r.tone[c], 60);
  return { tr, tone, attack: r.attack === true, suggestion: str(r.suggestion, 2000) };
}

/* ---------- argument tree ---------- */
const EXAMPLE_TREE = {
  topic: '應唔應該限制小朋友用手機？',
  roots: ['兒童健康', '自主與信任', '朋友聯繫'],
  nodes: [
    { id: 'n1', parent: null, angle: '健康', title: '睡眠受影響', summary: '瞓前長時間睇片，令小朋友第二日冇精神。', quotes: ['見到好多小朋友瞓前一路睇片'], discovery: '', disagreement: '', buds: ['幾多分鐘螢幕時間開始影響睡眠？'] },
    { id: 'n3', parent: 'n1', angle: '健康', title: '九點後收機', summary: '唔係完全禁止，而係設定夜晚時段收起手機。', quotes: ['夜晚九點之後收埋部手機？', '咁我贊成'], discovery: '由「禁唔禁」轉為「幾時用」，雙方都接受。', disagreement: '', buds: ['週末同平日應唔應該唔同？'] },
    { id: 'n2', parent: null, angle: '社交', title: '朋友聯繫', summary: '完全禁止可能令小朋友同朋友脫節。', quotes: ['全面禁止會令有啲小朋友脫節'], discovery: '', disagreement: '', buds: ['用學校群組聯絡功課，算唔算必要用途？'] },
    { id: 'n5', parent: 'n2', angle: '社交', title: '網上欺凌', summary: '社交 app 可能帶來欺凌同比較壓力。', quotes: ['我個仔試過喺群組俾人笑'], discovery: '', disagreement: '問題係手機本身，定係平台設計？', buds: ['平台應該負幾多責任？'] },
    { id: 'n4', parent: null, angle: '家庭', title: '點樣定規則', summary: '規則同小朋友一齊定，比父母單方面決定更易遵守。', quotes: ['不如同小朋友一齊定'], discovery: '重點由限制本身，轉到制定規則嘅過程。', disagreement: '', buds: ['幾歲開始，小朋友可以參與定規則？'] },
    { id: 'n7', parent: 'n4', angle: '家庭', title: '以身作則', summary: '父母自己都成日睇手機，小朋友會模仿。', quotes: ['我哋大人食飯都碌緊手機'], discovery: '', disagreement: '', buds: [] },
    { id: 'n6', parent: null, angle: '教育', title: '學習工具', summary: '手機都可以係學習工具，例如練語言。', quotes: ['學生用手機練習英文發音'], discovery: '', disagreement: '', buds: ['點樣分辨學習同娛樂用途？'] },
  ],
  vines: [{ a: 'n3', b: 'n2', label: '張力：夜晚收機，但夜晚先有時間同朋友傾' }],
  overview: { common: ['睡眠受影響係真問題', '完全禁止唔係最好方法'], disagreements: [{ type: '價值', text: '保護小朋友 vs 讓佢學識自己管理' }, { type: '事實', text: '螢幕時間同睡眠嘅關係有幾大' }] },
  changes: [], newIds: [], enrichedIds: [],
};
const emptyTree = topic => ({ topic, roots: [], nodes: [], vines: [], overview: { common: [], disagreements: [] }, changes: [], newIds: [], enrichedIds: [] });
const stripMeta = t => { const { changes, newIds, enrichedIds, ...rest } = t; return rest; };

function growPrompt(st) {
  const lines = st.turns.map(t => `${t.who} (${LANGS[t.lang]}): ${t.text}` + Object.entries(t.tr).map(([c, x]) => ` | ${LANGS[c]}: ${x}`).join('')).join('\n');
  return `You maintain the argument tree of HarmonyVoice. Each topic is a living tree that grows from people's cross-language conversations. It is NOT a pro/con debate map: top-level branches are angles of exploration (e.g. 健康, 社交, 家庭, 經濟, 倫理, 文化, 執行) and sub-branches are finer points. The tree records which arguments have been made, never how many people hold them. Never mention countries or nationalities.

Tree topic: ${st.tree.topic}
This conversation's question: ${st.convTopic}

Current tree (JSON):
${JSON.stringify(stripMeta(st.tree))}

New conversation transcript (original, then translations):
${lines}

Update the tree:
- Keep every existing node and its id. You may improve an existing node's summary, quotes, discovery, disagreement and buds.
- For each distinct claim in the conversation choose one: 相同 (already in the tree: at most add a short quote), 補充 (same point with new information or a new angle: enrich that node's summary or discovery), 開新枝 (a new direction: add a node under the best parent, or a new top-level angle with parent null), 回應 (it answers or pushes against another node: add a vine between the two node ids).
- New node ids: "n" plus a number not used yet. Depth at most 3 (a top-level angle is depth 1).
- All text in Traditional Chinese as written in Hong Kong. title at most 10 characters. summary at most 40 characters. quotes: at most 4 per node, each at most 30 characters, translated into Traditional Chinese and kept close to what was said. discovery: the new understanding this point brought, or "". disagreement: what is still disputed here, or "". buds: 0-2 open questions nobody has explored yet.
- roots: up to 4 underlying values people care about in this topic.
- overview.common: up to 4 points the speakers accepted. overview.disagreements: up to 4, each with type 事實, 價值 or 優先次序.
- changes: one entry per claim from this conversation: {"type": "相同|補充|開新枝|回應", "node": "<id>", "reason": "<at most 30 characters>"}.
- newIds: ids of nodes you added. enrichedIds: ids of existing nodes you changed.

Reply with only JSON in this shape:
{"topic":"","roots":[],"nodes":[{"id":"","parent":null,"angle":"","title":"","summary":"","quotes":[],"discovery":"","disagreement":"","buds":[]}],"vines":[{"a":"","b":"","label":""}],"overview":{"common":[],"disagreements":[{"type":"","text":""}]},"changes":[],"newIds":[],"enrichedIds":[]}`;
}
function cleanTree(r, prev) {
  if (!r || !Array.isArray(r.nodes) || !r.nodes.length) throw fail(502, 'invalid_json');
  const nodes = [], seen = new Set();
  for (const n of r.nodes) {
    if (!n || !n.id || seen.has(String(n.id))) continue;
    seen.add(String(n.id));
    nodes.push({ id: str(n.id, 20), parent: n.parent == null || n.parent === '' ? null : String(n.parent), angle: str(n.angle, 20),
      title: str(n.title || '未命名', 30), summary: str(n.summary, 200), quotes: arr(n.quotes).slice(0, 4),
      discovery: str(n.discovery, 200), disagreement: str(n.disagreement, 200), buds: arr(n.buds).slice(0, 2) });
  }
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  for (const n of nodes) {
    if (n.parent && !byId[n.parent]) n.parent = null;
    const walk = new Set([n.id]); let p = n.parent;
    while (p) { if (walk.has(p)) { n.parent = null; break; } walk.add(p); p = byId[p] && byId[p].parent; }
  }
  const ov = r.overview || {};
  return {
    topic: str(r.topic || prev.topic, 200), roots: arr(r.roots).slice(0, 4), nodes,
    vines: (Array.isArray(r.vines) ? r.vines : []).filter(v => v && byId[v.a] && byId[v.b]).map(v => ({ a: String(v.a), b: String(v.b), label: str(v.label, 100) })),
    overview: { common: arr(ov.common).slice(0, 4), disagreements: (Array.isArray(ov.disagreements) ? ov.disagreements : []).filter(Boolean).slice(0, 4).map(d => ({ type: str(d.type, 10), text: str(d.text, 200) })) },
    changes: (Array.isArray(r.changes) ? r.changes : []).filter(c => c && byId[c.node]).map(c => ({ type: str(c.type, 10), node: String(c.node), reason: str(c.reason, 100) })),
    newIds: arr(r.newIds).filter(id => byId[id]), enrichedIds: arr(r.enrichedIds).filter(id => byId[id]),
  };
}
function cleanTurn(t) {
  if (!t || !SEATS.includes(t.who) || !LANGS[t.lang]) return null;
  const pick = (o, max) => Object.fromEntries(Object.entries(o || {}).filter(([c]) => LANGS[c]).map(([c, x]) => [c, str(x, max)]));
  const text = str(t.text, 2000).trim();
  return text ? { who: t.who, lang: t.lang, text, tr: pick(t.tr, 3000), tone: pick(t.tone, 60) } : null;
}

/* ---------- conversation room ---------- */
const REACTIONS = ['👍', '❤️', '👏', '🤔', '🙏', '🌱'];
const cleanCard = p => ({ name: str(p?.name, 20).trim() || '朋友', culture: code(p?.culture, 8) || 'world', outfit: code(p?.outfit) || 'plain' });
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) || {
        people: { A: { lang: 'yue', gesture: 'wave' }, B: { lang: 'en', gesture: 'bow' } },
        convTopic: EXAMPLE_TREE.topic, turns: [], tree: EXAMPLE_TREE, treeVersion: 0, theme: 'home', open: false,
      };
      this.rings = (await ctx.storage.get('rings')) || [];
    });
  }
  snapshot() { return { ...this.state, rings: this.rings }; }
  members(except) { return this.ctx.getWebSockets().filter(ws => ws !== except).map(ws => ws.deserializeAttachment()).filter(Boolean); }
  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(data); } catch {} }
  }
  async save() { await this.ctx.storage.put({ state: this.state, rings: this.rings }); }
  pushRing() { this.rings.push({ tree: stripMeta(this.state.tree) }); if (this.rings.length > MAX_RINGS) this.rings.shift(); }
  // tell everyone in the room who is here, and tell the lobby (public rooms only)
  roster(except) {
    const members = this.members(except), st = this.state;
    this.broadcast({ type: 'members', members }, except);
    if (!st.id) return;
    const seat = s => { const m = members.find(x => x.seat === s); return m ? { ...m.p, uid: m.uid, lang: st.people[s].lang } : null; };
    this.ctx.waitUntil(post(lobbyOf(this.env), '/room', {
      id: st.id, n: st.open ? members.length : 0, topic: st.convTopic, theme: st.theme, A: seat('A'), B: seat('B'),
      watchers: members.filter(m => m.seat === 'C').length, uids: members.map(m => m.uid).filter(Boolean),
    }).catch(() => {}));
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    const taken = this.members().map(m => m.seat), watch = new URL(request.url).searchParams.get('role') === 'watch';
    const me = { id: crypto.randomUUID(), seat: (!watch && SEATS.find(s => !taken.includes(s))) || 'C', lang: '', uid: request.headers.get('x-uid') || '', p: cleanCard() };
    const id = request.headers.get('x-room');
    if (this.state.id !== id) { this.state.id = id; await this.save(); }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    server.send(JSON.stringify({ type: 'welcome', you: me, state: this.snapshot(), fresh: !this.state.made && !this.state.turns.length && this.members(server).length === 0 }));
    this.roster();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment(), st = this.state;
    const others = () => this.members(ws);
    const push = async () => { await this.save(); this.broadcast({ type: 'state', state: this.snapshot() }); };
    if (m.type === 'hello') {
      // who I am (name, culture, outfit) and, if I hold a seat, the language and greeting I use
      me.p = cleanCard(m.p); ws.serializeAttachment(me);
      if (SEATS.includes(me.seat)) {
        if (LANGS[m.lang]) st.people[me.seat].lang = m.lang;
        if (GESTURES.includes(m.gesture)) st.people[me.seat].gesture = m.gesture;
        await push();
      }
      this.roster();
    } else if (m.type === 'create') {
      // the first visitor of a brand-new room sets its topic and whether the lobby lists it
      const topic = str(m.topic, 200).trim();
      if (st.made || st.turns.length || !topic) return;
      st.made = true; st.open = m.open === true; st.tree = emptyTree(topic); st.convTopic = topic;
      st.theme = THEMES[m.theme] ? m.theme : await themeOf(this.env, topic);
      await push(); this.roster();
    } else if (m.type === 'seat' && ['A', 'B', 'C'].includes(m.seat)) {
      if (m.seat === 'C' || !others().some(x => x.seat === m.seat)) { me.seat = m.seat; ws.serializeAttachment(me); }
      this.roster();
    } else if (m.type === 'audLang') {
      me.lang = LANGS[m.lang] ? m.lang : ''; ws.serializeAttachment(me);
      this.roster();
    } else if (m.type === 'person' && SEATS.includes(m.seat)) {
      // a seat's language and greeting can be changed by whoever holds it, or by anyone while it is empty
      if (me.seat !== m.seat && others().some(x => x.seat === m.seat)) return;
      if (LANGS[m.lang]) st.people[m.seat].lang = m.lang;
      if (GESTURES.includes(m.gesture)) st.people[m.seat].gesture = m.gesture;
      await push(); this.roster();
    } else if (m.type === 'status' && SEATS.includes(m.seat)) {
      this.broadcast({ type: 'status', seat: m.seat, status: str(m.status, 20) }, ws);
    } else if (m.type === 'react' && REACTIONS.includes(m.e)) {
      this.broadcast({ type: 'react', seat: me.seat, e: m.e });
    } else if (m.type === 'poke') {
      // nudge a signed-in member to re-read their friend requests
      for (const s of this.ctx.getWebSockets()) if (s !== ws && s.deserializeAttachment()?.uid === m.uid) { try { s.send(JSON.stringify({ type: 'poke', name: me.p.name })); } catch {} }
    } else if (m.type === 'turn') {
      const t = cleanTurn(m.turn); if (!t) return;
      st.turns.push(t); if (st.turns.length > MAX_TURNS) st.turns.shift();
      await this.save(); this.broadcast({ type: 'turn', turn: t });
    } else if (m.type === 'topic') {
      st.convTopic = str(m.convTopic, 200).trim() || st.tree.topic; st.turns = [];
      await push(); this.roster();
    } else if (m.type === 'newTree') {
      const topic = str(m.topic, 200).trim(); if (!topic) return;
      this.pushRing(); st.tree = emptyTree(topic); st.convTopic = topic; st.turns = []; st.treeVersion++; st.made = true;
      st.theme = THEMES[m.theme] ? m.theme : await themeOf(this.env, topic);
      await push(); this.roster();
    } else if (m.type === 'grow') {
      if (this.growing || !st.turns.length) return;
      this.growing = true; this.broadcast({ type: 'growing' });
      const used = st.turns.length;
      try {
        const next = cleanTree(await gemini(this.env, growPrompt(st), false), st.tree);
        this.pushRing(); st.tree = next; st.turns = st.turns.slice(used); st.treeVersion++;
        await push();
      } catch (e) { this.broadcast({ type: 'growError', code: e.code || 'server_error' }); }
      finally { this.growing = false; }
    }
  }
  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch {}
    this.roster(ws);
  }
  async webSocketError(ws) { this.roster(ws); }
}

/* ---------- lobby: who is online and which public rooms are open ---------- */
export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.rooms = (await ctx.storage.get('rooms')) || {}; });
  }
  view(except) {
    const rooms = Object.values(this.rooms);
    return { type: 'lobby', rooms, online: this.ctx.getWebSockets().filter(ws => ws !== except).length + rooms.reduce((a, r) => a + r.n, 0) };
  }
  tell(except) {
    const data = JSON.stringify(this.view(except));
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(data); } catch {} }
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      this.tell();
      return new Response(null, { status: 101, webSocket: client });
    }
    const b = await request.json();
    if (url.pathname === '/room') {
      // sent by a room whenever its people or topic change; n = 0 takes it off the list
      const old = Date.now() - 12 * 3600e3;
      for (const [id, r] of Object.entries(this.rooms)) if (r.at < old) delete this.rooms[id];
      if (b.n > 0) this.rooms[b.id] = { ...b, at: Date.now() }; else delete this.rooms[b.id];
      await this.ctx.storage.put('rooms', this.rooms);
      this.tell();
      return json({ ok: true });
    }
    if (url.pathname === '/where') {
      const out = {};
      for (const r of Object.values(this.rooms)) for (const uid of r.uids || []) if (b.uids.includes(uid)) out[uid] = { room: r.id, topic: r.topic };
      return json(out);
    }
    return json({ code: 'not_found' }, 404);
  }
  async webSocketMessage() {}
  async webSocketClose(ws) { try { ws.close(1000, 'bye'); } catch {} this.tell(ws); }
  async webSocketError(ws) { this.tell(ws); }
}

/* ---------- account: one per signed-in person (profile, sessions, friends) ---------- */
const cleanProfile = p => ({
  ...cleanCard(p), lang: LANGS[p?.lang] ? p.lang : 'en', gesture: GESTURES.includes(p?.gesture) ? p.gesture : 'wave',
  unlocked: arr(p?.unlocked).map(x => code(x)).filter(Boolean).slice(0, 60),
  stats: { said: +p?.stats?.said || 0, heard: +p?.stats?.heard || 0, trees: +p?.stats?.trees || 0, met: arr(p?.stats?.met).map(x => code(x, 8)).filter(Boolean).slice(0, 40), heardFrom: Object.fromEntries(Object.entries(p?.stats?.heardFrom || {}).filter(([k]) => code(k, 8)).slice(0, 40).map(([k, v]) => [k, +v || 0])) },
});
export class User extends DurableObject {
  async fetch(request) {
    const path = new URL(request.url).pathname, b = await request.json(), db = this.ctx.storage;
    const d = (await db.get('d')) || { uid: '', profile: null, sessions: [], friends: {}, requests: {} };
    const card = () => ({ uid: d.uid, ...cleanCard(d.profile) });
    const done = async out => { await db.put('d', d); return json(out || { ok: true }); };
    if (path === '/login') {
      const token = hex(crypto.getRandomValues(new Uint8Array(24)));
      d.uid = b.uid; d.sessions = [...d.sessions.slice(-4), await sha(token)];
      return done({ token: d.uid + '.' + token, uid: d.uid, profile: d.profile, name: b.name });
    }
    // calls from other accounts (through the Worker, which has already checked the caller)
    if (path === '/request') { if (!d.uid) return json({ code: 'no_such_user' }, 404); if (!d.friends[b.card.uid]) d.requests[b.card.uid] = b.card; return done(); }
    if (path === '/befriend') { d.friends[b.card.uid] = b.card; return done(); }
    if (path === '/unfriend') { delete d.friends[b.uid]; delete d.requests[b.uid]; return done(); }
    // everything else needs this account's own session token
    if (!d.sessions.includes(await sha(request.headers.get('x-token') || ''))) return json({ code: 'not_signed_in' }, 401);
    if (path === '/card') return json({ card: card() });
    if (path === '/me') return json({ uid: d.uid, profile: d.profile, friends: d.friends, requests: d.requests });
    if (path === '/save') { d.profile = cleanProfile(b.profile); return done(); }
    if (path === '/accept') { if (!d.requests[b.uid]) return json({ code: 'bad_request' }, 400); d.friends[b.uid] = d.requests[b.uid]; delete d.requests[b.uid]; return done({ card: card() }); }
    if (path === '/remove') { delete d.friends[b.uid]; delete d.requests[b.uid]; return done(); }
    if (path === '/logout') { const h = await sha(request.headers.get('x-token')); d.sessions = d.sessions.filter(x => x !== h); return done(); }
    return json({ code: 'not_found' }, 404);
  }
}
