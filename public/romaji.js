// ひらがな → ローマ字入力マッチャー（複数入力パターン対応）
'use strict';

const KANA_TABLE = {
  'あ': ['a'], 'い': ['i', 'yi'], 'う': ['u', 'wu', 'whu'], 'え': ['e'], 'お': ['o'],
  'か': ['ka', 'ca'], 'き': ['ki'], 'く': ['ku', 'cu', 'qu'], 'け': ['ke'], 'こ': ['ko', 'co'],
  'さ': ['sa'], 'し': ['si', 'shi', 'ci'], 'す': ['su'], 'せ': ['se', 'ce'], 'そ': ['so'],
  'た': ['ta'], 'ち': ['ti', 'chi'], 'つ': ['tu', 'tsu'], 'て': ['te'], 'と': ['to'],
  'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'],
  'は': ['ha'], 'ひ': ['hi'], 'ふ': ['fu', 'hu'], 'へ': ['he'], 'ほ': ['ho'],
  'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'],
  'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'],
  'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'],
  'わ': ['wa'], 'を': ['wo'], 'ん': ['nn', 'xn'],
  'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'],
  'ざ': ['za'], 'じ': ['zi', 'ji'], 'ず': ['zu'], 'ぜ': ['ze'], 'ぞ': ['zo'],
  'だ': ['da'], 'ぢ': ['di'], 'づ': ['du'], 'で': ['de'], 'ど': ['do'],
  'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'],
  'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'],
  'ぁ': ['xa', 'la'], 'ぃ': ['xi', 'li'], 'ぅ': ['xu', 'lu'], 'ぇ': ['xe', 'le'], 'ぉ': ['xo', 'lo'],
  'ゃ': ['xya', 'lya'], 'ゅ': ['xyu', 'lyu'], 'ょ': ['xyo', 'lyo'],
  'きゃ': ['kya'], 'きゅ': ['kyu'], 'きょ': ['kyo'],
  'しゃ': ['sya', 'sha'], 'しゅ': ['syu', 'shu'], 'しょ': ['syo', 'sho'],
  'ちゃ': ['tya', 'cha', 'cya'], 'ちゅ': ['tyu', 'chu', 'cyu'], 'ちょ': ['tyo', 'cho', 'cyo'],
  'にゃ': ['nya'], 'にゅ': ['nyu'], 'にょ': ['nyo'],
  'ひゃ': ['hya'], 'ひゅ': ['hyu'], 'ひょ': ['hyo'],
  'みゃ': ['mya'], 'みゅ': ['myu'], 'みょ': ['myo'],
  'りゃ': ['rya'], 'りゅ': ['ryu'], 'りょ': ['ryo'],
  'ぎゃ': ['gya'], 'ぎゅ': ['gyu'], 'ぎょ': ['gyo'],
  'じゃ': ['zya', 'ja', 'jya'], 'じゅ': ['zyu', 'ju', 'jyu'], 'じょ': ['zyo', 'jo', 'jyo'],
  'びゃ': ['bya'], 'びゅ': ['byu'], 'びょ': ['byo'],
  'ぴゃ': ['pya'], 'ぴゅ': ['pyu'], 'ぴょ': ['pyo'],
  'ふぁ': ['fa', 'fua'], 'ふぃ': ['fi', 'fui'], 'ふぇ': ['fe', 'fue'], 'ふぉ': ['fo', 'fuo'],
  'てぃ': ['thi', 'teli', 'texi'], 'でぃ': ['dhi', 'deli', 'dexi'],
  'うぃ': ['wi', 'uli', 'uxi'], 'うぇ': ['we', 'ule', 'uxe'],
};

const SMALL_KANA = 'ぁぃぅぇぉゃゅょ';
const VOWELS = 'aiueo';

// ひらがな文字列をチャンク（入力単位）の配列に分解する
function chunkKana(word) {
  const chunks = [];
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    if (ch === 'っ') {
      chunks.push({ kana: 'っ', sokuon: true, alts: [] });
      i++;
      continue;
    }
    const two = word.slice(i, i + 2);
    if (two.length === 2 && SMALL_KANA.includes(two[1]) && KANA_TABLE[two]) {
      chunks.push({ kana: two, alts: KANA_TABLE[two].slice() });
      i += 2;
    } else {
      const alts = KANA_TABLE[ch];
      if (!alts) throw new Error('未対応のかな: ' + ch);
      chunks.push({ kana: ch, alts: alts.slice() });
      i++;
    }
  }
  // っ: 次のチャンクの子音重ねがけ + xtu 系
  // ん: 次が母音・な行・や行以外なら単発 n も可
  for (let k = 0; k < chunks.length; k++) {
    const c = chunks[k];
    const next = chunks[k + 1];
    if (c.sokuon) {
      const alts = new Set(['xtu', 'ltu', 'xtsu', 'ltsu']);
      if (next && !next.sokuon) {
        for (const a of next.alts) {
          if (!VOWELS.includes(a[0]) && a[0] !== 'n') alts.add(a[0]);
        }
      }
      c.alts = [...alts];
    } else if (c.kana === 'ん') {
      const canSingleN = next && next.alts.every(a => !VOWELS.includes(a[0]) && a[0] !== 'n' && a[0] !== 'y');
      c.alts = canSingleN ? ['n', 'nn', 'xn'] : ['nn', 'xn'];
    }
  }
  return chunks;
}

// 1単語ぶんのタイピング状態を管理する
class TypingMatcher {
  constructor(word) {
    this.word = word;
    this.chunks = chunkKana(word);
    this.ci = 0;        // 現在のチャンク位置
    this.buf = '';      // 現在チャンクで入力済みのローマ字
    this.typed = '';    // 確定済み全ローマ字
    this.typedCount = 0;
    this.missCount = 0;
  }

  get done() { return this.ci >= this.chunks.length; }

  // 1文字入力。'ok' | 'miss' | 'done' を返す
  input(ch) {
    if (this.done) return 'done';
    const result = this._feed(ch);
    if (result !== 'miss') {
      this.typedCount++;
      return this.done ? 'done' : 'ok';
    }
    this.missCount++;
    return 'miss';
  }

  _feed(ch) {
    const alts = this.chunks[this.ci].alts;
    const nb = this.buf + ch;
    const candidates = alts.filter(a => a.startsWith(nb));
    if (candidates.length > 0) {
      // 完全一致し、かつそれより長い候補が無ければチャンク確定。
      // 長い候補が残る場合（例: ん の n/nn）は確定を遅延させる
      if (candidates.includes(nb) && candidates.length === 1) {
        this._commit(nb);
      } else {
        this.buf = nb;
      }
      return 'ok';
    }
    // buf 自体が有効な完成形なら（遅延確定分）、確定して次チャンクに流す
    if (this.buf && alts.includes(this.buf) && this.ci + 1 < this.chunks.length) {
      const committed = this.buf;
      const nextAlts = this.chunks[this.ci + 1].alts;
      if (nextAlts.some(a => a.startsWith(ch))) {
        this._commit(committed);
        return this._feed(ch);
      }
    }
    return 'miss';
  }

  _commit(romaji) {
    this.typed += romaji;
    this.ci++;
    this.buf = '';
  }

  // 残り入力のヒント文字列（現在の入力に沿った最短候補）
  hint() {
    let s = '';
    for (let k = this.ci; k < this.chunks.length; k++) {
      const alts = this.chunks[k].alts;
      if (k === this.ci && this.buf) {
        const cand = alts.filter(a => a.startsWith(this.buf)).sort((a, b) => a.length - b.length);
        s += (cand[0] || alts[0]).slice(this.buf.length);
      } else {
        s += alts.slice().sort((a, b) => a.length - b.length)[0];
      }
    }
    return s;
  }

  // 入力済み部分（表示用）
  typedPart() { return this.typed + this.buf; }

  // 進捗 0..1（チャンク単位）
  progress() {
    if (this.chunks.length === 0) return 1;
    return this.ci / this.chunks.length;
  }
}

window.TypingMatcher = TypingMatcher;
