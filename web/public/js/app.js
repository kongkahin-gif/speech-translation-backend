/* HarmonyVoice client. Screens: opening saying -> character (first visit) -> lobby -> room.
   Content tables live in data.js; avatar and backdrop drawing in avatar.js and scenes.js. */
const W = 640, H = 520, TX = 320, TY = 330, GROUND = 440;
const REACTIONS = ['👍', '❤️', '👏', '🤔', '🙏', '🌱'];

const $ = q => document.querySelector(q);
function h(tag, props = {}, ...kids){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)){
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-')) el.setAttribute(k, String(v)); // aria states need the words "true" / "false"
    else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
function s(tag, attrs = {}, ...kids){
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}
const store = {
  get(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const look = p => ({animal:(CULTURES[p && p.culture] || CULTURES.world).animal, outfit:p && p.outfit});
const mini = p => h('span', {class:'mini', html:avatarSVG(look(p), true)});
let toastTimer = 0;
function toast(text, p){
  const el = $('#toast');
  el.replaceChildren(...[p ? mini(p) : null, h('span', {}, text)].filter(Boolean));
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 5200);
}

/* ---------- state ---------- */
let tree = {topic:'', roots:[], nodes:[], vines:[], overview:{common:[], disagreements:[]}, changes:[], newIds:[], enrichedIds:[]};
let rings = [], turns = [], convTopic = '', theme = 'general', treeVersion = -1, selected = null, viewing = -1, zoom = 1, view = 'tree';
let busy = false, timerLeft = 300, timerId = null, pending = null, listening = false, rec = null;
let ws = null, connected = false, retry = 0, myId = null, mySeat = null, members = [], audLang = '';
let roomId = null, roomRole = '', roomCreate = null, screen = 'splash';
let profile = store.get('hv-profile', null), auth = store.get('hv-auth', null), account = null, config = {};
let lobbyWS = null, lobby = {rooms:[], online:0, hot:[], bridged:[]}, themeFilter = '';
const people = {A:{lang:'yue', gesture:'wave'}, B:{lang:'en', gesture:'bow'}};
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const shown = () => viewing < 0 ? tree : rings[viewing].tree;
const solo = () => members.length <= 1;
const isSpeaker = () => mySeat === 'A' || mySeat === 'B';
const holder = seat => members.find(m => m.seat === seat);
const heldByOther = seat => members.some(m => m.seat === seat && m.id !== myId);
const otherSeat = seat => seat === 'A' ? 'B' : 'A';
const modalOpen = () => !$('#profile').hidden || !$('#account').hidden || !$('#interlude').hidden || !$('#summary').hidden;

/* ---------- opening / loading card with a saying about peace ---------- */
let quoteTimer = null;
function showInterlude(lead, button){
  clearInterval(quoteTimer);
  let i = Math.floor(Math.random() * QUOTES.length);
  const show = () => { const q = QUOTES[i++ % QUOTES.length]; $('#qText').textContent = q.text; $('#qMean').textContent = q.mean; $('#qSrc').textContent = q.src; };
  show(); quoteTimer = setInterval(show, 7000);
  $('#qLead').textContent = lead;
  const btn = $('#qBtn'); btn.hidden = !button; $('#qDots').hidden = !!button;
  if (button){ btn.textContent = button.text; btn.onclick = button.go; }
  $('#interlude').hidden = false; if (button) btn.focus();
}
function hideInterlude(){ clearInterval(quoteTimer); $('#interlude').hidden = true; }

/* ---------- character (profile, culture, wardrobe) ---------- */
const owned = () => new Set(['plain', 'olive', CULTURES[profile.culture].outfit, ...profile.unlocked]);
function newProfile(name){
  return {name:name || '', culture:'world', outfit:'olive', lang:'yue', gesture:'wave', unlocked:[], likes:[], stats:{said:0, heard:0, trees:0, bridges:0, hearts:0, met:[], heardFrom:{}, themes:{}}};
}
let saveTimer = 0;
function saveProfile(){
  store.set('hv-profile', profile);
  renderMe();
  if (roomId) sendHello();
  if (auth){ clearTimeout(saveTimer); saveTimer = setTimeout(() => api('/api/me', 'PUT', {profile}).catch(() => {}), 800); }
}
function unlock(id, why){
  if (!OUTFITS[id] || owned().has(id)) return;
  profile.unlocked.push(id);
  toast(`🎁 解鎖咗新服裝「${OUTFITS[id].name}」— ${why}`, {culture:profile.culture, outfit:id});
}
function checkMilestones(){
  for (const [id, o] of Object.entries(OUTFITS)){
    if (!o.how) continue;
    const v = o.how.stat === 'met' ? profile.stats.met.length : profile.stats[o.how.stat];
    if (v >= o.how.n) unlock(id, o.how.text);
  }
}
function howToGet(id){
  const o = OUTFITS[id];
  if (o.how){ const v = o.how.stat === 'met' ? profile.stats.met.length : profile.stats[o.how.stat]; return `${o.how.text}（${Math.min(v, o.how.n)}/${o.how.n}）`; }
  const c = Object.values(CULTURES).find(x => x.outfit === id);
  return c ? `同${c.name}嘅朋友傾偈` : '';
}
function renderMe(){
  $('#meBtn').hidden = $('#acctBtn').hidden = !profile || !profile.name;
  if (!profile) return;
  $('#meMini').innerHTML = avatarSVG(look(profile), true); $('#meName').textContent = profile.name;
}
function renderProfile(){
  const have = owned();
  $('#profPreview').innerHTML = avatarSVG(look(profile));
  const c = CULTURES[profile.culture];
  $('#profPet').textContent = `你嘅夥伴：${c.pet} · 著緊：${OUTFITS[profile.outfit].name} · 已有 ${have.size}/${Object.keys(OUTFITS).length} 套服裝`;
  $('#culturePicks').replaceChildren(...Object.entries(CULTURES).map(([k, v]) =>
    h('button', {class:'pick', type:'button', 'aria-pressed':profile.culture === k, onclick:() => {
      profile.culture = k; profile.outfit = v.outfit;
      if (!profile.touchedLang){ profile.lang = v.lang; $('#profLang').value = v.lang; }
      renderProfile();
    }}, mini({culture:k, outfit:v.outfit}), v.name, h('small', {}, v.pet))));
  const st = profile.stats;
  $('#profStats').textContent = `你嘅貢獻：講咗 ${st.said} 句 · 聽咗 ${st.heard} 句 · 種樹 ${st.trees} 次 · 搭橋 ${st.bridges} 道 · 收到 ${st.hearts} 個讚 · 識咗 ${st.met.length} 個文化`;
  $('#likePicks').replaceChildren(...Object.entries(THEMES).map(([k, t]) => h('button', {type:'button', 'aria-pressed':profile.likes.includes(k), onclick:() => {
    profile.likes = profile.likes.includes(k) ? profile.likes.filter(x => x !== k) : [...profile.likes, k]; renderProfile();
  }}, t.name)));
  $('#outfitPicks').replaceChildren(...Object.entries(OUTFITS).map(([k, o]) => {
    const ok = have.has(k);
    return h('button', {class:'pick' + (ok ? '' : ' locked'), type:'button', 'aria-pressed':profile.outfit === k, 'aria-disabled':!ok,
      onclick:() => { if (!ok) return toast('未解鎖：' + howToGet(k)); profile.outfit = k; renderProfile(); }},
      mini({culture:profile.culture, outfit:k}), o.name, ok ? null : h('small', {}, '🔒 ' + howToGet(k)));
  }));
}
function openProfile(first){
  if (!profile) profile = newProfile();
  $('#profTitle').textContent = first ? '歡迎！先整你嘅角色' : '我嘅角色';
  $('#profLead').textContent = first ? '呢個公仔會代表你同其他人傾偈。之後隨時可以改。' : '';
  $('#profClose').hidden = first; $('#profDone').textContent = first ? '入大堂' : '儲存';
  $('#profName').value = profile.name; $('#profLang').value = profile.lang; $('#profGest').value = profile.gesture;
  renderProfile(); $('#profile').hidden = false;
  if (first) $('#profName').focus();
}
function closeProfile(){
  const name = $('#profName').value.trim();
  if (!name){ $('#profName').focus(); return toast('請先打個名（花名都得）。'); }
  profile.name = name; profile.gesture = $('#profGest').value;
  $('#profile').hidden = true; saveProfile();
  if (screen === 'lobby') renderLobby(); // interests change what is recommended
  if (screen === 'splash') afterProfile();
  if (roomId && isSpeaker()) sendWS({type:'person', seat:mySeat, lang:profile.lang, gesture:profile.gesture});
}
$('#profDone').onclick = closeProfile;
$('#profClose').onclick = closeProfile;
$('#profLang').onchange = e => { profile.lang = e.target.value; profile.touchedLang = true; };
$('#meBtn').onclick = () => openProfile(false);

/* ---------- account: Google sign-in and friends ---------- */
async function api(path, method = 'GET', body){
  const res = await fetch(path, {method, headers:{'content-type':'application/json', ...(auth ? {authorization:'Bearer ' + auth.token} : {})}, body:body ? JSON.stringify(body) : undefined});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw {code:data.code || 'http'};
  return data;
}
const acctMsg = t => { $('#acctMsg').textContent = t; };
async function signIn(credential){
  try {
    const r = await api('/api/login', 'POST', {credential});
    auth = {token:r.token, uid:r.uid}; store.set('hv-auth', auth);
    if (r.profile){
      // same person on a new device: keep everything either side has earned
      const mine = profile || newProfile(), st = r.profile.stats;
      profile = {...mine, ...r.profile, unlocked:[...new Set([...mine.unlocked, ...r.profile.unlocked])],
        stats:{bridges:Math.max(mine.stats.bridges, st.bridges || 0), hearts:Math.max(mine.stats.hearts, st.hearts || 0), themes:{...mine.stats.themes, ...st.themes}, said:Math.max(mine.stats.said, st.said), heard:Math.max(mine.stats.heard, st.heard), trees:Math.max(mine.stats.trees, st.trees),
          met:[...new Set([...mine.stats.met, ...st.met])], heardFrom:{...mine.stats.heardFrom, ...st.heardFrom}}};
    } else if (!profile) profile = newProfile(r.name);
    saveProfile(); acctMsg('已登入，你嘅角色會自動儲存。');
    await refreshAccount();
    if (roomId && ws){ ws.onclose = connect; ws.close(); } // rejoin (after the old connection has gone) so others can add me as a friend
  } catch (e){ acctMsg(e.code === 'bad_login' ? 'Google 登入唔成功，請再試。' : '登入出咗問題，請再試。'); }
}
async function refreshAccount(){
  if (!auth){ account = null; return renderAccount(); }
  try { account = await api('/api/me'); }
  catch (e){ if (e.code === 'not_signed_in'){ auth = null; store.set('hv-auth', null); account = null; } }
  renderAccount(); renderSeats();
}
function friendRow(f, buttons){
  return h('li', {}, mini(f), h('div', {class:'who'}, h('b', {}, f.name),
    h('span', {class:'note small'}, f.at ? `傾緊：${f.at.topic}` : (CULTURES[f.culture] || CULTURES.world).name)), buttons);
}
function renderAccount(){
  $('#signedOut').hidden = !!auth; $('#signedIn').hidden = !auth;
  $('#noLogin').hidden = !!config.googleClientId;
  const n = account ? Object.keys(account.requests).length : 0;
  $('#acctBtn').textContent = n ? `好友同帳戶（${n}）` : '好友同帳戶';
  if (!auth || !account) return;
  $('#myCode').textContent = auth.uid;
  const reqs = Object.values(account.requests), friends = Object.values(account.friends);
  $('#reqBox').hidden = !reqs.length;
  $('#reqList').replaceChildren(...reqs.map(f => friendRow(f, [
    h('button', {class:'btn small pink', type:'button', onclick:() => friendCall('/api/friends/accept', f.uid, `你同 ${f.name} 已經係好友。`)}, '接受'),
    h('button', {class:'ghost', type:'button', onclick:() => friendCall('/api/friends/remove', f.uid, '')}, '拒絕')])));
  $('#friendList').replaceChildren(...(friends.length ? friends.map(f => friendRow(f, [
    f.at && f.at.room !== roomId ? h('button', {class:'btn small sky', type:'button', onclick:() => { $('#account').hidden = true; enterRoom(f.at.room, {role:'watch'}); }}, '入去旁聽') : null,
    h('button', {class:'ghost', type:'button', onclick:() => friendCall('/api/friends/remove', f.uid, '')}, '移除')]))
    : [h('li', {class:'note'}, '未有好友。同人傾完偈可以撳「加好友」，或者輸入對方嘅好友碼。')]));
}
async function friendCall(path, uid, okText){
  try { await api(path, 'POST', {uid}); if (okText) acctMsg(okText); await refreshAccount(); return true; }
  catch (e){ acctMsg(e.code === 'no_such_user' ? '搵唔到呢個好友碼。' : e.code === 'bad_request' ? '好友碼唔啱。' : '做唔到，請再試。'); return false; }
}
$('#acctBtn').onclick = () => { acctMsg(''); $('#account').hidden = false; refreshAccount(); };
$('#acctClose').onclick = () => { $('#account').hidden = true; };
$('#addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const uid = $('#addCode').value.trim().toLowerCase(); if (!uid) return;
  if (await friendCall('/api/friends', uid, '已送出好友邀請，等對方接受。')) $('#addCode').value = '';
});
$('#copyCode').onclick = () => navigator.clipboard.writeText(auth.uid).then(() => acctMsg('已複製好友碼。'), () => {});
$('#logoutBtn').onclick = async () => { await api('/api/logout', 'POST').catch(() => {}); auth = null; account = null; store.set('hv-auth', null); renderAccount(); acctMsg('已登出。'); };
function setupGoogle(){
  if (!config.googleClientId) return;
  document.head.append(h('script', {src:'https://accounts.google.com/gsi/client', async:true, onload:() => {
    google.accounts.id.initialize({client_id:config.googleClientId, callback:r => signIn(r.credential)});
    google.accounts.id.renderButton($('#gbtn'), {theme:'outline', size:'large', shape:'pill', text:'signin_with'});
  }}));
}

/* ---------- lobby ---------- */
function go(name){
  screen = name;
  $('#lobby').hidden = name !== 'lobby'; $('#room').hidden = name !== 'room';
  $('#copyLink').hidden = $('#backLobby').hidden = name !== 'room'; $('#conn').hidden = false;
  renderConn();
}
function renderConn(){
  const chip = $('#conn'), on = screen === 'room' ? connected : !!(lobbyWS && lobbyWS.readyState === 1);
  chip.className = 'chip' + (on ? ' ok' : ' off');
  chip.lastElementChild.textContent = !on ? '連接緊…' : screen === 'room' ? `已連接 · 房入面 ${members.length} 人` : `${lobby.online} 人在線`;
}
function connectLobby(){
  if (lobbyWS || screen !== 'lobby') return;
  const sock = lobbyWS = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/lobby');
  sock.onopen = renderConn;
  sock.onmessage = e => { lobby = {hot:[], bridged:[], ...JSON.parse(e.data)}; renderLobby(); renderConn(); };
  sock.onclose = () => { if (lobbyWS === sock){ lobbyWS = null; renderConn(); setTimeout(connectLobby, 2500); } };
}
function leaveLobby(){ if (lobbyWS){ const sock = lobbyWS; lobbyWS = null; sock.close(); } }
function seatMini(card){
  return card ? h('div', {style:'text-align:center'}, h('span', {class:'mini', html:avatarSVG(look(card))}), h('div', {class:'live', style:'position:static;display:inline-block'}, `${card.name} · ${(LANGS[card.lang] || {}).name || ''}`))
    : h('div', {style:'text-align:center'}, h('span', {class:'mini', html:avatarSVG({animal:'bear', empty:true})}), h('div', {class:'live', style:'position:static;display:inline-block'}, '空位'));
}
/* What to show first. Scored on: someone is waiting, a friend is there, they differ from me in language or culture,
   the themes I said I like, themes I have not tried, and topics where people built a bridge. Never on popularity or heat. */
function recommend(r){
  const why = [], other = r.A || r.B, friends = account ? account.friends : {};
  let score = 0;
  const add = (n, t) => { score += n; why.push(t); };
  if (!r.A || !r.B) add(3, '等緊對手');
  if ((r.uids || []).some(u => friends[u])) add(4, '好友喺度');
  if (other && other.lang !== profile.lang) add(2, '唔同語言');
  if (other && other.culture !== profile.culture) add(2, '唔同文化');
  if (profile.likes.includes(r.theme)) add(2, '你鍾意嘅類別');
  else if (!profile.stats.themes[r.theme]) add(1, '你未試過嘅類別');
  const br = lobby.bridged.find(x => x.topic === r.topic);
  if (br) add(Math.min(3, br.score), '有人喺呢題搭到橋');
  return {score, why};
}
const liked = k => profile.likes.includes(k) ? 0 : 1;
const waitingFor = topic => lobby.rooms.find(r => r.topic === topic && (!r.A || !r.B));
// a topic card joins the person already waiting on that question, so people gather instead of scattering
function openTopic(topic, k){ const r = waitingFor(topic); if (r) enterRoom(r.id); else createRoom(topic, k); }
function topicCard(k, q, tag, why){
  return h('article', {class:'rcard'}, h('div', {class:'thumb', html:sceneSVG(k)}, tag ? h('span', {class:'live'}, tag) : null),
    h('div', {class:'info'}, h('p', {class:'eyebrow'}, (THEMES[k] || {name:'自由傾'}).name), h('h3', {}, q), why ? h('p', {class:'note small'}, why) : null,
      h('div', {class:'row'}, h('button', {class:'btn small sky', type:'button', onclick:() => openTopic(q, k)}, waitingFor(q) ? '加入等緊嘅人' : '開房傾呢個'))));
}
function renderLobby(){
  $('#themeBar').replaceChildren(h('button', {type:'button', 'aria-pressed':!themeFilter, onclick:() => { themeFilter = ''; renderLobby(); }}, '全部'),
    ...Object.entries(THEMES).map(([k, t]) => h('button', {type:'button', 'aria-pressed':themeFilter === k, onclick:() => { themeFilter = k; renderLobby(); }}, t.name)));
  const pick = x => !themeFilter || x.theme === themeFilter;
  const hot = lobby.hot.filter(pick).sort((a, b) => liked(a.theme) - liked(b.theme));
  $('#hotBox').hidden = !hot.length;
  $('#hotCards').replaceChildren(...hot.map(x => topicCard(x.theme, x.q, '今日熱話', x.why)));
  const rooms = lobby.rooms.filter(pick).map(r => ({r, ...recommend(r)})).sort((a, b) => b.score - a.score);
  $('#roomCards').replaceChildren(...(rooms.length ? rooms.map(({r, why}) => {
    const free = !r.A || !r.B;
    return h('article', {class:'rcard'},
      h('div', {class:'thumb', html:sceneSVG(r.theme)}, h('span', {class:'live', style:'left:50%;transform:translateX(-50%)'}, free ? '等緊對手' : '傾緊'), h('div', {class:'seats'}, seatMini(r.A), seatMini(r.B))),
      h('div', {class:'info'}, h('p', {class:'eyebrow'}, (THEMES[r.theme] || {name:'自由傾'}).name + (r.watchers ? ` · ${r.watchers} 人旁聽` : '')), h('h3', {}, r.topic),
        why.length ? h('p', {class:'note small'}, '推薦原因：' + why.join(' · ')) : null,
        h('div', {class:'row'}, free ? h('button', {class:'btn small pink', type:'button', onclick:() => enterRoom(r.id)}, '加入對話') : null,
          h('button', {class:'btn small', type:'button', onclick:() => enterRoom(r.id, {role:'watch'})}, '旁聽'))));
  }) : [h('p', {class:'note'}, themeFilter ? '呢個類別暫時冇人開房。你可以喺下面開第一間。' : '而家未有公開嘅房。喺下面揀個題目開第一間，或者撳「隨機配對」。')]));
  // topic ideas: where bridges were built first, then starters, with the themes I like ahead of the rest
  const starters = Object.entries(THEMES).filter(([k]) => !themeFilter || k === themeFilter).sort((a, b) => liked(a[0]) - liked(b[0]))
    .flatMap(([k, t]) => t.q.slice(0, themeFilter ? 3 : liked(k) ? 1 : 2).map(q => [k, q, '']));
  const ideas = [...lobby.bridged.filter(pick).map(x => [x.theme, x.topic, '🌉 有人搭到橋']), ...starters].filter(([, q], i, all) => all.findIndex(y => y[1] === q) === i && !hot.some(x => x.q === q));
  $('#ideaCards').replaceChildren(...ideas.map(([k, q, tag]) => topicCard(k, q, tag)));
}
/* trees I took part in: a reason to come back is seeing that one has grown */
let myRooms = store.get('hv-rooms', []);
function renderMyTrees(){
  $('#myBox').hidden = !myRooms.length;
  $('#myCards').replaceChildren(...myRooms.map(r => h('article', {class:'rcard'},
    h('div', {class:'thumb', html:sceneSVG(r.theme)}, r.now > r.v ? h('span', {class:'live'}, '🌱 長咗新枝') : r.n ? h('span', {class:'live'}, `${r.n} 人喺度`) : null),
    h('div', {class:'info'}, h('p', {class:'eyebrow'}, (THEMES[r.theme] || {name:'自由傾'}).name), h('h3', {}, r.topic),
      h('div', {class:'row'}, h('button', {class:'btn small', type:'button', onclick:() => enterRoom(r.id)}, '返去睇'))))));
}
function showLobby(){
  go('lobby'); connectLobby(); renderLobby(); renderMyTrees();
  for (const r of myRooms) fetch('/api/room/' + r.id).then(x => x.json()).then(d => { r.now = d.treeVersion; r.n = d.n; renderMyTrees(); }).catch(() => {});
}
const newId = () => Math.random().toString(36).slice(2, 10);
function createRoom(topic, themeKey){ enterRoom(newId(), {create:{topic, theme:themeKey || '', open:$('#newOpen').checked}}); }
$('#newRoomForm').addEventListener('submit', e => { e.preventDefault(); const t = $('#newTopic').value.trim(); if (t){ $('#newTopic').value = ''; createRoom(t, themeFilter); } });
$('#matchBtn').onclick = () => {
  // prefer a waiting room whose speaker uses a different language from mine
  const waiting = lobby.rooms.filter(r => (!r.A || !r.B) && (r.A || r.B) && (!themeFilter || r.theme === themeFilter));
  const best = waiting.find(r => (r.A || r.B).lang !== profile.lang) || waiting[0];
  if (best) return enterRoom(best.id);
  const keys = themeFilter ? [themeFilter] : Object.keys(THEMES), k = keys[Math.floor(Math.random() * keys.length)], q = THEMES[k].q;
  $('#newOpen').checked = true; createRoom(q[Math.floor(Math.random() * q.length)], k);
  toast('暫時未有人等緊，幫你開咗一間公開房，有人入嚟就可以開始。');
};

/* ---------- room connection ---------- */
let micPrimed = false;
function enterRoom(id, opts = {}){
  roomId = id; roomRole = opts.role || ''; roomCreate = opts.create || null;
  if (new URLSearchParams(location.search).get('room') !== id) history.pushState(null, '', '?room=' + id);
  leaveLobby(); resetRoom(); go('room');
  showInterlude('入緊房…');
  setTimeout(() => { if (connected && myId) hideInterlude(); else enterWait = true; }, 1300);
  fetch('/api/warm').catch(() => {}); // wake the translation model so the first sentence is not slower
  // ask for the microphone now, during this click, so the first press of Space records at once
  if (!micPrimed && roomRole !== 'watch' && SR && navigator.mediaDevices){
    micPrimed = true;
    navigator.mediaDevices.getUserMedia({audio:true}).then(st => st.getTracks().forEach(t => t.stop()), () => micNote(MIC_BLOCKED));
  }
  connect();
}
let enterWait = false;
function resetRoom(){
  if (ws){ ws.onclose = null; ws.close(); ws = null; }
  if (listening){ listening = false; if (rec) try { rec.abort(); } catch {} rec = null; }
  connected = false; myId = mySeat = null; members = []; turns = []; treeVersion = -1; pending = null; busy = false; audLang = ''; enterWait = false;
  $('#civility').hidden = true; $('#changes').hidden = true; $('#langC').value = ''; micNote(''); msg(''); resetTimer();
  for (const p of ['A','B']){ $('#av' + p).dataset.key = ''; $('#bubble' + p).replaceChildren(); }
}
function leaveRoom(push){
  resetRoom(); roomId = null; hideInterlude();
  if (push) history.pushState(null, '', location.pathname);
  showLobby();
}
$('#backLobby').onclick = () => leaveRoom(true);
$('#homeLink').onclick = e => { e.preventDefault(); if (screen === 'room') leaveRoom(true); };
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('room');
  if (screen === 'splash') return;
  if (id && id !== roomId) enterRoom(id); else if (!id && roomId) leaveRoom(false);
});
function connect(){
  const q = new URLSearchParams(); if (roomRole) q.set('role', roomRole); if (auth) q.set('t', auth.token);
  const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + roomId + '?' + q);
  sock.onopen = () => { retry = 0; connected = true; renderRole(); };
  sock.onmessage = e => onMessage(JSON.parse(e.data));
  sock.onclose = () => { if (ws !== sock) return; connected = false; renderRole(); setTimeout(() => { if (ws === sock) connect(); }, Math.min(10000, 1000 * 2 ** retry++)); };
}
function sendWS(m){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function sendHello(){ sendWS({type:'hello', p:{name:profile.name, culture:profile.culture, outfit:profile.outfit}, lang:profile.lang, gesture:profile.gesture}); }
function onMessage(m){
  if (m.type === 'welcome'){
    myId = m.you.id; mySeat = m.you.seat;
    if (m.fresh && roomCreate) sendWS({type:'create', ...roomCreate});
    roomCreate = null;
    applyState(m.state); sendHello();
    if (mySeat === 'C' && !audLang){ audLang = profile.lang; $('#langC').value = audLang; } // listeners hear their own language by default
    if (audLang) sendWS({type:'audLang', lang:audLang});
    if (enterWait) hideInterlude();
  } else if (m.type === 'members'){
    members = m.members;
    const me = members.find(x => x.id === myId); if (me) mySeat = me.seat;
    renderRole(); renderSeats(); renderBubbles(); renderAudience();
  } else if (m.type === 'state') applyState(m.state);
  else if (m.type === 'turn') onTurn(m.turn);
  else if (m.type === 'status') onStatus(m.seat, m.status);
  else if (m.type === 'react') floatReaction(m.seat, m.e);
  else if (m.type === 'poke'){ toast(`${m.name} 想加你做好友。撳「好友同帳戶」睇下。`); refreshAccount(); }
  else if (m.type === 'growing') showInterlude('AI 整理緊論點，通常要半分鐘至一分鐘', {text:'收埋，喺背後繼續', go:hideInterlude});
  else if (m.type === 'growError'){ hideInterlude(); msg(errCopy({code:m.code})); }
  else if (m.type === 'summing') showInterlude('AI 整理緊今場對話嘅共同點同分歧');
  else if (m.type === 'summary'){ hideInterlude(); showSummary(m.sum); }
  else if (m.type === 'sumError'){ hideInterlude(); msg(errCopy({code:m.code})); }
  else if (m.type === 'bridge'){
    toast(m.score > 1 ? '🌉 你哋搭咗一道橋：雙方都聽明對方，亦都學到新嘢。' : '🌉 你哋搭咗一道橋：雙方有同感。');
    if (isSpeaker()){ profile.stats.bridges++; saveProfile(); }
  }
  else if (m.type === 'liked'){ toast(`❤ ${m.name} 送咗個讚俾你。`); profile.stats.hearts++; saveProfile(); }
}
function applyState(st){
  const first = treeVersion < 0, newTree = st.treeVersion !== treeVersion, grown = newTree && treeVersion >= 0 && st.tree.changes && st.tree.changes.length;
  tree = st.tree; rings = st.rings || []; turns = st.turns; convTopic = st.convTopic; treeVersion = st.treeVersion; theme = st.theme || 'general';
  for (const p of ['A','B']) Object.assign(people[p], st.people[p]);
  for (const p of ['A','B']){ $('#lang' + p).value = people[p].lang; $('#gest' + p).value = people[p].gesture; }
  if (newTree){
    viewing = -1; if (!first) hideInterlude(); $('#changes').hidden = true;
    if (grown){
      selected = tree.newIds[0] || tree.enrichedIds[0] || tree.changes[0].node;
      showChanges(); msg('論點樹長大咗。撳花蕾「搵人傾呢個」可以開始下一場對話。');
      if (isSpeaker()){ profile.stats.trees++; checkMilestones(); saveProfile(); }
    } else if (!tree.nodes.some(n => n.id === selected)) selected = (tree.nodes[1] || tree.nodes[0] || {}).id || null;
  }
  if (!turns.length) resetTimer();
  if (st.made){ // remember this tree so the lobby can show me when it grows
    myRooms = [{id:roomId, topic:tree.topic, theme, v:treeVersion}, ...myRooms.filter(x => x.id !== roomId)].slice(0, 6);
    store.set('hv-rooms', myRooms);
  }
  renderAll();
}
function onTurn(t){
  turns.push(t);
  if (!timerId) startTimer();
  const other = otherSeat(t.who);
  animate(other, 'listen');
  renderTalk();
  // who listens on this device: my seat, my audience language, or (when I'm alone) the other seat
  let lang = null, bubble = null;
  if (mySeat === 'C') lang = audLang;
  else if (mySeat !== t.who){ lang = people[mySeat].lang; bubble = mySeat; }
  else if (solo()){ lang = people[other].lang; bubble = other; }
  if (lang && lang !== t.lang && t.tr[lang]) speak(t.tr[lang], lang, bubble);
  reward(t);
  if (solo() && mySeat === t.who) sendWS({type:'seat', seat:other});
}
/* progress: sentences said and heard, and a gift outfit after really talking with someone from another culture */
function reward(t){
  if (!isSpeaker()) return;
  const st = profile.stats;
  if (t.who === mySeat){ st.said++; st.themes[theme] = (st.themes[theme] || 0) + 1; }
  else {
    st.heard++;
    const from = holder(t.who), c = from && from.p.culture;
    if (c && c !== profile.culture && CULTURES[c] && !st.met.includes(c)){
      st.heardFrom[c] = (st.heardFrom[c] || 0) + 1;
      if (st.heardFrom[c] >= 3){ st.met.push(c); unlock(CULTURES[c].outfit, `${from.p.name} 帶嚟嘅${CULTURES[c].name}禮物`); }
    }
  }
  checkMilestones(); saveProfile();
}
function onStatus(seat, status){
  const av = $('#av' + seat);
  if (status === 'recording'){ cloudBubble(seat); animate(seat, 'g-' + people[seat].gesture); av.classList.add('talking'); }
  else if (status === 'translating'){ cloudBubble(seat); av.classList.remove('talking'); }
  else { av.classList.remove('talking'); renderBubbles(); }
}
function floatReaction(seat, e){
  const el = h('span', {style:`left:${seat === 'A' ? 22 : seat === 'B' ? 72 : 44 + Math.random() * 8}%`}, e);
  $('#floaters').append(el); setTimeout(() => el.remove(), 1900);
  if (seat !== 'C') animate(seat, 'g-nod');
}
$('#reactBtns').replaceChildren(...REACTIONS.map(e => h('button', {type:'button', 'aria-label':'反應 ' + e, onclick:() => sendWS({type:'react', e})}, e)));

/* ---------- translation ---------- */
function targetLangs(src){
  const aud = members.filter(m => m.seat === 'C' && m.lang).map(m => m.lang);
  return [...new Set([people.A.lang, people.B.lang, ...aud].filter(c => c && c !== src))];
}
async function translateTurn(text, src, targets){
  const res = await fetch('/api/translate', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({text, src, targets, topic:convTopic})});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw {code:data.code || 'http'};
  return data;
}
function errCopy(e){
  if (e instanceof TypeError) return '連唔到伺服器，請檢查網絡。';
  return ({rate_limited:'AI 用得太密（免費版有次數限制），等一陣再試。', no_key:'網站仲未設定 AI key，請通知管理員。',
    ai_key:'網站嘅 AI key 唔啱或者失效，請通知管理員。', overloaded:'AI 服務而家太忙，請等一陣再試。',
    invalid_json:'AI 回覆格式唔啱，請再試一次。', timeout:'翻譯太耐冇回應，請再試一次。'})[e && e.code] || '連線出咗問題，請再試。';
}
function msg(t){ $('#stageMsg').textContent = t; }
// the same words apart from punctuation and spacing translate the same, so an early translation can be reused
const sameWords = (a, b) => a.replace(/[\s\p{P}]/gu, '') === b.replace(/[\s\p{P}]/gu, '');
async function send(text, viaVoice){
  text = (text || '').trim();
  if (!text || busy || pending || !isSpeaker()) return;
  if (!viaVoice) animate(mySeat, 'g-' + people[mySeat].gesture);
  if (!timerId) startTimer();
  const who = mySeat, src = people[who].lang, targets = targetLangs(src), t0 = viaVoice ? releasedAt : performance.now();
  busy = true; msg(''); setControls();
  cloudBubble(who); sendWS({type:'status', seat:who, status:'translating'});
  // reuse the translation started while the speaker was still talking, if it was for these words
  const ready = viaVoice && spec && sameWords(spec.text, text) && spec.key === src + '>' + targets.join(',') ? spec.promise : null;
  spec = null; clearTimeout(specTimer);
  try {
    const job = ready ? ready.catch(() => translateTurn(text, src, targets)) : translateTurn(text, src, targets);
    const res = await Promise.race([job, new Promise((_, no) => setTimeout(() => no({code:'timeout'}), 25000))]);
    if (res.attack && res.suggestion){ pending = {who, src, text, res}; showCivility(); renderBubbles(); sendWS({type:'status', seat:who, status:'idle'}); }
    else commit(who, src, text, res);
    micNote(`由放手到翻譯好：${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
  } catch (e){
    if (e && e.code === 'rate_limited') specPausedUntil = Date.now() + 60000; // save the free quota for real sentences
    const m = errCopy(e); msg(m); micNote(m); bubbleNote(who, '翻譯唔到', m); sendWS({type:'status', seat:who, status:'idle'});
  }
  finally { busy = false; setControls(); }
}
function commit(who, src, text, res){
  pending = null; $('#civility').hidden = true; $('#typeIn').value = '';
  sendWS({type:'turn', turn:{who, lang:src, text, tr:res.tr, tone:res.tone}});
}
let voices = [];
if ('speechSynthesis' in window){ const load = () => { voices = speechSynthesis.getVoices(); }; load(); speechSynthesis.addEventListener('voiceschanged', load); }
function speak(text, lang, who){
  if (!$('#ttsOn').checked || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text), code = LANGS[lang].tts.toLowerCase();
    u.lang = LANGS[lang].tts;
    const v = voices.find(x => x.lang.replace('_', '-').toLowerCase() === code) || voices.find(x => x.lang.toLowerCase().startsWith(code.slice(0, 2)));
    if (v) u.voice = v;
    const b = who && $('#bubble' + who);
    u.onstart = () => b && b.classList.add('playing');
    u.onend = u.onerror = () => b && b.classList.remove('playing');
    // Chrome can drop a sentence queued in the same tick as cancel(), so give it a moment when something is playing
    if (speechSynthesis.speaking || speechSynthesis.pending){ speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 90); }
    else speechSynthesis.speak(u);
  } catch {}
}
function showCivility(){ $('#suggText').textContent = '建議講法：' + pending.res.suggestion; $('#civility').hidden = false; }
/* closing summary: what we agree on, where we still differ (and that is fine), then a like and an honest check-in */
function showSummary(sum){
  const mine = sum[mySeat === 'C' ? audLang : people[mySeat].lang] || Object.values(sum)[0] || {common:[], differ:[]};
  const list = (items, none) => items.length ? h('ul', {}, items.map(x => h('li', {dir:'auto'}, x))) : h('p', {class:'muted'}, none);
  $('#sumTopic').textContent = convTopic;
  $('#sumBody').replaceChildren(
    h('div', {class:'ov'}, h('h4', {}, '我哋同意'), list(mine.common, '今次未搵到明確嘅共同點。')),
    h('div', {class:'ov'}, h('h4', {}, '仍然睇法唔同（咁都得）'), list(mine.differ, '今次冇明顯分歧。')));
  const partner = isSpeaker() && members.find(m => m.seat === otherSeat(mySeat) && m.id !== myId);
  $('#sumPair').hidden = !partner;
  if (partner){
    const btn = $('#likeBtn'); btn.disabled = false; btn.textContent = `❤ 送個讚俾 ${partner.p.name}`;
    $('#rateU').checked = $('#rateL').checked = false;
  }
  $('#summary').hidden = false;
}
$('#endBtn').onclick = () => { if (!turns.length){ msg('未有對話可以總結。'); return; } msg(''); sendWS({type:'end'}); };
$('#likeBtn').onclick = () => { sendWS({type:'like'}); $('#likeBtn').disabled = true; $('#likeBtn').textContent = '已送出 ❤'; };
$('#sumClose').onclick = () => {
  if (!$('#sumPair').hidden) sendWS({type:'rate', understood:$('#rateU').checked, learned:$('#rateL').checked});
  $('#summary').hidden = true;
};
$('#useSugg').onclick = () => { const t = pending.res.suggestion; pending = null; $('#civility').hidden = true; send(t); };
$('#sendAnyway').onclick = () => { const p = pending; commit(p.who, p.src, p.text, p.res); };
$('#cancelSugg').onclick = () => { pending = null; $('#civility').hidden = true; };

/* ---------- push to talk ---------- */
function micNote(t){ const el = $('#micNote'); el.textContent = t; el.hidden = !t; }
function setTalking(on, label){
  $('#micBtn').classList.toggle('on', on);
  $('#micLabel').textContent = label || (on ? '講緊…放手就送出' : '撳住講，或者撳一下開始');
  if (isSpeaker()) $('#av' + mySeat).classList.toggle('talking', on);
}
const MIC_BLOCKED = '瀏覽器冇俾咪權限。撳網址列左邊嘅圖示，將「麥克風」改做允許，再重新載入。';
const ANDROID = /Android/i.test(navigator.userAgent);
const CLOUD = '<svg class="cloud" viewBox="0 0 200 124" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M44 90 A20 20 0 0 1 36 52 A24 24 0 0 1 70 26 A30 30 0 0 1 124 22 A24 24 0 0 1 164 46 A22 22 0 0 1 162 88 Q103 98 44 90 Z"/><circle cx="92" cy="106" r="7"/><circle cx="82" cy="118" r="4"/><g class="cdots"><circle cx="82" cy="60" r="6"/><circle class="d2" cx="100" cy="60" r="6"/><circle class="d3" cx="118" cy="60" r="6"/></g></svg>';
let micError = '', heard = '', heardBefore = '', stopping = false, restarts = 0, pressAt = 0, latched = false, releasedAt = 0, spec = null, specTimer = 0, specPausedUntil = 0;
/* speculative translation: once the speaker pauses for 0.4 s, translate what has been heard so far.
   If the words are unchanged at release, that result is delivered at once; otherwise the final text is translated. */
function speculate(){
  clearTimeout(specTimer);
  specTimer = setTimeout(() => {
    const text = heard.trim();
    if (!listening || !text || Date.now() < specPausedUntil || (spec && (sameWords(spec.text, text) || !spec.done))) return;
    const src = people[mySeat].lang, targets = targetLangs(src);
    const sp = {text, key:src + '>' + targets.join(','), done:false};
    sp.promise = translateTurn(text, src, targets);
    sp.promise.catch(e => { if (e && e.code === 'rate_limited') specPausedUntil = Date.now() + 60000; }).finally(() => { sp.done = true; if (listening && !sameWords(heard.trim(), sp.text)) speculate(); });
    spec = sp;
  }, 400);
}
function cloudBubble(who){ const el = $('#bubble' + who); el.classList.add('recording'); el.innerHTML = CLOUD; }
function bubbleNote(who, label, t){
  const el = $('#bubble' + who); el.classList.remove('recording');
  el.replaceChildren(h('span', {class:'bub-label'}, label), h('span', {}, t));
}
function micFail(t){ micError = t; micNote(t); bubbleNote(mySeat, '錄唔到音', t); sendWS({type:'status', seat:mySeat, status:'idle'}); }
/* one recogniser session. Browsers end a session by themselves after a pause (always on Android),
   so while the speaker is still holding, the words so far are kept and a new session is started. */
function listenOnce(){
  try {
    const r = rec = new SR(); r.lang = LANGS[people[mySeat].lang].sr; r.interimResults = true; r.continuous = !ANDROID;
    r.onresult = e => {
      if (rec !== r) return;
      // Android repeats earlier words in every result, so only its latest result is the sentence
      const now = ANDROID ? e.results[e.results.length - 1][0].transcript : Array.from(e.results, x => x[0].transcript).join('');
      heard = heardBefore + now; speculate();
    };
    r.onerror = e => {
      if (rec !== r || e.error === 'aborted' || e.error === 'no-speech') return; // silence is not an error: keep waiting
      micFail(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? MIC_BLOCKED : e.error === 'network' ? '語音辨識連唔到網絡，請檢查網絡或者打字代替。' : '語音輸入出錯（' + e.error + '），請打字代替。');
    };
    r.onend = () => {
      if (rec !== r) return;
      if (listening && !stopping && !micError && restarts++ < 30){ heardBefore = heard; return listenOnce(); }
      finishListening();
    };
    r.start();
  } catch { rec = null; micFail('語音輸入開唔到，請打字代替。'); }
}
function startListening(){
  if (!connected) return micNote('連接緊伺服器，請等一陣。');
  if (!isSpeaker()) return micNote('觀眾唔可以講嘢，只可以聽。');
  if (busy) return micNote('翻譯緊上一句，請等一陣。');
  if (pending) return micNote('請先揀點樣處理上一句。');
  if (listening) return;
  listening = true; stopping = false; restarts = 0; micError = ''; heard = heardBefore = ''; rec = null; spec = null; clearTimeout(specTimer);
  animate(mySeat, 'g-' + people[mySeat].gesture); setTalking(true); micNote(''); cloudBubble(mySeat);
  sendWS({type:'status', seat:mySeat, status:'recording'});
  if ('speechSynthesis' in window) speechSynthesis.cancel(); // don't record the other side's translation being read out
  if (!SR) return micFail('呢個瀏覽器唔支援語音輸入（例如 Firefox）。請用 Chrome、Edge 或 Safari，或者打字代替。');
  listenOnce();
}
function stopListening(){
  if (!listening || stopping) return;
  stopping = true; releasedAt = performance.now();
  if (!rec || micError) return finishListening();
  // don't wait for the recogniser to wind down: take what it has heard after at most 0.5 s
  const r = rec; try { r.stop(); } catch {}
  setTimeout(() => { if (rec === r){ try { r.abort(); } catch {} finishListening(); } }, 500);
}
function finishListening(){
  if (!listening) return;
  listening = false; latched = false; rec = null; setTalking(false);
  if (micError) return;
  const t = heard.trim();
  if (t) send(t, true); else micFail('聽唔到你講咩，請再試一次。');
}
/* hold = talk while held, deliver on release; quick tap = start, tap again to deliver */
function pressDown(){
  if (listening) return stopListening(); // a press while recording always delivers, even if the last release was missed
  pressAt = performance.now(); latched = false; startListening();
}
function pressUp(){
  if (!listening || latched || stopping) return;
  if (performance.now() - pressAt < 350){ latched = true; setTalking(true, '錄緊音…再撳一下送出'); return; }
  stopListening();
}
// leaving the tab delivers what was said; a permission prompt or a click elsewhere must not cut the recording short
document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(); });
const isTyping = el => el && el.matches && el.matches('input:not([type=checkbox]),textarea,[contenteditable]');
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || screen !== 'room' || isTyping(e.target) || modalOpen()) return;
  e.preventDefault();
  if (e.target !== document.body && e.target.blur) e.target.blur();
  if (!e.repeat) pressDown();
});
document.addEventListener('keyup', e => { if (e.code === 'Space' && screen === 'room' && !isTyping(e.target) && !modalOpen()){ e.preventDefault(); pressUp(); } });
const mic = $('#micBtn');
mic.addEventListener('pointerdown', e => { e.preventDefault(); mic.setPointerCapture(e.pointerId); pressDown(); });
['pointerup','pointercancel'].forEach(t => mic.addEventListener(t, pressUp));
$('#typeForm').addEventListener('submit', e => { e.preventDefault(); send($('#typeIn').value); });

/* ---------- avatars on stage ---------- */
function seatLook(seat){
  const m = holder(seat);
  if (m) return {name:m.id === myId ? profile.name : m.p.name, ...look(m.id === myId ? profile : m.p)};
  return {name:solo() ? '（你扮對方）' : '空位', animal:'bear', empty:true};
}
function renderSeats(){
  for (const p of ['A','B']){
    const lk = seatLook(p), key = JSON.stringify(lk), el = $('#av' + p), m = holder(p);
    if (el.dataset.key !== key){ el.dataset.key = key; el.innerHTML = avatarSVG(lk); }
    $('#name' + p).textContent = lk.name;
    const can = auth && account && m && m.id !== myId && m.uid && !account.friends[m.uid];
    const btn = $('#friend' + p); btn.hidden = !can;
    if (can) btn.onclick = async () => { if (await friendCall('/api/friends', m.uid, '')){ sendWS({type:'poke', uid:m.uid}); toast(`已向 ${m.p.name} 送出好友邀請。`); btn.hidden = true; } else toast('送唔到好友邀請，請再試。'); };
  }
  if ($('#scene').dataset.key !== theme){ $('#scene').dataset.key = theme; $('#scene').innerHTML = sceneSVG(theme); }
  $('#themeChip').textContent = (THEMES[theme] || {name:'自由傾'}).name;
}
function animate(p, cls){
  const el = $('#av' + p);
  el.classList.remove('g-wave','g-bow','g-nod','listen');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1900);
}
for (const p of ['A','B']) $('#av' + p).onclick = () => animate(p, 'g-' + people[p].gesture);

/* ---------- conversation rendering ---------- */
function renderRole(){
  renderConn();
  $('#roleChip').textContent = !mySeat ? '入緊房…' : isSpeaker() ? `你係 ${mySeat}（${LANGS[people[mySeat].lang].name}）` : '你係觀眾';
  for (const p of ['A','B']){
    $('#p' + p).classList.toggle('active', mySeat === p);
    $('#turn' + p).setAttribute('aria-pressed', mySeat === p);
    $('#turn' + p).disabled = heldByOther(p);
    $('#lang' + p).disabled = $('#gest' + p).disabled = heldByOther(p);
  }
  $('#langC').disabled = mySeat !== 'C';
  $('#soloNote').hidden = !connected || !solo();
  $('#micBtn').disabled = !isSpeaker() || !connected;
  $('#typeIn').placeholder = isSpeaker() ? `以 ${mySeat}（${LANGS[people[mySeat].lang].name}）身份打字，Enter 送出` : '觀眾唔可以講嘢，只可以聽';
  setControls();
}
function setControls(){
  const can = isSpeaker() && connected && !busy;
  $('#typeIn').disabled = !isSpeaker();
  $('#typeForm').querySelector('button').disabled = !can;
  $('#growBtn').disabled = !connected;
}
function renderBubbles(){
  const last = turns[turns.length - 1];
  for (const p of ['A','B']){
    const el = $('#bubble' + p), lang = people[p].lang;
    if (listening && p === mySeat) continue; // keep my recording cloud while I'm still talking
    el.classList.remove('recording');
    if (!last){ el.replaceChildren(h('span', {class:'hint'}, p === mySeat ? '輪到你講' : heldByOther(p) ? '聽緊…' : '等緊朋友入嚟')); continue; }
    const txt = last.lang === lang ? last.text : last.tr[lang];
    const tone = last.tone[lang], heardIt = last.who !== p && last.lang !== lang && txt;
    el.replaceChildren(...[
      h('span', {class:'bub-label'}, last.who === p ? '我講' : '我聽到'),
      h('span', {}, h('span', {dir:'auto'}, txt || '（未有呢個語言嘅翻譯，下一句會用新語言）'), tone ? h('span', {class:'tone'}, tone) : null),
      heardIt ? h('button', {class:'ghost replay', type:'button', onclick:() => speak(txt, lang, p)}, '再聽一次') : null].filter(Boolean));
  }
}
function renderAudience(){
  const el = $('#audLine'), aud = members.filter(m => m.seat === 'C'), last = turns[turns.length - 1];
  if (mySeat === 'C'){
    if (!audLang){ el.textContent = '揀你聽嘅語言，每句會即時翻譯俾你。'; return; }
    const txt = last && (last.lang === audLang ? last.text : last.tr[audLang]);
    el.textContent = txt ? `聽到：${txt}` : '下一句開始會翻譯俾你。';
    return;
  }
  const names = [...new Set(aud.map(m => m.lang).filter(Boolean))].map(c => LANGS[c].name);
  el.textContent = aud.length ? `觀眾 ${aud.length} 人${names.length ? '（' + names.join('、') + '）' : ''}，每句會同時翻譯俾佢哋。`
    : '而家冇觀眾。第三個入嚟嘅人會做觀眾。';
}
function renderTranscript(){
  const ol = $('#transcript');
  if (!turns.length){ ol.replaceChildren(h('li', {class:'empty'}, '未有對話。撳住講嘢或者打字開始。')); return; }
  ol.replaceChildren(...turns.map(t => h('li', {class:'turn t-' + t.who},
    h('span', {class:'who'}, t.who),
    h('div', {class:'lines'},
      h('p', {class:'orig'}, h('span', {class:'lang'}, (LANGS[t.lang] || {}).name || t.lang), h('span', {dir:'auto'}, t.text),
        t.tone[t.lang] ? h('span', {class:'tone'}, t.tone[t.lang]) : null),
      Object.entries(t.tr).map(([c, x]) => h('p', {class:'tr'}, h('span', {class:'lang'}, (LANGS[c] || {}).name || c), h('span', {dir:'auto'}, x),
        t.tone[c] ? h('span', {class:'tone'}, t.tone[c]) : null))))));
  ol.scrollTop = ol.scrollHeight;
}
function renderTalk(){ renderBubbles(); renderTranscript(); renderAudience(); $('#convTopic').textContent = convTopic; }

/* ---------- timer ---------- */
function tick(){ const m = Math.max(0, timerLeft); $('#timer').textContent = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function startTimer(){
  clearInterval(timerId); timerLeft = 300; tick(); $('#extendRow').hidden = true;
  timerId = setInterval(() => { timerLeft--; tick(); if (timerLeft <= 0){ clearInterval(timerId); $('#extendRow').hidden = false; } }, 1000);
}
function resetTimer(){ clearInterval(timerId); timerId = null; timerLeft = 300; tick(); $('#extendRow').hidden = true; }
$('#extendBtn').onclick = startTimer;

/* ---------- growing the tree (done by the server, shown to everyone in the room) ---------- */
$('#growBtn').onclick = () => { if (!turns.length){ msg('未有對話可以種入。'); return; } msg(''); sendWS({type:'grow'}); };
function showChanges(){
  const box = $('#changes'), t = tree;
  if (!t.changes.length){ box.hidden = true; return; }
  const title = id => (t.nodes.find(n => n.id === id) || {}).title || id;
  box.replaceChildren(
    h('div', {class:'row', style:'justify-content:space-between'}, h('strong', {}, '今次對話令棵樹：'), h('button', {class:'ghost', type:'button', onclick:() => { box.hidden = true; }}, '收埋')),
    h('ul', {}, t.changes.map(c => h('li', {}, h('span', {class:'ctype'}, c.type),
      h('button', {class:'linklike', type:'button', onclick:() => select(c.node)}, title(c.node)), h('span', {class:'muted'}, '　' + c.reason)))));
  box.hidden = false;
}
function startFromBud(q){
  sendWS({type:'topic', convTopic:q}); pending = null; $('#civility').hidden = true;
  msg('新題目已設定，房入面每個人都會見到。');
  $('#stage').scrollIntoView({behavior:'smooth', block:'start'});
}
$('#newTopicBtn').onclick = () => { $('#topicForm').hidden = !$('#topicForm').hidden; if (!$('#topicForm').hidden) $('#topicIn').focus(); };
$('#topicForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#topicIn').value.trim(); if (!t) return;
  sendWS({type:'newTree', topic:t}); $('#topicIn').value = ''; $('#topicForm').hidden = true;
});

/* ---------- tree rendering ---------- */
function layout(t){
  const kids = {};
  t.nodes.forEach(n => (kids[n.parent || 'root'] = kids[n.parent || 'root'] || []).push(n));
  const sizeMemo = {};
  const size = id => sizeMemo[id] || (sizeMemo[id] = 1 + (kids[id] || []).reduce((a, c) => a + size(c.id), 0));
  const LEN = [0, 128, 92, 68], pos = {};
  const place = (pid, x, y, a0, a1, depth) => {
    const list = kids[pid] || [], total = list.reduce((a, c) => a + size(c.id), 0);
    let a = a0;
    for (const c of list){
      const span = (a1 - a0) * size(c.id) / total, ang = a + span / 2; a += span;
      const L = LEN[Math.min(depth, 3)], rad = ang * Math.PI / 180;
      const x2 = x + L * Math.sin(rad), y2 = y - L * Math.cos(rad);
      pos[c.id] = {x:x2, y:y2, ang, depth, px:x, py:y};
      place(c.id, x2, y2, ang - span / 2, ang + span / 2, depth + 1);
    }
  };
  place('root', TX, TY, -72, 72, 1);
  return pos;
}
function angleColors(t){
  const byId = Object.fromEntries(t.nodes.map(n => [n.id, n]));
  const pal = ['var(--a)','var(--b)','var(--c)','var(--leaf)','var(--peach)','var(--warn)'], top = {}, out = {};
  t.nodes.filter(n => !n.parent).forEach((n, i) => { top[n.id] = pal[i % pal.length]; });
  for (const n of t.nodes){ let x = n, g = 0; while (x.parent && byId[x.parent] && g++ < 10) x = byId[x.parent]; out[n.id] = top[x.id] || pal[0]; }
  return out;
}
const hash = str => [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
function renderTree(){
  const t = shown(), svg = $('#tree'), pos = layout(t), color = angleColors(t);
  const fresh = new Set(viewing < 0 ? (t.newIds || []) : []);
  $('#treeTopic').textContent = t.topic;
  const back = s('g'), vines = s('g'), deco = s('g'), dots = s('g'), labels = s('g');
  back.append(s('ellipse', {cx:TX, cy:GROUND + 6, rx:250, ry:16, class:'ground'}));
  (t.roots || []).forEach((r, i, all) => {
    const dx = (i - (all.length - 1) / 2) * 120;
    back.append(s('path', {d:`M${TX} ${GROUND} Q${TX + dx * 0.4} ${GROUND + 30} ${TX + dx} ${GROUND + 48}`, class:'root'}),
      s('text', {x:TX + dx, y:GROUND + 66, class:'root-label'}, r));
  });
  back.append(s('path', {d:`M${TX - 11} ${GROUND} Q${TX - 4} ${(GROUND + TY) / 2} ${TX - 3} ${TY} L${TX + 3} ${TY} Q${TX + 4} ${(GROUND + TY) / 2} ${TX + 11} ${GROUND} Z`, class:'trunk'}));
  for (const n of t.nodes){
    const p = pos[n.id]; if (!p) continue;
    const dx = p.x - p.px, dy = p.y - p.py, len = Math.hypot(dx, dy) || 1, bend = (hash(n.id) % 9 - 4) * 3;
    const cx = (p.x + p.px) / 2 - dy / len * bend, cy = (p.y + p.py) / 2 + dx / len * bend;
    const w = [0, 9, 6, 4][Math.min(p.depth, 3)] + Math.min(3, n.quotes.length * 0.7);
    back.append(s('path', {d:`M${p.px} ${p.py} Q${cx} ${cy} ${p.x} ${p.y}`, class:'branch', 'stroke-width':w}));
    const r = p.depth === 1 ? 12 : 9;
    n.quotes.slice(0, 4).forEach((q, i) => {
      const a = (p.ang + (i % 2 ? 1 : -1) * (48 + i * 14)) * Math.PI / 180, lx = p.x + (r + 7) * Math.sin(a), ly = p.y - (r + 7) * Math.cos(a);
      deco.append(s('ellipse', {cx:lx, cy:ly, rx:6.5, ry:3.3, class:'leaf', transform:`rotate(${p.ang + (i % 2 ? 55 : -55)} ${lx} ${ly})`}));
    });
    n.buds.forEach((b, i) => {
      const a = (p.ang + (i ? 24 : -24) * (n.buds.length > 1 ? 1 : 0)) * Math.PI / 180, bx = p.x + (r + 13) * Math.sin(a), by = p.y - (r + 13) * Math.cos(a);
      deco.append(s('circle', {cx:bx, cy:by, r:4.5, class:'bud'}, s('title', {}, b)));
    });
    dots.append(s('g', {class:'node' + (n.id === selected ? ' sel' : ''), tabindex:'0', role:'button', 'aria-label':n.title, 'data-id':n.id},
      fresh.has(n.id) ? s('circle', {cx:p.x, cy:p.y, r:r + 5, class:'halo'}) : null,
      s('circle', {cx:p.x, cy:p.y, r, class:'dot', style:`fill:${color[n.id]}`}),
      s('title', {}, n.summary || n.title)));
    labels.append(s('text', {x:Math.min(W - 46, Math.max(46, p.x)), y:p.y - r - 8, class:'label'}, n.title));
  }
  for (const v of t.vines || []){
    const a = pos[v.a], b = pos[v.b]; if (!a || !b) continue;
    vines.append(s('path', {d:`M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 40} ${b.x} ${b.y}`, class:'vine'}, s('title', {}, v.label)));
  }
  svg.replaceChildren(back, vines, deco, dots, labels);
  applyZoom();
}
function applyZoom(){
  const t = shown(), p = selected && layout(t)[selected];
  const cx = zoom > 1 && p ? p.x : W / 2, cy = zoom > 1 && p ? p.y : H / 2;
  const vw = W / zoom, vh = H / zoom;
  const x = Math.min(W - vw, Math.max(0, cx - vw / 2)), y = Math.min(H - vh, Math.max(0, cy - vh / 2));
  $('#tree').setAttribute('viewBox', `${x} ${y} ${vw} ${vh}`);
}
$('#tree').addEventListener('click', e => { const g = e.target.closest('.node'); if (g) select(g.getAttribute('data-id')); });
$('#tree').addEventListener('keydown', e => { const g = e.target.closest('.node'); if (g && e.key === 'Enter') select(g.getAttribute('data-id')); });
$('#zoomIn').onclick = () => { zoom = Math.min(2.6, zoom * 1.6); applyZoom(); };
$('#zoomOut').onclick = () => { zoom = Math.max(1, zoom / 1.6); if (zoom < 1.05) zoom = 1; applyZoom(); };
function select(id){
  selected = id; renderTree(); renderList(); renderCard();
  if (view === 'tree'){ const g = $(`#tree .node[data-id="${CSS.escape(id)}"]`); if (g) g.focus({preventScroll:true}); }
}
function renderList(){
  const t = shown(), kids = {};
  t.nodes.forEach(n => (kids[n.parent || 'root'] = kids[n.parent || 'root'] || []).push(n));
  const build = pid => (kids[pid] || []).length ? h('ul', {}, kids[pid].map(n => h('li', {},
    h('button', {class:'linklike' + (n.id === selected ? ' sel' : ''), type:'button', onclick:() => select(n.id)}, n.title),
    n.summary ? h('span', {class:'muted'}, '：' + n.summary) : null, build(n.id)))) : null;
  $('#treeList').replaceChildren(build('root') || h('p', {class:'muted'}, '未有論點。'));
}
function setView(v){
  view = v;
  $('#viewTree').setAttribute('aria-pressed', v === 'tree'); $('#viewList').setAttribute('aria-pressed', v === 'list');
  $('#tree').style.display = v === 'tree' ? '' : 'none'; $('#treeList').hidden = v !== 'list';
  $('#zoomIn').hidden = $('#zoomOut').hidden = v !== 'tree';
}
$('#viewTree').onclick = () => setView('tree');
$('#viewList').onclick = () => setView('list');
function renderCard(){
  const t = shown(), el = $('#nodeCard'), byId = Object.fromEntries(t.nodes.map(n => [n.id, n])), n = byId[selected];
  if (!n){ el.replaceChildren(h('p', {class:'muted'}, t.nodes.length ? '撳樹上任何一點，睇呢度傾過咩、仲有咩未解決。' : '呢棵樹仲係一粒種子。傾完第一場對話，撳「種入論點樹」佢就會開始生長。')); return; }
  const path = []; for (let x = n, g = 0; x && g < 10; x = byId[x.parent], g++) path.unshift(x.title);
  el.replaceChildren(...[
    h('p', {class:'path'}, [t.topic, ...path].join(' → ')),
    h('h3', {}, n.title, n.angle ? h('span', {class:'angle'}, n.angle) : null),
    n.summary ? h('p', {}, n.summary) : null,
    n.quotes.length ? h('div', {class:'blk'}, h('h4', {}, '葉 · 大家講過'), h('ul', {class:'quotes'}, n.quotes.map(q => h('li', {}, '「' + q + '」')))) : null,
    n.discovery ? h('div', {class:'blk'}, h('h4', {}, '花 · 新發現'), h('p', {}, n.discovery)) : null,
    n.disagreement ? h('div', {class:'blk'}, h('h4', {}, '仍有分歧'), h('p', {}, n.disagreement)) : null,
    n.buds.length ? h('div', {class:'blk'}, h('h4', {}, '花蕾 · 未探索嘅問題'), h('ul', {class:'buds'}, n.buds.map(b => h('li', {},
      h('span', {}, b), h('button', {class:'btn small sky', type:'button', onclick:() => startFromBud(b)}, '搵人傾呢個'))))) : null].filter(Boolean));
}
function renderOverview(){
  const ov = shown().overview || {common:[], disagreements:[]};
  $('#overview').replaceChildren(
    h('div', {class:'ov'}, h('h4', {}, '共同點'), ov.common.length ? h('ul', {}, ov.common.map(c => h('li', {}, c))) : h('p', {class:'muted'}, '未有。')),
    h('div', {class:'ov'}, h('h4', {}, '分歧點'), ov.disagreements.length ? h('ul', {}, ov.disagreements.map(d => h('li', {}, d.type ? h('span', {class:'dtype'}, d.type) : null, d.text))) : h('p', {class:'muted'}, '未有。')));
}
function renderRings(){
  const box = $('#ringChips');
  box.replaceChildren(...rings.map((r, i) => h('button', {class:'ghost', type:'button', 'aria-pressed':viewing === i, onclick:() => { viewing = i; renderAll(); }}, `第 ${i + 1} 圈`)),
    h('button', {class:'ghost', type:'button', 'aria-pressed':viewing < 0, onclick:() => { viewing = -1; renderAll(); }}, '而家'));
}
function renderAll(){
  if (selected && !shown().nodes.some(n => n.id === selected)) selected = null;
  renderTree(); renderList(); renderCard(); renderOverview(); renderRings(); renderTalk(); renderRole(); renderSeats();
}

/* ---------- controls & start ---------- */
function fillSelect(id, obj, value){ const el = $(id); for (const [k, v] of Object.entries(obj)) el.append(h('option', {value:k}, typeof v === 'string' ? v : v.name)); el.value = value; }
fillSelect('#langA', LANGS, people.A.lang); fillSelect('#langB', LANGS, people.B.lang); fillSelect('#langC', LANGS, '');
fillSelect('#gestA', GESTURES, people.A.gesture); fillSelect('#gestB', GESTURES, people.B.gesture);
fillSelect('#profLang', LANGS, 'yue'); fillSelect('#profGest', GESTURES, 'wave');
for (const p of ['A','B']){
  $('#lang' + p).onchange = e => sendWS({type:'person', seat:p, lang:e.target.value});
  $('#gest' + p).onchange = e => { animate(p, 'g-' + e.target.value); sendWS({type:'person', seat:p, gesture:e.target.value}); };
  $('#turn' + p).onclick = () => sendWS({type:'seat', seat:p});
}
$('#langC').onchange = e => { audLang = e.target.value; sendWS({type:'audLang', lang:audLang}); renderAudience(); };
$('#copyLink').onclick = async () => {
  const btn = $('#copyLink');
  try { await navigator.clipboard.writeText(location.href); btn.textContent = '已複製'; }
  catch { msg('請手動複製呢條連結：' + location.href); }
  setTimeout(() => { btn.textContent = '複製邀請連結'; }, 2000);
};
setView('tree');

/* after the opening card: first-time visitors make a character, then everyone lands in the lobby or the invited room */
function afterProfile(){
  const id = new URLSearchParams(location.search).get('room');
  if (id && /^[A-Za-z0-9_-]{1,40}$/.test(id)) return enterRoom(id);
  if (id) history.replaceState(null, '', location.pathname);
  showLobby();
}
function begin(){
  hideInterlude();
  // this click also lets the browser read translations aloud later
  if ('speechSynthesis' in window) try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {}
  if (!profile || !profile.name) return openProfile(true);
  afterProfile();
}
showInterlude('HarmonyVoice · 載入緊');
if (profile) profile = {...newProfile(), ...profile, stats:{...newProfile().stats, ...profile.stats}};
renderMe();
Promise.all([fetch('/api/config').then(r => r.json()).catch(() => ({})), new Promise(r => setTimeout(r, 1200))]).then(([c]) => {
  config = c; setupGoogle(); refreshAccount();
  showInterlude('HarmonyVoice · 跨語言傾偈，以和為貴', {text:new URLSearchParams(location.search).get('room') ? '入房' : '開始', go:begin});
});
