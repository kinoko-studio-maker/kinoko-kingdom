// =============================================
// キノコ王国 ― コンボと胞子の嵐（フィーバー）
// テンポよく連打するとコンボがつながり、ゲージがたまる。
// ゲージが満タンになると「胞子の嵐」：しばらくのあいだ、生産とクリックが何倍にもなる
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
const COMBO_WINDOW_MS = 500;        // 前のクリックから何ミリ秒以内ならコンボがつながるか
const COMBO_MIN_FOR_GAUGE = 5;      // コンボがいくつ以上のとき、ゲージがたまり始めるか
const FEVER_GAUGE_MAX = 100;        // ゲージの最大（コンボ中のクリック1回で +1）
const FEVER_SECONDS = 10;           // 胞子の嵐が続く秒数
const FEVER_MULTIPLIER = 7;         // 胞子の嵐の間、生産とクリックが何倍になるか
const GAUGE_DECAY_DELAY_MS = 1000;  // 何ミリ秒クリックしないと、ゲージが減り始めるか
const GAUGE_DECAY_PER_SEC = 8;      // ゲージが1秒に減る量

// ---------- コンボの状態（セーブしない。ページを開き直すと0から） ----------
const combo = {
  count: 0,              // 今つながっているコンボ
  lastClickAt: -Infinity,
  gauge: 0,              // 胞子の嵐のゲージ（0〜FEVER_GAUGE_MAX）
  feverUntil: 0,         // 胞子の嵐が終わる時刻（Date.now() の値）
  feverSounding: false,  // 嵐の音を鳴らしている途中か（終わったときに音を鳴らすため）
};

// 今、胞子の嵐の最中か
function isFever(now = Date.now()) {
  return now < combo.feverUntil;
}

// 胞子の嵐の長さ（秒）と倍率。図鑑のこおりキノコ・すいしょうキノコで強くなる
function getFeverSeconds() {
  return FEVER_SECONDS + getZukanBonus('feverSec');
}

function getFeverPower() {
  return FEVER_MULTIPLIER + getZukanBonus('feverMul');
}

// 胞子の嵐の倍率（嵐の間は getFeverPower() 倍、それ以外は 1）
function getFeverMultiplier() {
  return isFever() ? getFeverPower() : 1;
}

// クリックされたときに game.js から呼ばれる
function registerComboClick(now) {
  if (now - combo.lastClickAt <= COMBO_WINDOW_MS) {
    combo.count++;
  } else {
    combo.count = 1;
  }
  combo.lastClickAt = now;
  state.bestCombo = Math.max(state.bestCombo, combo.count);

  // コンボ中のクリックでゲージがたまる（嵐の最中はたまらない。ほのおキノコがあると、たまりやすい）
  if (!isFever(now) && combo.count >= COMBO_MIN_FOR_GAUGE) {
    combo.gauge = Math.min(FEVER_GAUGE_MAX, combo.gauge + 1 + getZukanBonus('gauge'));
    if (combo.gauge >= FEVER_GAUGE_MAX) startFever(now);
  }

  // コンボの数字を「ポン」と弾ませる
  const el = document.getElementById('combo');
  el.classList.remove('pop');
  void el.offsetWidth;   // アニメーションを最初から始めるためのおまじない
  el.classList.add('pop');
}

function startFever(now) {
  combo.feverUntil = now + getFeverSeconds() * 1000;
  combo.gauge = 0;
  state.feverCount++;
  combo.feverSounding = true;
  playSound('fever');    // sound.js
  onMissionEvent('fever', 1);   // daily.js
  worldOnFeverStart();   // 演出（world.js）
}

// 0.1秒ごとに game.js の tick から呼ばれる：しばらく押さないとゲージが減る
function updateCombo(now, seconds) {
  if (combo.feverSounding && !isFever(now)) {
    combo.feverSounding = false;
    playSound('feverEnd');
  }
  if (!isFever(now) && now - combo.lastClickAt > GAUGE_DECAY_DELAY_MS) {
    combo.gauge = Math.max(0, combo.gauge - GAUGE_DECAY_PER_SEC * seconds);
  }
}

// ---------- 画面 ----------
function renderCombo() {
  const now = Date.now();
  const fever = isFever(now);

  // コンボの数字（つながっている間だけ表示）
  const comboEl = document.getElementById('combo');
  const alive = now - combo.lastClickAt <= COMBO_WINDOW_MS && combo.count >= 2;
  comboEl.hidden = !alive;
  if (alive) comboEl.textContent = `COMBO ×${combo.count}`;

  // ゲージ：ふだんはたまり具合、嵐の間は残り時間
  const bar = document.getElementById('fever-bar');
  const label = document.getElementById('fever-label');
  if (fever) {
    const remain = (combo.feverUntil - now) / 1000;
    bar.style.width = Math.min(100, remain / getFeverSeconds() * 100) + '%';
    label.textContent = `🌪️ 胞子の嵐！ ×${getFeverPower()}　あと ${Math.ceil(remain)}秒`;
  } else {
    bar.style.width = (combo.gauge / FEVER_GAUGE_MAX * 100) + '%';
    label.textContent = combo.gauge > 0 ? `🌪️ 嵐ゲージ ${Math.floor(combo.gauge)}%` : '🌪️ 連打で嵐ゲージがたまる';
  }
  document.getElementById('stage').classList.toggle('fever', fever);
}
