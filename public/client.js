'use strict';

// ---------- アイテム表示定義（サーバーと対応） ----------
const ITEM_META = {
  sword:    { name: '剣',           icon: '🗡️', kind: 'attack', desc: '攻撃 8' },
  shuriken: { name: '手裏剣',       icon: '✴️', kind: 'attack', desc: '攻撃 12' },
  axe:      { name: '斧',           icon: '🪓', kind: 'attack', desc: '攻撃 16' },
  bomb:     { name: '爆弾',         icon: '💣', kind: 'attack', desc: '攻撃 22' },
  thunder:  { name: '神の雷',       icon: '⚡', kind: 'attack', desc: '攻撃 28' },
  dragon:   { name: '竜の炎',       icon: '🐉', kind: 'attack', desc: '攻撃 36' },
  meteor:   { name: '隕石',         icon: '☄️', kind: 'attack', desc: '攻撃 50' },
  shield:   { name: '盾',           icon: '🛡️', kind: 'shield', desc: 'シールド +12' },
  wall:     { name: '聖なる壁',     icon: '🧱', kind: 'shield', desc: 'シールド +25' },
  mirror:   { name: '鏡',           icon: '🪞', kind: 'mirror', desc: '次の攻撃を反射' },
  herb:     { name: '薬草',         icon: '🌿', kind: 'heal',   desc: '回復 12' },
  potion:   { name: '回復薬',       icon: '🧪', kind: 'heal',   desc: '回復 22' },
  prayer:   { name: '天使の祈り',   icon: '👼', kind: 'heal',   desc: '回復 35' },
  poison:   { name: '毒りんご',     icon: '🍎', kind: 'poison', desc: '毒 3×5回' },
  voodoo:   { name: '呪いの藁人形', icon: '🪆', kind: 'drain',  desc: 'HP吸収 12' },
};
const KIND_CLASS = { attack: 'atk-card', shield: 'def-card', mirror: 'def-card', heal: 'heal-card', poison: 'sp-card', drain: 'sp-card' };
const ITEM_LIFETIME = 25000;

// ---------- 状態 ----------
let ws = null;
let selfId = null;
let hostId = null;
let roomState = 'lobby';
let players = [];
let hand = [];
let cands = [];        // 入力中の候補札 [{id, matcher}] — 打ち始めた文字で自動絞り込み
let typingStart = 0;
let lastProgressSent = 0;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const screens = { lobby: $('screen-lobby'), room: $('screen-room'), game: $('screen-game') };

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
}

// ---------- WebSocket ----------
function connect(onOpen) {
  if (ws && ws.readyState === 1) { onOpen(); return; }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = onOpen;
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    if (roomState !== 'lobby-screen') {
      $('lobby-error').textContent = 'サーバーとの接続が切れちゃった。リロードしてね';
      showScreen('lobby');
      $('overlay-over').classList.add('hidden');
    }
  };
}

function sendMsg(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handleMessage(msg) {
  switch (msg.t) {
    case 'err':
      $('lobby-error').textContent = msg.msg;
      break;
    case 'joined':
      selfId = msg.selfId;
      hostId = msg.hostId;
      $('room-code').textContent = msg.code;
      history.replaceState(null, '', `${location.pathname}?room=${msg.code}`);
      showScreen('room');
      break;
    case 'room':
      hostId = msg.hostId;
      roomState = msg.state;
      renderRoomList(msg.players);
      break;
    case 'start':
      $('overlay-over').classList.add('hidden');
      $('battle-log').innerHTML = '';
      cands = [];
      typingStart = 0;
      showScreen('game');
      break;
    case 'count': {
      const overlay = $('countdown');
      const num = $('count-num');
      overlay.classList.remove('hidden');
      num.textContent = msg.n > 0 ? msg.n : '🍣 勝負!';
      num.classList.remove('pop');
      void num.offsetWidth; // アニメ再発火
      num.classList.add('pop');
      if (msg.n === 0) setTimeout(() => overlay.classList.add('hidden'), 900);
      break;
    }
    case 'state':
      players = msg.players;
      hand = msg.hand;
      onStateUpdate();
      break;
    case 'log':
      addLog(msg.text, msg.cls);
      break;
    case 'fx':
      handleFx(msg);
      break;
    case 'tp': {
      const bar = document.querySelector(`#pcard-${msg.id} .tpbar .fill`);
      if (bar) bar.style.width = (msg.p * 100) + '%';
      break;
    }
    case 'expired':
      addLog('🍽️ 皿が流れた…もたもたしてるからだよ', 'sys');
      break;
    case 'over':
      showOver(msg);
      break;
    case 'toRoom':
      $('overlay-over').classList.add('hidden');
      $('countdown').classList.add('hidden');
      showScreen('room');
      break;
  }
}

// ---------- ロビー / 待機部屋 ----------
$('btn-create').onclick = () => {
  const name = $('name-input').value.trim();
  if (!name) { $('lobby-error').textContent = 'なまえくらい入れなよ'; return; }
  $('lobby-error').textContent = '';
  connect(() => sendMsg({ t: 'create', name }));
};

$('btn-join').onclick = () => {
  const name = $('name-input').value.trim();
  const code = $('code-input').value.trim().toUpperCase();
  if (!name) { $('lobby-error').textContent = 'なまえくらい入れなよ'; return; }
  if (code.length !== 4) { $('lobby-error').textContent = '部屋コードは4文字だってば'; return; }
  $('lobby-error').textContent = '';
  connect(() => sendMsg({ t: 'join', name, code }));
};

$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('name-input').addEventListener('keydown', (e) => {
  // 招待リンク等でコードが入っていれば Enter は「参加」扱い
  if (e.key === 'Enter') ($('code-input').value.trim() ? $('btn-join') : $('btn-create')).click();
});

// 招待リンクのコピー
$('btn-copy').onclick = () => {
  const url = `${location.origin}${location.pathname}?room=${$('room-code').textContent}`;
  const fallbackCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
  const btn = $('btn-copy');
  btn.textContent = '✅ コピーした!';
  setTimeout(() => { btn.textContent = '🔗 招待リンクをコピー'; }, 1500);
};

// ?room=XXXX 付きで開いたらコードを自動入力
{
  const qRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
  if (qRoom) {
    $('code-input').value = qRoom;
    const note = $('invite-note');
    note.textContent = `🔗 部屋「${qRoom}」に招待されてるよ。なまえを入れて Enter で参加!`;
    note.classList.remove('hidden');
    $('name-input').focus();
  }
}

$('btn-start').onclick = () => sendMsg({ t: 'start' });
$('btn-restart').onclick = () => sendMsg({ t: 'restart' });

function renderRoomList(list) {
  const ul = $('room-players');
  ul.innerHTML = '';
  const isHost = selfId === hostId;
  for (const p of list) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${p.id === hostId ? '👑 ' : '🍣 '}${p.name}` +
      `${p.id === selfId ? ' (あなた)' : ''}${p.connected ? '' : ' (切断)'}`;
    li.appendChild(label);
    if (isHost && p.id !== selfId && p.connected) {
      const btn = document.createElement('button');
      btn.className = 'btn-mini';
      btn.textContent = '👑 ホストにする';
      btn.onclick = () => sendMsg({ t: 'makeHost', id: p.id });
      li.appendChild(btn);
    }
    ul.appendChild(li);
  }
  $('btn-start').classList.toggle('hidden', !isHost);
  $('room-wait').classList.toggle('hidden', isHost);
  $('btn-restart').classList.toggle('hidden', !isHost);
  $('over-wait').classList.toggle('hidden', isHost);
}

// ---------- ゲーム描画 ----------
function onStateUpdate() {
  renderPlayers();
  if (typingStart) {
    // 入力中: 手札に残っている候補だけ引き継ぐ（使用済み/流れた札は外す）
    const alive = cands.filter(c => hand.some(it => it.id === c.id));
    if (alive.length > 0) {
      cands = alive;
    } else {
      resetCands();
    }
  } else {
    resetCands();
  }
  renderHand();
}

// 全札を候補にリセット（未入力状態へ）
function resetCands() {
  if (typingStart) sendMsg({ t: 'progress', p: 0 });
  cands = hand.map(it => ({ id: it.id, matcher: new TypingMatcher(it.word) }));
  typingStart = 0;
}

// 1〜3キーやクリックで1枚に固定
function lockCard(id) {
  const it = hand.find(x => x.id === id);
  if (!it) return;
  if (typingStart) sendMsg({ t: 'progress', p: 0 });
  cands = [{ id, matcher: new TypingMatcher(it.word) }];
  typingStart = 0;
  renderHand();
}

function me() { return players.find(p => p.id === selfId); }

function renderPlayers() {
  const wrap = $('players');
  // 差分描画は面倒なので作り直し（人数少ないので十分）
  const progressCache = {};
  wrap.querySelectorAll('.pcard').forEach(el => {
    const bar = el.querySelector('.tpbar .fill');
    if (bar) progressCache[el.dataset.pid] = bar.style.width;
  });
  wrap.innerHTML = '';
  for (const p of players) {
    const card = document.createElement('div');
    card.className = 'pcard';
    card.id = `pcard-${p.id}`;
    card.dataset.pid = p.id;
    if (p.id === selfId) card.classList.add('self');
    if (!p.alive) card.classList.add('dead');

    const ratio = p.hp / p.maxHp;
    const hpClass = ratio <= .25 ? 'critical' : ratio <= .5 ? 'low' : '';
    const status = [
      p.shield > 0 ? `🛡️${p.shield}` : '',
      p.mirror ? '🪞' : '',
      p.poison > 0 ? `🍎毒${p.poison}` : '',
    ].filter(Boolean).join(' ');

    card.innerHTML = `
      <div class="pname"><span>${p.id === selfId ? '⭐' : ''}${escapeHtml(p.name)}</span><span>${p.alive ? '' : '💀'}</span></div>
      <div class="hpbar"><div class="fill ${hpClass}" style="width:${ratio * 100}%"></div></div>
      <div class="hptext">HP ${p.hp}/${p.maxHp}</div>
      <div class="pstatus">${status}</div>
      <div class="tpbar"><div class="fill" style="width:${progressCache[p.id] || '0%'}"></div></div>
    `;
    wrap.appendChild(card);
  }
}

function renderHand() {
  const wrap = $('hand');
  wrap.innerHTML = '';
  const candIds = new Set(cands.map(c => c.id));
  // 入力中 or 固定中（候補が絞られている）のときだけハイライト
  const highlight = typingStart > 0 || cands.length < hand.length;
  hand.forEach((it, i) => {
    const meta = ITEM_META[it.key];
    const card = document.createElement('div');
    card.className = `card ${KIND_CLASS[meta.kind]}`;
    if (highlight && candIds.has(it.id)) card.classList.add('selected');
    const lifeRatio = Math.max(0, (it.expiresAt - Date.now()) / ITEM_LIFETIME);
    card.innerHTML = `
      <div class="key-hint">${i + 1}</div>
      <div class="icon">${meta.icon}</div>
      <div class="iname">${meta.name}</div>
      <div class="effect">${meta.desc}</div>
      <div class="word">${it.word}</div>
      <div class="life"><div class="fill" style="width:${lifeRatio * 100}%"></div></div>
    `;
    card.onclick = () => lockCard(it.id);
    wrap.appendChild(card);
  });
  renderTyping();
}

function renderTyping() {
  const lead = cands[0];
  const it = lead && hand.find(x => x.id === lead.id);
  const active = it && (typingStart > 0 || cands.length < hand.length);
  if (!active) {
    $('typing-word').textContent = '打ちたい札の単語を そのまま打ちはじめて!';
    $('typing-word').classList.add('placeholder');
    $('typing-romaji').innerHTML = '';
    $('t-icon').textContent = '🍣';
    $('t-name').textContent = '';
    $('t-effect').textContent = '';
    return;
  }
  const meta = ITEM_META[it.key];
  $('t-icon').textContent = meta.icon;
  $('t-name').textContent = meta.name;
  $('t-effect').textContent = cands.length > 1 ? `候補 ${cands.length}枚` : meta.desc;
  $('typing-word').classList.remove('placeholder');
  $('typing-word').textContent = it.word;
  $('typing-romaji').innerHTML =
    `<span class="done">${lead.matcher.typedPart()}</span><span class="rest">${lead.matcher.hint()}</span>`;
}

// 打ち切り時の「発動!」ハンコ
function showStamp() {
  const s = $('stamp');
  s.classList.remove('hidden', 'show');
  void s.offsetWidth; // アニメ再発火
  s.classList.add('show');
  setTimeout(() => s.classList.add('hidden'), 620);
}

// 皿の残り時間ゲージをなめらかに更新
setInterval(() => {
  if (roomState !== 'playing' && screens.game.classList.contains('hidden')) return;
  document.querySelectorAll('#hand .card').forEach((card, i) => {
    const it = hand[i];
    if (!it) return;
    const fill = card.querySelector('.life .fill');
    if (fill) fill.style.width = Math.max(0, (it.expiresAt - Date.now()) / ITEM_LIFETIME * 100) + '%';
  });
}, 500);

// ---------- タイピング入力 ----------
document.addEventListener('keydown', (e) => {
  if (screens.game.classList.contains('hidden')) return;
  const self = me();
  if (!self || !self.alive) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  if (e.key >= '1' && e.key <= '3') {
    const it = hand[Number(e.key) - 1];
    if (it) lockCard(it.id);
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') {
    resetCands();
    renderHand();
    return;
  }
  if (!/^[a-z-]$/.test(e.key)) return;
  e.preventDefault();
  if (cands.length === 0) resetCands();

  // 全候補にキーを流し、受け付けた札だけ残す
  const survivors = [];
  let winner = null;
  for (const c of cands) {
    const r = c.matcher.input(e.key);
    if (r === 'miss') continue;
    survivors.push(c);
    if (r === 'done') winner = c;
  }

  if (survivors.length === 0) {
    // どの札も受け付けない = ただのタイポ。候補は維持
    const area = $('typing-area');
    area.classList.remove('miss');
    void area.offsetWidth; // アニメ再発火
    area.classList.add('miss');
    return;
  }

  if (!typingStart) typingStart = performance.now();
  cands = survivors;

  if (winner) {
    const m = winner.matcher;
    const elapsed = Math.max(0.3, (performance.now() - typingStart) / 1000);
    const kps = m.typedCount / elapsed;
    const mult = Math.min(1.5, Math.max(0.8, 0.7 + kps / 6 - m.missCount * 0.03));
    showStamp();
    sendMsg({ t: 'use', itemId: winner.id, targetId: null, mult: Math.round(mult * 100) / 100 });
    sendMsg({ t: 'progress', p: 0 });
    cands = [];
    typingStart = 0;
    renderTyping();
    return;
  }

  renderHand();
  const now = performance.now();
  if (now - lastProgressSent > 150) {
    lastProgressSent = now;
    sendMsg({ t: 'progress', p: cands[0].matcher.progress() });
  }
});

// ---------- 演出 ----------
// アイコンが攻撃元から対象まで飛んでいく
function flyIcon(fromId, toId, icon, onArrive) {
  const fromEl = $(`pcard-${fromId}`);
  const toEl = $(`pcard-${toId}`);
  if (!fromEl || !toEl || fromId === toId) { onArrive(); return; }
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'projectile';
  el.textContent = icon;
  el.style.left = (a.left + a.width / 2) + 'px';
  el.style.top = (a.top + a.height / 2) + 'px';
  document.body.appendChild(el);
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(.7) rotate(0deg)', opacity: .9 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.35) rotate(300deg)`, opacity: 1 },
  ], { duration: 420, easing: 'cubic-bezier(.25,.6,.35,1)' });
  anim.onfinish = () => { el.remove(); onArrive(); };
}

function hitShake(card, text, color) {
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
  floatText(card, text, color);
}

function handleFx(msg) {
  const card = $(`pcard-${msg.to}`);
  if (!card) return;
  switch (msg.kind) {
    case 'hit':
      flyIcon(msg.from, msg.to, msg.icon || '💥', () => {
        const c = $(`pcard-${msg.to}`);
        if (c) hitShake(c, `-${msg.val}`, 'var(--shu)');
      });
      break;
    case 'block':
      floatText(card, `🛡️-${msg.val}`, 'var(--ai)');
      break;
    case 'heal':
      floatText(card, `+${msg.val}`, 'var(--midori)');
      break;
    case 'shield':
      floatText(card, `🛡️+${msg.val}`, 'var(--ai)');
      break;
    case 'poison':
      if (msg.from != null) {
        // 毒りんご投擲
        flyIcon(msg.from, msg.to, msg.icon || '🍎', () => {
          const c = $(`pcard-${msg.to}`);
          if (c) hitShake(c, '☠️ 毒!', 'var(--murasaki)');
        });
      } else {
        floatText(card, `☠️-${msg.val}`, 'var(--murasaki)');
      }
      break;
    case 'mirror':
      floatText(card, '🪞 反射!', 'var(--murasaki)');
      break;
  }
}

function floatText(card, text, color) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.color = color;
  card.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function addLog(text, cls) {
  const log = $('battle-log');
  const div = document.createElement('div');
  div.className = cls || '';
  div.textContent = text;
  log.appendChild(div);
  while (log.children.length > 100) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function showOver(msg) {
  const overlay = $('overlay-over');
  overlay.classList.remove('hidden');
  if (msg.winnerId === selfId) {
    $('over-title').textContent = '🏆 勝利!';
    $('over-sub').textContent = 'ふーん、やるじゃん。まぐれでしょ?';
  } else if (msg.winnerId === null) {
    $('over-title').textContent = '🤝 相打ち';
    $('over-sub').textContent = '全員倒れるとか…逆にすごいね';
  } else {
    $('over-title').textContent = '💀 敗北…';
    $('over-sub').textContent = `${msg.winnerName} の勝ち。次は頑張りなよ`;
  }
  const isHost = selfId === hostId;
  $('btn-restart').classList.toggle('hidden', !isHost);
  $('over-wait').classList.toggle('hidden', isHost);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
