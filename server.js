// 寿司打×ゴッドフィールド風 タイピングバトル サーバー
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(PUB, path.normalize(p).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- ゲームデータ ----------
const MAX_HP = 100;
const HAND_SIZE = 3;
const ITEM_LIFETIME = 25000; // 皿が流れるまで(ms)

const ITEMS = [
  { key: 'sword',    name: '剣',           kind: 'attack', power: 8,  tier: 1, weight: 14, icon: '🗡️' },
  { key: 'shuriken', name: '手裏剣',       kind: 'attack', power: 12, tier: 1, weight: 12, icon: '✴️' },
  { key: 'axe',      name: '斧',           kind: 'attack', power: 16, tier: 2, weight: 10, icon: '🪓' },
  { key: 'bomb',     name: '爆弾',         kind: 'attack', power: 22, tier: 2, weight: 8,  icon: '💣' },
  { key: 'thunder',  name: '神の雷',       kind: 'attack', power: 28, tier: 3, weight: 6,  icon: '⚡' },
  { key: 'dragon',   name: '竜の炎',       kind: 'attack', power: 36, tier: 3, weight: 4,  icon: '🐉' },
  { key: 'meteor',   name: '隕石',         kind: 'attack', power: 50, tier: 3, weight: 2,  icon: '☄️' },
  { key: 'shield',   name: '盾',           kind: 'shield', power: 12, tier: 1, weight: 10, icon: '🛡️' },
  { key: 'wall',     name: '聖なる壁',     kind: 'shield', power: 25, tier: 2, weight: 6,  icon: '🧱' },
  { key: 'mirror',   name: '鏡',           kind: 'mirror', power: 0,  tier: 2, weight: 5,  icon: '🪞' },
  { key: 'herb',     name: '薬草',         kind: 'heal',   power: 12, tier: 1, weight: 9,  icon: '🌿' },
  { key: 'potion',   name: '回復薬',       kind: 'heal',   power: 22, tier: 2, weight: 7,  icon: '🧪' },
  { key: 'prayer',   name: '天使の祈り',   kind: 'heal',   power: 35, tier: 3, weight: 4,  icon: '👼' },
  { key: 'poison',   name: '毒りんご',     kind: 'poison', power: 3,  tier: 2, weight: 6,  icon: '🍎' },
  { key: 'voodoo',   name: '呪いの藁人形', kind: 'drain',  power: 12, tier: 3, weight: 3,  icon: '🪆' },
];

const WORDS = {
  1: ['とろ', 'うに', 'えび', 'いか', 'たこ', 'さば', 'あじ', 'たい', 'かに', 'ぶり',
      'がり', 'まぐろ', 'いくら', 'たまご', 'ほたて', 'あなご', 'こはだ', 'ひらめ', 'わさび', 'さんま'],
  2: ['えんがわ', 'ねぎとろ', 'しめさば', 'どんぶり', 'かんぱち', 'かっぱまき', 'てっかまき',
      'いなりずし', 'ぼたんえび', 'あぶりとろ', 'ちゃわんむし', 'くるまえび'],
  3: ['おまかせにぎり', 'とろたくてまき', 'あぶりえんがわ', 'うなぎのかばやき', 'ねぎとろぐんかん',
      'とくじょうにぎり', 'ほんまぐろおおとろ', 'うにいくらどんぶり', 'きんめだいのにつけ'],
};

const TOTAL_WEIGHT = ITEMS.reduce((s, i) => s + i.weight, 0);
let nextItemId = 1;

function dealItem() {
  let r = Math.random() * TOTAL_WEIGHT;
  let item = ITEMS[0];
  for (const it of ITEMS) { r -= it.weight; if (r <= 0) { item = it; break; } }
  const pool = WORDS[item.tier];
  return {
    id: nextItemId++,
    key: item.key,
    word: pool[Math.floor(Math.random() * pool.length)],
    expiresAt: Date.now() + ITEM_LIFETIME,
  };
}

function itemDef(key) { return ITEMS.find(i => i.key === key); }

// ---------- 部屋管理 ----------
const rooms = new Map();
let nextPlayerId = 1;

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = { code: makeCode(), players: new Map(), hostId: null, state: 'lobby', timer: null };
  rooms.set(room.code, room);
  return room;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  for (const p of room.players.values()) send(p.ws, msg);
}

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, hp: p.hp, maxHp: MAX_HP,
    shield: p.shield, mirror: p.mirror,
    poison: p.poison ? p.poison.left : 0,
    alive: p.alive, connected: p.connected,
  };
}

function broadcastRoom(room) {
  broadcast(room, {
    t: 'room', code: room.code, hostId: room.hostId, state: room.state,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, connected: p.connected })),
  });
}

function broadcastState(room) {
  const pub = [...room.players.values()].map(publicPlayer);
  for (const p of room.players.values()) {
    send(p.ws, { t: 'state', players: pub, hand: p.alive ? p.hand : [] });
  }
}

function log(room, text, cls) {
  broadcast(room, { t: 'log', text, cls: cls || '' });
}

// ---------- ゲーム進行 ----------
function startGame(room) {
  room.state = 'countdown';
  for (const p of room.players.values()) {
    p.hp = MAX_HP; p.shield = 0; p.mirror = false; p.poison = null;
    p.alive = p.connected;
    p.hand = [];
  }
  broadcastRoom(room);
  broadcast(room, { t: 'start' });
  broadcastState(room);
  let n = 3;
  const step = () => {
    if (!rooms.has(room.code) || room.state !== 'countdown') return;
    broadcast(room, { t: 'count', n });
    if (n > 0) {
      n--;
      room.countTimer = setTimeout(step, 1000);
    } else {
      beginBattle(room);
    }
  };
  step();
}

function beginBattle(room) {
  room.state = 'playing';
  for (const p of room.players.values()) {
    if (p.alive) p.hand = Array.from({ length: HAND_SIZE }, dealItem);
  }
  log(room, '⚔️ バトル開始! 寿司を打って生き残れ!', 'sys');
  broadcastState(room);
  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => tick(room), 1000);
  checkGameOver(room);
}

function tick(room) {
  if (room.state !== 'playing') return;
  const now = Date.now();
  let changed = false;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    // 毒
    if (p.poison && p.poison.left > 0) {
      p.hp = Math.max(0, p.hp - p.poison.dmg);
      p.poison.left--;
      broadcast(room, { t: 'fx', kind: 'poison', to: p.id, val: p.poison.dmg });
      if (p.poison.left <= 0) p.poison = null;
      changed = true;
      if (p.hp <= 0) kill(room, p, '毒');
    }
    // 回転寿司: 古い皿は流れる
    for (let i = 0; i < p.hand.length; i++) {
      if (p.hand[i].expiresAt <= now) {
        p.hand[i] = dealItem();
        send(p.ws, { t: 'expired', index: i });
        changed = true;
      }
    }
  }
  if (changed) broadcastState(room);
  checkGameOver(room);
}

function kill(room, p, cause) {
  if (!p.alive) return;
  p.alive = false;
  p.hp = 0;
  log(room, `💀 ${p.name} は倒れた! (${cause})`, 'death');
}

function checkGameOver(room) {
  if (room.state !== 'playing') return;
  const alive = [...room.players.values()].filter(p => p.alive);
  if (alive.length <= 1) {
    room.state = 'ended';
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    const winner = alive[0] || null;
    broadcastState(room);
    broadcast(room, { t: 'over', winnerId: winner ? winner.id : null, winnerName: winner ? winner.name : null });
    log(room, winner ? `🏆 ${winner.name} の勝利!` : '🤝 相打ち…全滅とか嘘でしょ?', 'sys');
  }
}

function pickTarget(room, self, targetId) {
  const enemies = [...room.players.values()].filter(p => p.alive && p.id !== self.id);
  if (enemies.length === 0) return null;
  const chosen = enemies.find(p => p.id === targetId);
  return chosen || enemies[Math.floor(Math.random() * enemies.length)];
}

function useItem(room, player, msg) {
  if (room.state !== 'playing' || !player.alive) return;
  const idx = player.hand.findIndex(it => it.id === msg.itemId);
  if (idx === -1) return;
  const inst = player.hand[idx];
  const def = itemDef(inst.key);
  const mult = Math.min(1.5, Math.max(0.8, Number(msg.mult) || 1));
  const power = Math.round(def.power * mult);
  player.hand[idx] = dealItem(); // 使った皿の代わりに新しい皿

  const speedTag = mult >= 1.35 ? ' ⚡神速!' : mult >= 1.15 ? ' 💨高速!' : '';

  if (def.kind === 'attack' || def.kind === 'drain') {
    let target = pickTarget(room, player, msg.targetId);
    if (!target) { broadcastState(room); return; }
    let attacker = player;
    if (target.mirror) {
      target.mirror = false;
      log(room, `🪞 ${target.name} の鏡が ${def.name} を跳ね返した!`, 'mirror');
      broadcast(room, { t: 'fx', kind: 'mirror', to: target.id });
      const tmp = target; target = attacker; attacker = tmp;
    }
    let dmg = power;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) broadcast(room, { t: 'fx', kind: 'block', to: target.id, val: absorbed });
    }
    target.hp = Math.max(0, target.hp - dmg);
    if (def.kind === 'drain' && dmg > 0) {
      attacker.hp = Math.min(MAX_HP, attacker.hp + dmg);
      broadcast(room, { t: 'fx', kind: 'heal', to: attacker.id, val: dmg });
    }
    broadcast(room, { t: 'fx', kind: 'hit', from: attacker.id, to: target.id, val: dmg, icon: def.icon });
    log(room, `${def.icon} ${attacker.name} の ${def.name}!${speedTag} ${target.name} に ${dmg} ダメージ`, 'atk');
    if (target.hp <= 0) kill(room, target, def.name);
  } else if (def.kind === 'shield') {
    player.shield = Math.min(60, player.shield + power);
    broadcast(room, { t: 'fx', kind: 'shield', to: player.id, val: power });
    log(room, `${def.icon} ${player.name} は ${def.name} を構えた (シールド+${power})`, 'def');
  } else if (def.kind === 'mirror') {
    player.mirror = true;
    broadcast(room, { t: 'fx', kind: 'mirror', to: player.id });
    log(room, `${def.icon} ${player.name} は鏡を掲げた…次の攻撃を跳ね返す!`, 'def');
  } else if (def.kind === 'heal') {
    const healed = Math.min(MAX_HP - player.hp, power);
    player.hp += healed;
    broadcast(room, { t: 'fx', kind: 'heal', to: player.id, val: healed });
    log(room, `${def.icon} ${player.name} は ${def.name} で ${healed} 回復${speedTag}`, 'heal');
  } else if (def.kind === 'poison') {
    const target = pickTarget(room, player, msg.targetId);
    if (target) {
      target.poison = { left: 5, dmg: def.power };
      broadcast(room, { t: 'fx', kind: 'poison', from: player.id, to: target.id, val: 0, icon: def.icon });
      log(room, `${def.icon} ${player.name} の毒りんご! ${target.name} は毒状態になった`, 'atk');
    }
  }
  broadcastState(room);
  checkGameOver(room);
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null;
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'create' || msg.t === 'join') {
      if (player) return;
      const name = String(msg.name || '').trim().slice(0, 12) || '名無し';
      if (msg.t === 'create') {
        room = createRoom();
      } else {
        room = rooms.get(String(msg.code || '').trim().toUpperCase());
        if (!room) { send(ws, { t: 'err', msg: 'その部屋、存在しないんですけど?コード見直しなよ' }); return; }
        if (room.state !== 'lobby') { send(ws, { t: 'err', msg: '対戦中の部屋には入れないよ。終わるまで待ちな' }); return; }
        if (room.players.size >= 8) { send(ws, { t: 'err', msg: '満員!8人までだって言ってんじゃん' }); return; }
      }
      player = {
        id: nextPlayerId++, name, ws,
        hp: MAX_HP, shield: 0, mirror: false, poison: null,
        hand: [], alive: false, connected: true,
      };
      room.players.set(player.id, player);
      if (!room.hostId) room.hostId = player.id;
      send(ws, { t: 'joined', code: room.code, selfId: player.id, hostId: room.hostId });
      broadcastRoom(room);
      log(room, `🚪 ${name} が入店`, 'sys');
      return;
    }

    if (!room || !player) return;

    switch (msg.t) {
      case 'start':
        if (player.id !== room.hostId || room.state !== 'lobby') return;
        if ([...room.players.values()].filter(p => p.connected).length < 2) {
          send(ws, { t: 'err', msg: '1人で戦うつもり?最低2人集めてきなよ' });
          return;
        }
        startGame(room);
        break;
      case 'restart':
        if (player.id !== room.hostId || room.state !== 'ended') return;
        room.state = 'lobby';
        for (const p of [...room.players.values()]) {
          if (!p.connected) room.players.delete(p.id);
        }
        broadcast(room, { t: 'toRoom' });
        broadcastRoom(room);
        break;
      case 'use':
        useItem(room, player, msg);
        break;
      case 'makeHost': {
        if (player.id !== room.hostId) return;
        const target = room.players.get(msg.id);
        if (!target || !target.connected || target.id === player.id) return;
        room.hostId = target.id;
        broadcastRoom(room);
        log(room, `👑 ${target.name} がホストになった`, 'sys');
        break;
      }
      case 'progress': {
        const p = Math.min(1, Math.max(0, Number(msg.p) || 0));
        for (const other of room.players.values()) {
          if (other.id !== player.id) send(other.ws, { t: 'tp', id: player.id, p });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!room || !player) return;
    player.connected = false;
    if (room.state === 'lobby' || room.state === 'ended') {
      room.players.delete(player.id);
    } else {
      if (player.alive) kill(room, player, '回線切断');
      broadcastState(room);
      checkGameOver(room);
    }
    let newHost = null;
    if (room.hostId === player.id) {
      newHost = [...room.players.values()].find(p => p.connected) || null;
      room.hostId = newHost ? newHost.id : null;
    }
    if ([...room.players.values()].every(p => !p.connected)) {
      if (room.timer) clearInterval(room.timer);
      if (room.countTimer) clearTimeout(room.countTimer);
      rooms.delete(room.code);
    } else {
      broadcastRoom(room);
      log(room, `🚪 ${player.name} が退店`, 'sys');
      if (newHost) log(room, `👑 ホスト交代: ${newHost.name} がホストになった`, 'sys');
    }
  });
});

server.listen(PORT, () => {
  console.log(`🍣 寿司タイピングバトル: http://localhost:${PORT}`);
});
