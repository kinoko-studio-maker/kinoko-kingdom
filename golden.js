// =============================================
// キノコ王国 ― 金のキノコ
// ときどき空に「金のキノコ」が現れる。消える前に押すと、ランダムでボーナスがもらえる。
// いつ出るかわからないので、画面を見ているのが楽しくなる
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
const GOLDEN_FIRST_SEC = 45;     // ゲームを開いてから、最初に出るまでの秒数
const GOLDEN_MIN_SEC = 60;       // 次に出るまでの最短の秒数
const GOLDEN_MAX_SEC = 150;      // 次に出るまでの最長の秒数
const GOLDEN_LIFETIME_SEC = 12;  // 出てから消えるまでの秒数
// 押したときのボーナス。weight = 出やすさ（合計に対する割合）
const GOLDEN_EFFECTS = [
  { id: 'lucky',  weight: 50, name: '胞子の恵み' },     // 胞子がたくさんもらえる
  { id: 'boom',   weight: 25, name: '胞子の大発生',  mul: 5,  seconds: 20 },   // 生産 ×5
  { id: 'finger', weight: 20, name: '金の指先',      mul: 10, seconds: 15 },   // クリック ×10
  { id: 'storm',  weight: 5,  name: '嵐を呼ぶキノコ' }, // 胞子の嵐がすぐ始まる
];
const GOLDEN_LUCKY_SECONDS = 120;   // 「胞子の恵み」でもらえる量：毎秒生産の何秒分か（120 = 2分ぶん）
const GOLDEN_LUCKY_CLICKS = 60;     //  ＋ クリック何回分か（序盤でもうれしい量にするため）

// ---------- 状態（セーブしない。押した回数だけ state.goldenClicks に残す） ----------
const golden = {
  nextAt: Date.now() + GOLDEN_FIRST_SEC * 1000,   // 次に出る時刻
  visibleUntil: 0,   // 出ている間は、消える時刻
  buffs: {},         // 効果ごとに、終わる時刻（例：{ boom: 1700000000000 }）
};

// ---------- 倍率（game.js の計算から呼ばれる） ----------
function isGoldenBuff(id, now = Date.now()) {
  return (golden.buffs[id] || 0) > now;
}

function getGoldenProdMultiplier() {
  return isGoldenBuff('boom') ? GOLDEN_EFFECTS.find(e => e.id === 'boom').mul : 1;
}

function getGoldenClickMultiplier() {
  return isGoldenBuff('finger') ? GOLDEN_EFFECTS.find(e => e.id === 'finger').mul : 1;
}

// ---------- 出す・消す ----------
// 0.1秒ごとに game.js の tick から呼ばれる
function updateGolden(now) {
  const el = document.getElementById('golden');
  if (golden.visibleUntil > 0) {
    if (now >= golden.visibleUntil) hideGolden(now);   // 押されずに消えた
    return;
  }
  // 別のタブを見ている間は出さない（見ていないうちに消えてしまうので）
  if (document.hidden || now < golden.nextAt) return;
  showGolden(now, el);
}

function showGolden(now, el = document.getElementById('golden')) {
  golden.visibleUntil = now + GOLDEN_LIFETIME_SEC * 1000;
  // 空のあたりの、どこかランダムな場所に出す（王様キノコと数字の表示をなるべく避ける）
  const left = Math.random() < 0.5 ? 6 + Math.random() * 26 : 62 + Math.random() * 26;
  el.style.left = `${left}%`;
  el.style.top = `${22 + Math.random() * 18}%`;
  el.hidden = false;
  el.classList.remove('pop');
  void el.offsetWidth;   // アニメーションを最初から始めるためのおまじない
  el.classList.add('pop');
  playSound('goldenAppear');   // sound.js
}

function hideGolden(now) {
  golden.visibleUntil = 0;
  const speed = hasStarPerk('golden-often') ? 0.8 : 1;   // 星の道（starroad.js）
  golden.nextAt = now + (GOLDEN_MIN_SEC + Math.random() * (GOLDEN_MAX_SEC - GOLDEN_MIN_SEC)) * speed * 1000;
  document.getElementById('golden').hidden = true;
}

// ---------- 押したとき ----------
function pickGoldenEffect() {
  const total = GOLDEN_EFFECTS.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of GOLDEN_EFFECTS) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return GOLDEN_EFFECTS[0];
}

// 「胞子の恵み」でもらえる量
function getGoldenLuckyAmount() {
  const perk = hasStarPerk('lucky-up') ? 2 : 1;   // 星の道（starroad.js）
  return (getSps() * GOLDEN_LUCKY_SECONDS + getClickValue() * GOLDEN_LUCKY_CLICKS) * perk;
}

// 効果の長さ（秒）。星の道で 1.5倍になる
function getGoldenSeconds(effect) {
  return effect.seconds * (hasStarPerk('golden-long') ? 1.5 : 1);
}

// effect を決めて効果を出す。戻り値はお知らせの文
function applyGoldenEffect(effect, now) {
  if (effect.id === 'storm' && isFever(now)) effect = GOLDEN_EFFECTS[0];   // すでに嵐の最中なら「恵み」にする
  if (effect.id === 'lucky') {
    const gain = getGoldenLuckyAmount();
    addSpores(gain);
    return `✨ ${effect.name}！ 胞子 +${formatFull(gain)}`;
  }
  if (effect.id === 'storm') {
    startFever(now);   // combo.js
    return `✨ ${effect.name}！ 胞子の嵐が始まった`;
  }
  const seconds = getGoldenSeconds(effect);
  golden.buffs[effect.id] = now + seconds * 1000;
  const what = effect.id === 'boom' ? '生産' : 'クリック';
  return `✨ ${effect.name}！ ${seconds}秒間 ${what} ×${effect.mul}`;
}

function onGoldenClick(event) {
  const now = Date.now();
  if (golden.visibleUntil === 0) return;
  const rect = event.currentTarget.getBoundingClientRect();
  hideGolden(now);
  state.goldenClicks++;
  onMissionEvent('golden', 1);   // daily.js
  const text = applyGoldenEffect(pickGoldenEffect(), now);
  showFloatText(text.replace('✨ ', ''), rect.left + rect.width / 2, rect.top);
  showAnnouncement(text);   // world.js
  playSound('golden');      // sound.js
  render();
}

// ---------- 画面 ----------
// 効果が続いている間、ステージの数字の下に残り時間を出す
function renderGolden() {
  const now = Date.now();
  const lines = [];
  for (const e of GOLDEN_EFFECTS) {
    if (!e.seconds || !isGoldenBuff(e.id, now)) continue;
    const what = e.id === 'boom' ? '生産' : 'クリック';
    lines.push(`✨${e.name} ${what}×${e.mul} あと${Math.ceil((golden.buffs[e.id] - now) / 1000)}秒`);
  }
  const el = document.getElementById('golden-line');
  const text = lines.join('\n');   // 効果ごとに1行（狭い画面でもはみ出さないように）
  el.hidden = text === '';
  if (el.textContent !== text) el.textContent = text;
}

function setupGolden() {
  document.getElementById('golden').addEventListener('click', onGoldenClick);
}
