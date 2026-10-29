// =============================================
// キノコ王国 ― キノコ図鑑
// ちびキノコを買うたびに抽選があり、ときどきレアなキノコが生える。
// 初めて見つけた種類は図鑑にのり、ずっと続くボーナスがもらえる（転生しても消えない）
// =============================================

// ---------- 設定：キノコの種類 ----------
//   chance = ちびキノコ1本ごとに、この種類が生える確率（0.05 = 5%）
//   when   = 生える条件（なし = いつでも / day = 昼 / duskdawn = 夕方か朝 / night = 夜 /
//            rain = 雨の日 / fever = 胞子の嵐の最中 / prestiged = 転生したことがある）
//   cap    = カサの色（rainbow = にじ色）、glow = まわりの光の色
//   bonus  = 見つけたときのボーナス（prod = 生産、click = クリック、rain = 雨の効果、
//            gauge = 嵐ゲージのたまりやすさ、feverSec = 嵐の秒数、feverMul = 嵐の倍率、star = 星の胞子1つの効果）
const SPECIES = [
  { id: 'normal',   name: 'ふつうのキノコ',   cap: '#d9413a', chance: 0,     when: null,        bonus: null,               bonusText: 'ボーナスなし',                       hint: '' },
  { id: 'shiro',    name: 'しろキノコ',       cap: '#f1ece0', chance: 0.05,  when: null,        bonus: { prod: 0.02 },     bonusText: '生産 +2%',                           hint: 'いつでも生えるが、少しめずらしい' },
  { id: 'ao',       name: 'あおキノコ',       cap: '#4a7fd0', chance: 0.04,  when: null,        bonus: { click: 0.1 },     bonusText: 'クリック +10%',                      hint: 'いつでも生えるが、少しめずらしい' },
  { id: 'hikari',   name: 'ひかりキノコ',     cap: '#5fd1bb', chance: 0.03,  when: 'night',     bonus: { prod: 0.03 },     bonusText: '生産 +3%',                           hint: '夜にだけ生えるらしい', glow: 'rgba(140, 255, 220, 0.7)' },
  { id: 'amatsubu', name: 'あまつぶキノコ',   cap: '#6fa8dc', chance: 0.04,  when: 'rain',      bonus: { rain: 0.5 },      bonusText: '雨の日の効果 ×2 → ×2.5',             hint: '雨の日にだけ生えるらしい' },
  { id: 'honoo',    name: 'ほのおキノコ',     cap: '#ff7a2a', chance: 0.03,  when: 'day',       bonus: { gauge: 0.25 },    bonusText: '嵐ゲージが 25% たまりやすい',        hint: '昼にだけ生えるらしい', glow: 'rgba(255, 150, 60, 0.6)' },
  { id: 'yuuyake',  name: 'ゆうやけキノコ',   cap: '#f08a6b', chance: 0.03,  when: 'duskdawn',  bonus: { click: 0.15 },    bonusText: 'クリック +15%',                      hint: '夕方か朝にだけ生えるらしい' },
  { id: 'koori',    name: 'こおりキノコ',     cap: '#bfe6ff', chance: 0.015, when: null,        bonus: { feverSec: 3 },    bonusText: '胞子の嵐が 3秒長くなる',             hint: 'いつでも生えるが、めずらしい', glow: 'rgba(190, 235, 255, 0.6)' },
  { id: 'suishou',  name: 'すいしょうキノコ', cap: '#c3a8ff', chance: 0.03,  when: 'fever',     bonus: { feverMul: 1 },    bonusText: '胞子の嵐の倍率 +1',                  hint: '胞子の嵐の最中にだけ生えるらしい', glow: 'rgba(200, 170, 255, 0.7)' },
  { id: 'hoshi',    name: 'ほしキノコ',       cap: '#f2c14e', chance: 0.015, when: 'prestiged', bonus: { star: 0.01 },     bonusText: '星の胞子1つの効果 +1%',              hint: '転生したことのある王国に生えるらしい', glow: 'rgba(255, 220, 120, 0.7)' },
  { id: 'niji',     name: 'にじいろキノコ',   cap: 'rainbow', chance: 0.006, when: null,        bonus: { prod: 0.05 },     bonusText: '生産 +5%',                           hint: 'とてもめずらしい', glow: 'rgba(255, 255, 255, 0.6)' },
  { id: 'densetsu', name: 'でんせつのキノコ', cap: '#6b2fb3', chance: 0.001, when: null,        bonus: { prod: 0.1 },      bonusText: '生産 +10%',                          hint: '1000本に1本と言われている', glow: 'rgba(180, 120, 255, 0.8)' },
];
const CHIBI_SLOTS = 150;   // レア種を地上に並べる場所の数（world.js の MAX_CHIBI と同じ）

// ---------- 見つけた種類とボーナス ----------
function hasSpecies(id) {
  return (state.zukan[id] || 0) > 0;
}

function getDiscoveredCount() {
  return SPECIES.filter(s => hasSpecies(s.id)).length;
}

// 見つけた種類のボーナスの合計（key は bonus の名前。例：'prod'）
function getZukanBonus(key) {
  let sum = 0;
  for (const s of SPECIES) {
    if (s.bonus && s.bonus[key] && hasSpecies(s.id)) sum += s.bonus[key];
  }
  return sum;
}

function getZukanProdMultiplier() {
  return 1 + getZukanBonus('prod');
}

function getZukanClickMultiplier() {
  return 1 + getZukanBonus('click');
}

// ---------- 抽選 ----------
// 今、その種類が生える条件を満たしているか
function isSpeciesAvailable(s) {
  const phase = getWeather().phase.id;
  switch (s.when) {
    case 'day': return phase === 'day';
    case 'duskdawn': return phase === 'dusk' || phase === 'dawn';
    case 'night': return phase === 'night';
    case 'rain': return getWeather().rain;
    case 'fever': return isFever();
    case 'prestiged': return state.prestigeCount > 0;
    default: return true;
  }
}

// 1本ぶんの抽選。めずらしい順ではなく、表の順に確率を足していく
function rollSpecies() {
  const r = Math.random();
  let sum = 0;
  for (const s of SPECIES) {
    if (!s.chance || !isSpeciesAvailable(s)) continue;
    sum += s.chance;
    if (r < sum) return s.id;
  }
  return 'normal';
}

// ちびキノコを買ったときに game.js から呼ばれる（firstIndex = 買う前に持っていた数）
function onChibiBought(amount, firstIndex) {
  const found = [];
  for (let i = 0; i < amount; i++) {
    const id = rollSpecies();
    const isNew = !hasSpecies(id);
    state.zukan[id] = (state.zukan[id] || 0) + 1;
    if (id === 'normal') continue;
    // 地上に生える場所：あいていればその場所、いっぱいなら、ふつうのキノコの場所と入れかえる
    state.chibiSpecies[pickChibiSlot(firstIndex + i)] = id;
    if (isNew) found.push(SPECIES.find(s => s.id === id));
  }
  if (found.length > 0) playSound('discover');   // sound.js
  for (const s of found) {
    showToast(`📖 新種発見！ ${s.name}（${s.bonusText}）`);
    worldOnDiscover(s);
  }
  if (found.length > 0 && !document.getElementById('zukan-modal').hidden) renderZukanList();
}

function pickChibiSlot(index) {
  if (index < CHIBI_SLOTS) return index;
  for (let tries = 0; tries < 20; tries++) {
    const slot = Math.floor(Math.random() * CHIBI_SLOTS);
    if (!state.chibiSpecies[slot]) return slot;
  }
  return Math.floor(Math.random() * CHIBI_SLOTS);
}

// ---------- 画面 ----------
function renderZukanButton() {
  document.getElementById('zukan-count').textContent = `${getDiscoveredCount()}/${SPECIES.length}`;
}

const speciesImageCache = {};   // キノコの絵（world.js で描いたもの）を画像にしておく

function renderZukanList() {
  document.getElementById('zukan-summary').textContent = `${getDiscoveredCount()} / ${SPECIES.length} 種類`;
  document.getElementById('zukan-list').innerHTML = SPECIES.map(s => {
    if (!hasSpecies(s.id)) {
      return `
        <div class="species unknown">
          <div class="species-image">？</div>
          <div class="species-body">
            <div class="species-name">？？？</div>
            <div class="species-hint">${s.hint || 'ちびキノコを買うと生える'}</div>
          </div>
        </div>`;
    }
    if (!speciesImageCache[s.id]) speciesImageCache[s.id] = getSpeciesSprite(s.id).toDataURL();
    return `
      <div class="species">
        <img class="species-image" src="${speciesImageCache[s.id]}" alt="">
        <div class="species-body">
          <div class="species-name">${s.name}</div>
          <div class="species-bonus">${s.bonusText}</div>
          <div class="species-count">見つけた数 ${state.zukan[s.id].toLocaleString('ja-JP')}</div>
        </div>
      </div>`;
  }).join('');
}

function setupZukan() {
  const modal = document.getElementById('zukan-modal');
  document.getElementById('zukan-open').addEventListener('click', () => {
    renderZukanList();
    modal.hidden = false;
  });
  document.getElementById('zukan-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.hidden = true;
  });
}
