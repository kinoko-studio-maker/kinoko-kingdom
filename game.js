// =============================================
// キノコ王国 ― 第一版
// 胞子を集めて施設を建て、キノコの王国を広げる放置ゲーム
// =============================================

// ---------- 設定（ここの数字を変えるとバランスを調整できる） ----------
const COST_GROWTH = 1.15;        // 施設を1つ買うごとに、値段が何倍になるか
const OFFLINE_MAX_HOURS = 24;    // 放置報酬がもらえる最大の時間
const SAVE_KEY = 'kinoko-kingdom-save-v1';
const SAVE_INTERVAL_MS = 5000;   // 自動セーブの間隔（ミリ秒）
const TICK_MS = 100;             // 画面を更新する間隔（ミリ秒）
const ACHIEVEMENT_BONUS = 0.01;  // 実績1つにつき、生産量が何%増えるか（0.01 = 1%。0 にするとボーナスなし）
// 転生：その周回で集めた胞子から「星の胞子」がもらえる。もらえる数 = √(集めた胞子 ÷ STAR_BASE)
//   例）1億 → 1個、100億 → 10個、1兆 → 100個
const STAR_BASE = 1e8;
const STAR_BONUS = 0.1;          // 星の胞子1つにつき、生産量が何%増えるか（0.1 = 10%）

// ---------- 乱数（同じ seed なら毎回同じ結果になる。天気や菌糸の形に使う） ----------
function createRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 施設の一覧。baseCost = 最初の値段、baseSps = 1つあたりの毎秒生産量
const FACILITIES = [
  { id: 'chibi',   icon: '🍄', name: 'ちびキノコ',   desc: '小さなキノコが胞子をふりまく',   baseCost: 10,     baseSps: 0.2 },
  { id: 'kinshi',  icon: '🕸️', name: '菌糸ネット',   desc: '地下の菌糸が胞子を運んでくる',   baseCost: 120,    baseSps: 1.5 },
  { id: 'hatake',  icon: '🌱', name: 'キノコ畑',     desc: 'キノコを育てて胞子を収穫する',   baseCost: 1500,   baseSps: 12 },
  { id: 'tou',     icon: '🗼', name: '胞子の塔',     desc: '高い塔から胞子を遠くまで飛ばす', baseCost: 20000,  baseSps: 90 },
  { id: 'shinden', icon: '⛩️', name: '菌の神殿',     desc: 'キノコの神に胞子の恵みを祈る',   baseCost: 3e5,    baseSps: 700 },
  { id: 'mori',    icon: '🌳', name: '菌糸の森',     desc: '森じゅうの木が菌糸でつながる',   baseCost: 5e6,    baseSps: 6000 },
  { id: 'toshi',   icon: '🏙️', name: 'キノコ都市',   desc: 'キノコの住人たちが働く大都市',   baseCost: 8e7,    baseSps: 50000 },
  { id: 'wakusei', icon: '🪐', name: '菌の惑星',     desc: '惑星まるごとキノコでおおう',     baseCost: 1.5e9,  baseSps: 450000 },
  { id: 'ginga',   icon: '🌌', name: '胞子の銀河',   desc: '胞子が星から星へと旅をする',     baseCost: 3e10,   baseSps: 4e6 },
  { id: 'uchu',    icon: '✨', name: 'キノコ宇宙',   desc: '宇宙そのものがキノコになる',     baseCost: 8e11,   baseSps: 4e7 },
];

// 施設ごとの強化。所持数が need 個になると出てくる。値段は「施設の最初の値段 × costMul」
// id はセーブデータの目印。5個の強化はあとから足したので id が '5'（今までのセーブがそのまま使えるように、ほかの id は変えない）
const FACILITY_UPGRADE_STEPS = [
  { need: 5,   costMul: 25,    id: '5' },
  { need: 10,  costMul: 15,    id: '1' },
  { need: 25,  costMul: 150,   id: '2' },
  { need: 50,  costMul: 2500,  id: '3' },
  { need: 100, costMul: 50000, id: '4' },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

// クリックの強化。累計の胞子が値段の半分に届くと出てくる
//   clickMul = クリックの胞子が2倍 / clickSps = クリックで「毎秒生産量の◯%」も追加でもらえる
const CLICK_UPGRADES = [
  { id: 'click-1', name: '胞子の手袋',     desc: 'クリックの胞子が2倍',                      cost: 100,  type: 'clickMul' },
  { id: 'click-2', name: '菌糸の指輪',     desc: 'クリックの胞子が2倍',                      cost: 5000, type: 'clickMul' },
  { id: 'click-3', name: 'キノコのつえ',   desc: 'クリックの胞子が2倍',                      cost: 2.5e5, type: 'clickMul' },
  { id: 'echo-1',  name: '胞子の共鳴',     desc: 'クリックで毎秒生産量の1%も追加でもらえる', cost: 1e6,  type: 'clickSps', value: 0.01 },
  { id: 'echo-2',  name: '胞子の大共鳴',   desc: 'クリックで毎秒生産量の2%も追加でもらえる', cost: 1e8,  type: 'clickSps', value: 0.02 },
  { id: 'echo-3',  name: '胞子の超共鳴',   desc: 'クリックで毎秒生産量の3%も追加でもらえる', cost: 1e10, type: 'clickSps', value: 0.03 },
];

// 強化を全部1つのリストにまとめる（安い順）
const UPGRADES = buildUpgradeList();

function buildUpgradeList() {
  const list = [];
  for (const u of CLICK_UPGRADES) {
    list.push({ ...u, isUnlocked: () => state.totalSpores >= u.cost / 2 });
  }
  for (const f of FACILITIES) {
    FACILITY_UPGRADE_STEPS.forEach((step, i) => {
      list.push({
        id: `${f.id}-up-${step.id}`,
        name: `${f.name}強化 ${ROMAN[i]}`,
        desc: `${f.name}の生産量が2倍`,
        cost: f.baseCost * step.costMul,
        type: 'facilityMul',
        target: f.id,
        isUnlocked: () => state.owned[f.id] >= step.need,
      });
    });
  }
  list.sort((a, b) => a.cost - b.cost);
  return list;
}

// ---------- ゲームの状態（セーブされる中身） ----------
let state = createNewState();
let buyMode = 1;   // 施設をいくつずつ買うか（1 / 10 / 'max'）

function createNewState() {
  const owned = {};
  for (const f of FACILITIES) owned[f.id] = 0;
  return {
    spores: 0,           // 今持っている胞子
    totalSpores: 0,      // この周回（前の転生から今まで）に集めた胞子
    lifetimeSpores: 0,   // 最初から今までに集めた胞子（転生しても消えない）
    clicks: 0,           // クリックした回数
    owned: owned,        // 施設ごとの所持数
    upgrades: [],        // 買った強化の id
    achievements: [],    // 達成した実績の id
    starSpores: 0,       // 星の胞子の数（転生しても消えない）
    prestigeCount: 0,    // 転生した回数
    bestCombo: 0,        // いちばん長かったコンボ（転生しても消えない）
    feverCount: 0,       // 胞子の嵐を起こした回数（転生しても消えない）
    zukan: {},           // 図鑑：種類ごとに見つけた数（転生しても消えない）
    chibiSpecies: {},    // 地上のどの場所に、どのレア種が生えているか（転生で消える）
    roots: {},           // 施設ごとに植えた根の番号（転生しても覚えておく）
    goldenClicks: 0,     // 金のキノコを押した回数（転生しても消えない）
    daily: null,         // ログインボーナスと今日のミッション（daily.js が作る。転生しても消えない）
    lastSaved: Date.now(),
  };
}

// ---------- 計算 ----------
function hasUpgrade(id) {
  return state.upgrades.includes(id);
}

// 施設の生産倍率（強化1つにつき2倍）
function getFacilityMultiplier(facilityId) {
  let mul = 1;
  for (const u of UPGRADES) {
    if (u.type === 'facilityMul' && u.target === facilityId && hasUpgrade(u.id)) mul *= 2;
  }
  return mul;
}

// 施設1つあたりの毎秒生産量（その施設だけにかかる倍率：強化・天気・根の相性）
//   withWeather = false のときは天気を入れない（放置報酬の計算用）
function getSpsPerFacility(f, withWeather = true) {
  const weather = withWeather ? getWeatherMultiplier(f.id) : 1;   // weather.js
  return f.baseSps * getFacilityMultiplier(f.id) * weather * getDistrictMultiplier(f.id);   // district.js
}

// 全部の施設にかかる倍率（実績・星の胞子・胞子の嵐・図鑑・金のキノコ）
function getGlobalMultiplier() {
  return getAchievementMultiplier() * getStarMultiplier() * getFeverMultiplier() * getZukanProdMultiplier() *
    getGoldenProdMultiplier();   // golden.js
}

// 全体の毎秒生産量
function getSps(withWeather = true) {
  let total = 0;
  for (const f of FACILITIES) total += state.owned[f.id] * getSpsPerFacility(f, withWeather);
  return total * getGlobalMultiplier();
}

// 実績ボーナスの倍率（例：実績10個なら 1.1 倍）
function getAchievementMultiplier() {
  return 1 + state.achievements.length * ACHIEVEMENT_BONUS;
}

// 星の胞子ボーナスの倍率（例：星の胞子5個なら 1.5 倍）。ほしキノコを見つけると1つの効果が上がる
function getStarBonus() {
  return STAR_BONUS + getZukanBonus('star');
}

function getStarMultiplier() {
  return 1 + state.starSpores * getStarBonus();
}

// 今転生すると、星の胞子がいくつもらえるか
function getPrestigeGain() {
  return Math.floor(Math.sqrt(state.totalSpores / STAR_BASE));
}

function getTotalOwned() {
  let total = 0;
  for (const f of FACILITIES) total += state.owned[f.id];
  return total;
}

// クリック1回でもらえる胞子
function getClickValue() {
  let mul = 1;
  let spsRate = 0;
  for (const u of UPGRADES) {
    if (!hasUpgrade(u.id)) continue;
    if (u.type === 'clickMul') mul *= 2;
    if (u.type === 'clickSps') spsRate += u.value;
  }
  // 夕方・朝はクリック ×2（weather.js）、胞子の嵐の間は ×7（combo.js）、図鑑のボーナス（zukan.js）、金の指先 ×10（golden.js）
  return 1 * mul * getWeatherClickMultiplier() * getFeverMultiplier() * getZukanClickMultiplier() * getGoldenClickMultiplier() +
    getSps() * spsRate;
}

// 施設を amount 個まとめて買うときの値段（1つ買うごとに COST_GROWTH 倍になる）
function getCost(f, amount) {
  const first = f.baseCost * Math.pow(COST_GROWTH, state.owned[f.id]);
  return Math.ceil(first * (Math.pow(COST_GROWTH, amount) - 1) / (COST_GROWTH - 1));
}

// 今の胞子で最大いくつ買えるか
function getMaxAffordable(f) {
  const first = f.baseCost * Math.pow(COST_GROWTH, state.owned[f.id]);
  let n = Math.floor(Math.log(state.spores * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH));
  while (n > 0 && getCost(f, n) > state.spores) n--;   // 小数の誤差対策
  return n;
}

// 今の買い方（×1 / ×10 / 最大）で何個買うか
function getBuyAmount(f) {
  if (buyMode === 'max') return Math.max(1, getMaxAffordable(f));
  return buyMode;
}

// ---------- 行動 ----------
function addSpores(amount) {
  state.spores += amount;
  state.totalSpores += amount;
  state.lifetimeSpores += amount;
}

function buyFacility(f) {
  const amount = getBuyAmount(f);
  const cost = getCost(f, amount);
  if (state.spores < cost) {
    playSound('deny');   // sound.js
    return;
  }
  playSound('buy');
  onMissionEvent('buy', amount);   // daily.js
  const before = state.owned[f.id];
  const isFirst = before === 0;
  state.spores -= cost;
  state.owned[f.id] += amount;
  if (f.id === 'chibi') onChibiBought(amount, before);   // 図鑑の抽選（zukan.js）
  else if (isFirst) plantFacility(f.id);                 // 根に植える（district.js）
  worldOnBuy(f, isFirst);   // 演出（world.js）に知らせる
  celebrateButton(facilityElements[f.id].button, `+${amount} ${f.icon}`);
  render();
}

function buyUpgrade(u) {
  if (hasUpgrade(u.id)) return;
  if (state.spores < u.cost) {
    playSound('deny');
    return;
  }
  playSound('upgrade');
  onMissionEvent('upgrade', 1);
  state.spores -= u.cost;
  state.upgrades.push(u.id);
  const button = document.querySelector(`.upgrade[data-id="${u.id}"]`);
  if (button) celebrateButton(button, '⬆ パワーアップ！');
  render();
}

// 買ったボタンをピカッと光らせ、そこから文字を浮かべる
function celebrateButton(button, text) {
  button.classList.remove('bought');
  void button.offsetWidth;   // アニメーションを最初から始めるためのおまじない
  button.classList.add('bought');
  const rect = button.getBoundingClientRect();
  showFloatText(text, rect.left + rect.width * 0.5, rect.top + rect.height * 0.4);
}

// 転生：胞子・施設・強化をリセットして、星の胞子をもらう（実績・記録・星の胞子は残す）
function doPrestige() {
  const gain = getPrestigeGain();
  if (gain < 1) return 0;
  const keep = {
    clicks: state.clicks,
    lifetimeSpores: state.lifetimeSpores,
    achievements: state.achievements,
    starSpores: state.starSpores + gain,
    prestigeCount: state.prestigeCount + 1,
    bestCombo: state.bestCombo,
    feverCount: state.feverCount,
    zukan: state.zukan,
    roots: state.roots,
    goldenClicks: state.goldenClicks,
    daily: state.daily,
  };
  state = Object.assign(createNewState(), keep);
  if (hasStarPerk('start-chibi')) state.owned.chibi = 10;   // 星の道（starroad.js）
  saveGame();
  return gain;
}

// 転生ボタンを押したとき（確認してから転生する）
function onPrestigeButton() {
  const gain = getPrestigeGain();
  if (gain < 1) return;
  const message = `王国を土に還して、転生しますか？\n\n` +
    `もらえる星の胞子：${gain} 個（生産 +${Math.round(gain * STAR_BONUS * 100)}%）\n` +
    `なくなるもの：胞子・施設・強化・地上のレア種\n残るもの：実績・星の胞子・図鑑・根の植え方・記録`;
  if (!confirm(message)) return;
  doPrestige();
  playSound('prestige');
  document.getElementById('prestige-modal').hidden = true;
  worldOnPrestige(gain);
  showToast(`⭐ 転生しました！ 星の胞子 +${gain}`);
  render();
}

function onMushroomClick(event) {
  registerComboClick(Date.now());   // コンボとゲージ（combo.js）。嵐が始まったら、このクリックから ×7
  const value = getClickValue();
  addSpores(value);
  state.clicks++;
  playSound('click', combo.count);   // コンボが続くほど音が高くなる
  onMissionEvent('click', 1);        // daily.js
  onMissionEvent('combo', combo.count);

  // キーボードで押したときは、キノコの中心に文字を出す
  let x = event.clientX;
  let y = event.clientY;
  if (x === 0 && y === 0) {
    const rect = event.currentTarget.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }
  showFloatText('+' + formatFull(value), x + (Math.random() - 0.5) * 40, y);
  worldOnClick();   // 演出（world.js）に知らせる
  render();
}

function resetGame() {
  if (!confirm('本当にデータを消して最初からやり直しますか？')) return;
  state = createNewState();
  saveGame();
  renderAchievementList();
  render();
}

// ---------- 数字の表示 ----------
// 例：12345 → 1.23万、 3.4e9 → 34.0億。とても大きい数は 1.23e24 のように表示
const UNITS = [
  { value: 1e20, name: '垓' },
  { value: 1e16, name: '京' },
  { value: 1e12, name: '兆' },
  { value: 1e8,  name: '億' },
  { value: 1e4,  name: '万' },
];

function formatNumber(n) {
  if (n >= 1e24) return n.toExponential(2).replace('e+', 'e');
  for (const unit of UNITS) {
    if (n >= unit.value) return floorWithDigits(n / unit.value) + unit.name;
  }
  return Math.floor(n).toLocaleString('ja-JP');
}

// 毎秒生産量用。100未満は小数第1位まで出す（例：0.2）
function formatRate(n) {
  if (n < 100) return (Math.floor(n * 10) / 10).toString();
  return formatNumber(n);
}

// 全部の桁を書く（例：1234567 → 1,234,567）。主役の数字（ステージの胞子・毎秒・クリック・ランキング）に使う
// 下の桁がどんどん回っていくのを見て楽しめるように。とても大きい数（1e24 以上）だけは formatNumber と同じ書き方にする
function formatFull(n) {
  if (n >= 1e24) return formatNumber(n);
  return Math.floor(n).toLocaleString('ja-JP');
}

// 毎秒生産量の全桁版。100未満は小数第1位まで出す（例：0.2）
function formatRateFull(n) {
  if (n < 100) return formatRate(n);
  return formatFull(n);
}

// 1.23 / 12.3 / 123 のように、だいたい3桁で切り捨てる
function floorWithDigits(x) {
  const digits = x < 10 ? 2 : x < 100 ? 1 : 0;
  const p = Math.pow(10, digits);
  return (Math.floor(x * p) / p).toFixed(digits);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

// ---------- 実績 ----------
// current() = 今の値、target = 目標の値。current() が target 以上になったら達成
// 図鑑など、ほかのファイルの情報も使うので、一覧はゲーム開始時（init）に作る
let ACHIEVEMENTS = [];

function buildAchievementList() {
  const list = [];
  const add = (id, icon, name, desc, current, target) => list.push({ id, icon, name, desc, current, target });

  [[100, 'はじめての胞子'], [1e4, '胞子の山'], [1e6, '胞子の海'], [1e8, '胞子の嵐'],
   [1e12, '胞子の大陸'], [1e16, '胞子の星'], [1e20, '胞子の宇宙']].forEach(([n, name]) => {
    add(`total-${n}`, '✨', name, `累計で胞子を ${formatNumber(n)} 集める`, () => state.lifetimeSpores, n);
  });
  [[100, 'クリック見習い'], [1000, 'クリック職人'], [10000, 'クリックの達人']].forEach(([n, name]) => {
    add(`click-${n}`, '👆', name, `キノコを ${n.toLocaleString('ja-JP')} 回クリックする`, () => state.clicks, n);
  });
  [[10, '胞子のめばえ'], [1000, '胞子工場'], [1e5, '胞子の都'], [1e7, '胞子の帝国'], [1e9, '胞子の神']].forEach(([n, name]) => {
    add(`sps-${n}`, '⚡', name, `毎秒 ${formatNumber(n)} 胞子を作る`, () => getSps(), n);
  });
  for (const f of FACILITIES) {
    add(`first-${f.id}`, f.icon, `はじめての${f.name}`, `${f.name}を1つ持つ`, () => state.owned[f.id], 1);
  }
  // 施設ごとに、たくさんそろえた実績（小さなごほうびを、こまめに出すため）
  for (const f of FACILITIES) {
    [[10, 'の村'], [50, 'の国']].forEach(([n, suffix]) => {
      add(`many-${f.id}-${n}`, f.icon, `${f.name}${suffix}`, `${f.name}を ${n} 個持つ`, () => state.owned[f.id], n);
    });
  }
  [[10, '小さな村'], [100, '菌の町'], [500, '菌の国'], [1000, '菌の大帝国']].forEach(([n, name]) => {
    add(`owned-${n}`, '🏘️', name, `施設を合計 ${n.toLocaleString('ja-JP')} 個持つ`, () => getTotalOwned(), n);
  });
  add('all-types', '👑', '王国の完成', `${FACILITIES.length}種類すべての施設を持つ`,
    () => FACILITIES.filter(f => state.owned[f.id] > 0).length, FACILITIES.length);
  [[5, '強化の第一歩'], [20, '研究熱心'], [UPGRADES.length, 'すべてを極めし者']].forEach(([n, name]) => {
    add(`upgrade-${n}`, '📜', name, `強化を ${n} 個買う`, () => state.upgrades.length, n);
  });
  [[1, '生まれ変わり'], [5, '輪廻の王']].forEach(([n, name]) => {
    add(`prestige-${n}`, '⭐', name, `${n} 回転生する`, () => state.prestigeCount, n);
  });
  // id は前のバージョン（黄金胞子）のまま。名前だけ「星」に変えた
  [[10, '星の森'], [100, '星の王国']].forEach(([n, name]) => {
    add(`golden-${n}`, '⭐', name, `星の胞子を ${n} 個持つ`, () => state.starSpores, n);
  });
  add('fever-1', '🌪️', 'はじめての嵐', '胞子の嵐を起こす', () => state.feverCount, 1);
  add('fever-10', '🌪️', '嵐を呼ぶ者', '胞子の嵐を 10 回起こす', () => state.feverCount, 10);
  add('combo-100', '🔥', 'コンボの達人', 'コンボを 100 つなげる', () => state.bestCombo, 100);
  add('zukan-6', '📖', 'キノコ博士', '図鑑に 6 種類のる', () => getDiscoveredCount(), 6);
  add('zukan-all', '📖', 'キノコ図鑑コンプリート', `図鑑の ${SPECIES.length} 種類をすべて見つける`, () => getDiscoveredCount(), SPECIES.length);
  add('perfect-root', '🕸️', 'かんぺきな根', '3種類とも相性の良い根をつくる', () => hasPerfectRoot() ? 1 : 0, 1);
  // id の「golden-」は星の胞子の実績で使っているので、金のキノコは「kin-」にする
  [[1, 'はじめての金のキノコ'], [10, '金のキノコハンター'], [77, '黄金の王']].forEach(([n, name]) => {
    add(`kin-${n}`, '🌟', name, `金のキノコを ${n} 回押す`, () => state.goldenClicks, n);
  });
  [[3, '3日つづけて'], [7, '1週間の王']].forEach(([n, name]) => {
    add(`streak-${n}`, '📅', name, `${n} 日つづけて王国に来る`, () => getBestStreak(), n);   // daily.js
  });
  add('mission-10', '📅', 'ミッション名人', '今日のミッションを 10 個達成する', () => getMissionsDone(), 10);   // daily.js
  return list;
}

function hasAchievement(id) {
  return state.achievements.includes(id);
}

// 新しく達成した実績を記録する。silent = true のときはお知らせを出さない（読み込み時など）
function checkAchievements(silent) {
  for (const a of ACHIEVEMENTS) {
    if (hasAchievement(a.id) || a.current() < a.target) continue;
    state.achievements.push(a.id);
    if (!silent) {
      showToast(`🏆 実績解除『${a.name}』　生産 +${Math.round(ACHIEVEMENT_BONUS * 100)}%`);
      playSound('achievement');
    }
    if (!document.getElementById('achievement-modal').hidden) renderAchievementList();
  }
}

// ---------- 次の目標（あと何をすれば強くなるか） ----------
// 進み具合が100%に近いものから3つ選ぶ
function getNextGoals() {
  const goals = [];

  // 次の施設を買う
  const next = FACILITIES.find(f => state.owned[f.id] === 0);
  if (next) {
    goals.push({
      text: `『${next.name}』を買う`,
      effect: '新しい施設が菌糸に育つ',
      progress: state.spores / next.baseCost,
      remain: `あと ${formatNumber(Math.max(0, next.baseCost - state.spores))} 胞子`,
    });
  }

  // 施設をそろえて、強化を出す
  for (const f of FACILITIES) {
    const owned = state.owned[f.id];
    const step = FACILITY_UPGRADE_STEPS.find(s => owned < s.need);
    if (owned === 0 || !step) continue;
    goals.push({
      text: `${f.name}を ${step.need} 個にする`,
      effect: `${f.name}の生産2倍の強化が出る`,
      progress: owned / step.need,
      remain: `あと ${step.need - owned} 個`,
    });
  }

  // 出ている強化のうち、いちばん安いもの
  const upgrade = UPGRADES.find(u => !hasUpgrade(u.id) && u.isUnlocked());
  if (upgrade) {
    goals.push({
      text: `強化『${upgrade.name}』を買う`,
      effect: upgrade.desc,
      progress: state.spores / upgrade.cost,
      remain: state.spores >= upgrade.cost ? '今すぐ買えます！' : `あと ${formatNumber(upgrade.cost - state.spores)} 胞子`,
    });
  }

  // いちばん近い実績
  let bestAchievement = null;
  for (const a of ACHIEVEMENTS) {
    if (hasAchievement(a.id) || a.id.startsWith('streak-')) continue;   // 日数の実績は待つしかないので、目標には出さない
    const p = a.current() / a.target;
    if (!bestAchievement || p > bestAchievement.progress) bestAchievement = { a, progress: p };
  }
  if (bestAchievement) {
    goals.push({
      text: `実績『${bestAchievement.a.name}』`,
      effect: `${bestAchievement.a.desc}（生産 +${Math.round(ACHIEVEMENT_BONUS * 100)}%）`,
      progress: bestAchievement.progress,
      remain: `${Math.floor(Math.min(1, bestAchievement.progress) * 100)}%`,
    });
  }

  // まだ転生したことがなければ、最初の星の胞子までの道のり
  if (state.prestigeCount === 0 && getPrestigeGain() === 0 && state.totalSpores >= STAR_BASE * 0.01) {
    goals.push({
      text: '星の胞子をもらえるようにする',
      effect: '転生できるようになる（生産 +10% がずっと続く）',
      progress: state.totalSpores / STAR_BASE,
      remain: `あと ${formatNumber(STAR_BASE - state.totalSpores)} 胞子`,
    });
  }

  // 根の植え替えで相性が良くなるとき
  const better = findBetterPlanting();   // district.js
  if (better) {
    goals.push({
      text: `${better.facility.name}を「${ROOTS[better.root].name}」に植え替える`,
      effect: `相性 +${Math.round(better.gain * SYNERGY_BONUS * 100)}%（ステージ右上の「根」から）`,
      progress: 0.95,
      remain: '今すぐできます',
    });
  }

  // 胞子の嵐（ゲージが半分を超えたら目標に出す）
  if (!isFever() && combo.gauge >= FEVER_GAUGE_MAX * 0.5) {
    goals.push({
      text: '連打で胞子の嵐を起こす',
      effect: `${getFeverSeconds()}秒間 生産・クリック ×${getFeverPower()}`,
      progress: combo.gauge / FEVER_GAUGE_MAX,
      remain: `ゲージ ${Math.floor(combo.gauge)}%`,
    });
  }

  // 星の道の次の特典（starroad.js）
  const starGoal = getStarRoadGoal();
  if (starGoal) goals.push(starGoal);

  // 今日のミッション（daily.js）。目標が多すぎないよう、一番近いものを1つだけ
  const mission = getMissionGoals().sort((a, b) => b.progress - a.progress)[0];
  if (mission) goals.push(mission);

  goals.sort((a, b) => b.progress - a.progress);
  return goals.slice(0, 3);
}

// ---------- 画面づくり ----------
const facilityElements = {};   // 施設ボタンの部品を覚えておく
let shownUpgradeKey = null;    // 今表示している強化の一覧（変わったときだけ作り直す）

function buildFacilityList() {
  const list = document.getElementById('facility-list');
  FACILITIES.forEach((f, i) => {
    const button = document.createElement('button');
    button.className = 'facility';
    button.style.setProperty('--hue', (i * 36 + 340) % 360);   // 施設ごとに色を変える
    button.innerHTML = `
      <span class="facility-icon">${f.icon}</span>
      <span class="facility-info">
        <span class="facility-name">${f.name}</span>
        <span class="facility-desc">${f.desc}</span>
        <span class="facility-sps"></span>
      </span>
      <span class="facility-side">
        <span class="facility-owned"></span>
        <span class="facility-cost"></span>
      </span>
      <span class="card-bar"><span></span></span>`;
    button.addEventListener('click', () => buyFacility(f));
    list.appendChild(button);

    facilityElements[f.id] = {
      button: button,
      owned: button.querySelector('.facility-owned'),
      cost: button.querySelector('.facility-cost'),
      sps: button.querySelector('.facility-sps'),
      bar: button.querySelector('.card-bar span'),
    };
  });
}

// 買えるまでの進み具合（0〜100%）
function toPercent(have, need) {
  return Math.floor(Math.min(1, have / need) * 100) + '%';
}

function renderFacilities() {
  FACILITIES.forEach((f, i) => {
    const el = facilityElements[f.id];
    // 1つ前の施設を持っていれば、次の施設が見えるようになる
    const visible = i === 0 || state.owned[f.id] > 0 || state.owned[FACILITIES[i - 1].id] > 0;
    el.button.hidden = !visible;
    if (!visible) return;

    const amount = getBuyAmount(f);
    const cost = getCost(f, amount);
    el.owned.textContent = state.owned[f.id];
    el.cost.textContent = (amount > 1 ? `×${amount}　` : '') + `${formatNumber(cost)} 胞子`;
    // 天気や根の相性で強くなっているときは、しるしを添える（例：🌧️×2　🕸️+30%）
    const weatherMark = getWeatherMultiplier(f.id) > 1 ? `　${getWeatherIcons(f.id)}×${getWeatherMultiplier(f.id)}` : '';
    const partners = getPartnerCount(f.id);
    const rootMark = partners > 0 ? `　🕸️+${Math.round(partners * SYNERGY_BONUS * 100)}%` : '';
    el.sps.textContent = `1つで毎秒 ${formatRate(getSpsPerFacility(f) * getGlobalMultiplier())}${weatherMark}${rootMark}`;
    el.button.classList.toggle('boosted', weatherMark !== '' || rootMark !== '');
    el.button.classList.toggle('affordable', state.spores >= cost);
    el.bar.style.width = toPercent(state.spores, cost);
  });
}

function renderUpgrades() {
  const list = document.getElementById('upgrade-list');
  const available = UPGRADES.filter(u => !hasUpgrade(u.id) && u.isUnlocked());
  const key = available.map(u => u.id).join(',');

  // 出ている強化の種類が変わったときだけ、ボタンを作り直す
  if (key !== shownUpgradeKey) {
    shownUpgradeKey = key;
    list.innerHTML = '';
    for (const u of available) {
      const button = document.createElement('button');
      button.className = 'upgrade';
      button.dataset.id = u.id;
      button.innerHTML = `
        <span class="upgrade-name">${u.name}</span>
        <span class="upgrade-desc">${u.desc}</span>
        <span class="upgrade-cost">${formatNumber(u.cost)} 胞子</span>
        <span class="card-bar"><span></span></span>`;
      button.addEventListener('click', () => buyUpgrade(u));
      list.appendChild(button);
    }
    document.getElementById('upgrade-empty').hidden = available.length > 0;
  }

  // 買えるものを明るく表示し、買える数をバッジで知らせる
  let affordable = 0;
  for (const button of list.children) {
    const u = UPGRADES.find(x => x.id === button.dataset.id);
    const canBuy = state.spores >= u.cost;
    button.classList.toggle('affordable', canBuy);
    button.querySelector('.card-bar span').style.width = toPercent(state.spores, u.cost);
    if (canBuy) affordable++;
  }
  for (const id of ['upgrade-badge', 'tab-badge']) {
    const badge = document.getElementById(id);
    badge.hidden = affordable === 0;
    badge.textContent = affordable;
  }
}

let shownGoalsHtml = '';   // 前回表示した目標（変わったときだけ書きかえる）

function renderGoals() {
  const html = getNextGoals().map(g => `
    <div class="goal">
      <div class="goal-text">${g.text}</div>
      <div class="goal-effect">${g.effect}</div>
      <div class="goal-bar"><span style="width:${Math.floor(Math.min(1, g.progress) * 100)}%"></span></div>
      <div class="goal-remain">${g.remain}</div>
    </div>`).join('');
  if (html === shownGoalsHtml) return;
  shownGoalsHtml = html;
  document.getElementById('goal-list').innerHTML = html;
}

// 実績の一覧（ウィンドウを開いているときだけ作る）
function renderAchievementList() {
  document.getElementById('achievement-summary').textContent =
    `${state.achievements.length} / ${ACHIEVEMENTS.length} 達成`;
  document.getElementById('achievement-list').innerHTML = ACHIEVEMENTS.map(a => `
    <div class="achievement ${hasAchievement(a.id) ? 'earned' : ''}">
      <span class="achievement-icon">${a.icon}</span>
      <span class="achievement-body">
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
      </span>
    </div>`).join('');
}

// 転生ボタンと転生ウィンドウ
function renderPrestige() {
  const gain = getPrestigeGain();
  // 次の星の胞子1個まで：もらえる数が gain+1 になるのは、胞子が (gain+1)² × STAR_BASE に届いたとき
  const from = gain * gain * STAR_BASE;
  const to = (gain + 1) * (gain + 1) * STAR_BASE;
  document.getElementById('prestige-open').classList.toggle('ready', gain >= 1);
  document.getElementById('prestige-have').textContent = state.starSpores.toLocaleString('ja-JP');
  document.getElementById('prestige-have-bonus').textContent = `+${Math.round(state.starSpores * STAR_BONUS * 100)}%`;
  document.getElementById('prestige-gain').textContent = gain.toLocaleString('ja-JP');
  document.getElementById('prestige-gain-bonus').textContent = `+${Math.round(gain * STAR_BONUS * 100)}%`;
  document.getElementById('prestige-bar').style.width = toPercent(state.totalSpores - from, to - from);
  document.getElementById('prestige-next').textContent = `次の星の胞子まで あと ${formatNumber(to - state.totalSpores)} 胞子`;
  document.getElementById('prestige-button').disabled = gain < 1;
  if (!document.getElementById('prestige-modal').hidden) renderStarRoad();   // starroad.js（開いているときだけ）

  const line = document.getElementById('star-line');
  line.hidden = state.starSpores === 0;
  line.textContent = `⭐ 星の胞子 ${state.starSpores.toLocaleString('ja-JP')}（生産 +${Math.round(state.starSpores * STAR_BONUS * 100)}%）`;
}

// ---------- ステージ中央の数字（胞子・毎秒・クリック） ----------
// 胞子の数は、画面の書きかえ（1秒に約60回）のたびに「今ごろ増えているはずの数」を表示して、なめらかに増やす
let shownSps = 0;              // 今の毎秒生産量（render で更新。毎回計算すると重いので覚えておく）
let counterFitKey = '';        // 前回、文字の大きさを合わせたときの「桁数」と「画面の幅」

function animateCounter() {
  const elapsed = Math.max(0, Date.now() - lastTick) / 1000;
  setCounterText('spores', formatFull(state.spores + shownSps * elapsed));
  requestAnimationFrame(animateCounter);
}

// 数字を書きかえる（同じなら書きかえない）。桁数が変わったら、はみ出さないように文字の大きさを合わせる
function setCounterText(id, text) {
  const el = document.getElementById(id);
  if (el.textContent === text) return;
  if (id === 'spores') el.innerHTML = toFixedWidthHtml(text);
  else el.textContent = text;
  const key = `${document.getElementById('spores').textContent.length},${document.getElementById('sps').textContent.length},` +
    `${document.getElementById('click-value').textContent.length},${document.getElementById('stage').clientWidth}`;
  if (key !== counterFitKey) {
    counterFitKey = key;
    fitCounter();
  }
}

// 胞子の数は、1文字ずつ同じ幅の枠に入れる。
// 見出しの文字（Yusei Magic）は「1」が細く「4」が太いなど数字ごとに幅がちがうので、そのままだと増えるたびに左右に揺れるため
// （中に入るのは数字・カンマ・小数点・e だけなので、そのまま HTML にしても安全）
function toFixedWidthHtml(text) {
  return Array.from(text).map(ch => `<span class="${/[0-9e]/.test(ch) ? 'digit' : 'mark'}">${ch}</span>`).join('');
}

// 左上の天気の看板と、右上の「根」ボタンにはさまれた、まん中の空いている幅に収まるよう、文字を小さくする
function fitCounter() {
  const stage = document.getElementById('stage');
  const weather = document.querySelector('.weather');
  const rightLeft = Math.min(document.getElementById('root-open').offsetLeft, document.getElementById('daily-open').offsetLeft);
  const sideWidth = Math.max(weather.offsetLeft + weather.offsetWidth, stage.clientWidth - rightLeft) + 8;
  const free = stage.clientWidth - sideWidth * 2;
  const sporesLine = document.getElementById('spores').parentElement;
  const spsLine = document.querySelector('.counter .sps');
  // いったん元の大きさ・1行に戻してから測る（--fit は style.css で文字の大きさにかける倍率）
  sporesLine.style.removeProperty('--fit');
  spsLine.style.removeProperty('--fit');
  spsLine.classList.remove('stacked');
  // 「毎秒・クリック」の行は、かなり小さくしないと入らないときは、2行に分けてから測り直す
  if (free / getTextWidth(spsLine) < 0.8) spsLine.classList.add('stacked');
  for (const line of [sporesLine, spsLine]) {
    const scale = free / getTextWidth(line);
    if (scale < 1) line.style.setProperty('--fit', Math.max(0.3, scale - 0.01).toFixed(3));
  }
}

// 文字そのものの幅（入れ物の幅ではなく）
function getTextWidth(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().width;
}

function render() {
  shownSps = getSps();
  setCounterText('spores', formatFull(state.spores));
  setCounterText('sps', formatRateFull(shownSps));
  setCounterText('click-value', formatFull(getClickValue()));
  document.getElementById('stat-total').textContent = formatNumber(state.lifetimeSpores);
  document.getElementById('stat-clicks').textContent = state.clicks.toLocaleString('ja-JP');
  document.getElementById('stat-buildings').textContent = getTotalOwned().toLocaleString('ja-JP');
  document.getElementById('stat-bonus').textContent = `+${Math.round(state.achievements.length * ACHIEVEMENT_BONUS * 100)}%`;
  document.getElementById('stat-prestige').textContent = `${state.prestigeCount} 回`;
  document.getElementById('achievement-count').textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;
  document.title = `${formatNumber(state.spores)} 胞子 - キノコ王国`;
  document.getElementById('hint').hidden = state.clicks >= 5;   // 最初の数回だけ説明を出す

  renderFacilities();
  renderUpgrades();
  renderGoals();
  renderPrestige();
  renderCombo();         // combo.js
  renderWeather();       // weather.js
  renderZukanButton();   // zukan.js
  renderGolden();        // golden.js
  renderDailyButton();   // daily.js
}

// 右上に小さなお知らせを出す（数秒で消える）
function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.addEventListener('animationend', e => {
    if (e.animationName === 'toastOut') el.remove();
  });
  document.getElementById('toast-area').appendChild(el);
}

function showFloatText(text, x, y) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.addEventListener('animationend', () => el.remove());
  document.getElementById('effects').appendChild(el);
}

function showModal(text) {
  document.getElementById('modal-text').textContent = text;
  document.getElementById('modal').hidden = false;
}

// ---------- セーブ・ロード ----------
function saveGame() {
  state.lastSaved = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // 保存できない環境（プライベートモードなど）では何もしない
  }
}

function loadGame() {
  const s = createNewState();
  let data = null;
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) data = JSON.parse(text);
  } catch (e) {
    data = null;
  }
  if (!data) return s;

  // 壊れたデータでも動くように、1つずつ確認しながら読み込む
  s.spores = toSafeNumber(data.spores);
  s.totalSpores = toSafeNumber(data.totalSpores);
  // 転生機能より前のセーブデータには lifetimeSpores がないので、totalSpores で代わりにする
  s.lifetimeSpores = Math.max(toSafeNumber(data.lifetimeSpores), s.totalSpores);
  // 星の胞子は、前のバージョンでは「黄金胞子（goldenSpores）」という名前だったので、そちらも読む
  s.starSpores = Math.floor(toSafeNumber(data.starSpores !== undefined ? data.starSpores : data.goldenSpores));
  s.prestigeCount = Math.floor(toSafeNumber(data.prestigeCount));
  s.bestCombo = Math.floor(toSafeNumber(data.bestCombo));
  s.feverCount = Math.floor(toSafeNumber(data.feverCount));
  // 図鑑：知っている種類だけ、セーブされていた順に読む
  if (data.zukan && typeof data.zukan === 'object') {
    for (const [id, value] of Object.entries(data.zukan)) {
      const n = Math.floor(toSafeNumber(value));
      if (SPECIES.some(sp => sp.id === id) && n > 0) s.zukan[id] = n;
    }
  }
  if (data.chibiSpecies && typeof data.chibiSpecies === 'object') {
    for (const [slot, id] of Object.entries(data.chibiSpecies)) {
      if (SPECIES.some(sp => sp.id === id) && Number(slot) >= 0 && Number(slot) < CHIBI_SLOTS) s.chibiSpecies[slot] = id;
    }
  }
  // 根：知っている施設の、0〜4 の番号だけ、セーブされていた順に読む
  if (data.roots && typeof data.roots === 'object') {
    for (const [id, value] of Object.entries(data.roots)) {
      const r = Number(value);
      if (FACILITIES.some(f => f.id === id) && Number.isInteger(r) && r >= 0 && r < ROOTS.length) s.roots[id] = r;
    }
  }
  s.goldenClicks = Math.floor(toSafeNumber(data.goldenClicks));
  s.daily = loadDaily(data.daily);   // daily.js（壊れたデータでも動くように確認しながら読む）
  s.clicks = Math.floor(toSafeNumber(data.clicks));
  for (const f of FACILITIES) {
    s.owned[f.id] = Math.floor(toSafeNumber(data.owned && data.owned[f.id]));
  }
  if (Array.isArray(data.upgrades)) {
    s.upgrades = data.upgrades.filter(id => UPGRADES.some(u => u.id === id));
  }
  if (Array.isArray(data.achievements)) {
    s.achievements = data.achievements.filter(id => ACHIEVEMENTS.some(a => a.id === id));
  }
  s.lastSaved = toSafeNumber(data.lastSaved) || Date.now();
  return s;
}

function toSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// 閉じていた間の生産分をプレゼントする（わかりやすくするため、天気は計算に入れない）
function giveOfflineReward() {
  const elapsed = Math.max(0, (Date.now() - state.lastSaved) / 1000);
  const maxHours = hasStarPerk('offline-48') ? 48 : OFFLINE_MAX_HOURS;   // 星の道（starroad.js）
  const seconds = Math.min(elapsed, maxHours * 3600);
  const gain = getSps(false) * seconds;
  if (seconds < 10 || gain <= 0) return;
  addSpores(gain);
  showModal(`おかえりなさい！\n${formatDuration(seconds)}のあいだに\n胞子を ${formatNumber(gain)} 集めました。`);
}

// ---------- ゲームの進行 ----------
let lastTick = Date.now();

function tick() {
  const now = Date.now();
  const seconds = (now - lastTick) / 1000;
  lastTick = now;
  addSpores(getSps() * seconds);
  updateCombo(now, seconds);   // ゲージが減る・嵐が終わる（combo.js）
  updateGolden(now);           // 金のキノコを出す・消す（golden.js）
  updateDaily(now);            // 日付が変わったらログインボーナス（daily.js）
  plantUnplanted();            // 根が増えたら、植わっていない施設を植える（district.js）
  checkAchievements(false);
  render();
}

function setupEvents() {
  document.getElementById('mushroom').addEventListener('click', onMushroomClick);
  document.getElementById('reset-button').addEventListener('click', resetGame);
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal').hidden = true;
  });

  // 実績ウィンドウを開く・閉じる（外側の暗い所を押しても閉じる）
  const achievementModal = document.getElementById('achievement-modal');
  document.getElementById('achievement-button').addEventListener('click', () => {
    renderAchievementList();
    achievementModal.hidden = false;
  });
  document.getElementById('achievement-close').addEventListener('click', () => {
    achievementModal.hidden = true;
  });
  achievementModal.addEventListener('click', e => {
    if (e.target === achievementModal) achievementModal.hidden = true;
  });

  // 転生ウィンドウ
  const prestigeModal = document.getElementById('prestige-modal');
  document.getElementById('prestige-open').addEventListener('click', () => {
    prestigeModal.hidden = false;
  });
  document.getElementById('prestige-close').addEventListener('click', () => {
    prestigeModal.hidden = true;
  });
  prestigeModal.addEventListener('click', e => {
    if (e.target === prestigeModal) prestigeModal.hidden = true;
  });
  document.getElementById('prestige-button').addEventListener('click', onPrestigeButton);

  // スマホの「施設 / 目標・強化」タブ
  const tabButtons = document.querySelectorAll('.tabs button');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById('app').dataset.tab = button.dataset.tab;
      tabButtons.forEach(b => b.classList.toggle('active', b === button));
    });
  });

  // ×1 / ×10 / 最大 の切り替え
  const modeButtons = document.querySelectorAll('#buy-mode button');
  modeButtons.forEach(button => {
    button.addEventListener('click', () => {
      buyMode = button.dataset.mode === 'max' ? 'max' : Number(button.dataset.mode);
      modeButtons.forEach(b => b.classList.toggle('active', b === button));
      render();
    });
  });

  // 閉じる直前・別のタブに移ったときにもセーブ
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
  });
}

function init() {
  ACHIEVEMENTS = buildAchievementList();
  state = loadGame();
  buildFacilityList();
  setupEvents();
  setupZukan();   // zukan.js
  setupRoots();   // district.js
  setupSound();   // sound.js
  setupRanking(); // ranking.js
  setupGolden();  // golden.js
  setupDaily();   // daily.js
  plantUnplanted();
  // 図鑑ができる前のセーブで持っていたちびキノコは、「ふつうのキノコ」として図鑑にのせる
  if (state.owned.chibi > 0 && !state.zukan.normal) state.zukan.normal = state.owned.chibi;
  checkAchievements(true);   // すでに条件を満たしている実績は、お知らせなしで達成にする
  giveOfflineReward();
  render();
  requestAnimationFrame(animateCounter);   // 胞子の数をなめらかに増やす
  window.addEventListener('resize', () => {
    counterFitKey = '';
    fitCounter();
  });
  setInterval(tick, TICK_MS);
  setInterval(saveGame, SAVE_INTERVAL_MS);
}
// init() は main.js から呼ぶ（ほかのファイルを全部読み込んでから始めるため）
