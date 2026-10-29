// =============================================
// キノコ王国 ― 天気と時間
// 昼 → 夕方 → 夜 → 朝 と時間が流れ、ときどき雨が降る。
// 時間帯や天気によって、得意な施設（生産 ×2）が変わる
// 時計（Date.now）をもとに決めるので、だれがいつ開いても同じ天気になる
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
// 1日の流れ（minutes = その時間帯の長さ（分））
const DAY_PHASES = [
  { id: 'day',   name: '昼',   icon: '☀️', minutes: 6 },
  { id: 'dusk',  name: '夕方', icon: '🌇', minutes: 2 },
  { id: 'night', name: '夜',   icon: '🌙', minutes: 6 },
  { id: 'dawn',  name: '朝',   icon: '🌅', minutes: 2 },
];
const RAIN_CHANCE = 0.3;     // それぞれの時間帯で雨が降る確率
const WEATHER_BONUS = 2;     // 得意な施設の生産が何倍になるか

// 時間帯ごとの得意なもの（facilities = 生産 ×2 の施設、click = クリック ×2）
const PHASE_EFFECTS = {
  day:   { facilities: ['tou'],             text: '胞子の塔 ×2（風で胞子が遠くへ）' },
  dusk:  { click: true,                     text: 'クリック ×2' },
  night: { facilities: ['chibi', 'shinden'], text: 'ちびキノコ・菌の神殿 ×2' },
  dawn:  { click: true,                     text: 'クリック ×2' },
};
// 雨の日に得意な施設
const RAIN_FACILITIES = ['kinshi', 'hatake', 'mori'];
const RAIN_TEXT = '菌糸ネット・キノコ畑・菌糸の森 ×2';

const DAY_LENGTH_MS = DAY_PHASES.reduce((sum, p) => sum + p.minutes * 60000, 0);

// ---------- 今の天気を調べる ----------
// 戻り値：{ phase, phaseIndex, rain, elapsedMs, remainMs, prevPhase, prevRain, nextRain }
function getWeather(now = Date.now()) {
  const dayNumber = Math.floor(now / DAY_LENGTH_MS);
  let t = now - dayNumber * DAY_LENGTH_MS;   // その日の何ミリ秒目か
  let index = 0;
  while (t >= DAY_PHASES[index].minutes * 60000) {
    t -= DAY_PHASES[index].minutes * 60000;
    index++;
  }
  const phaseLength = DAY_PHASES[index].minutes * 60000;
  const prevIndex = (index + DAY_PHASES.length - 1) % DAY_PHASES.length;
  const nextIndex = (index + 1) % DAY_PHASES.length;
  return {
    phase: DAY_PHASES[index],
    phaseIndex: index,
    rain: isRainy(dayNumber, index),
    elapsedMs: t,
    remainMs: phaseLength - t,
    prevPhase: DAY_PHASES[prevIndex],
    prevRain: isRainy(index === 0 ? dayNumber - 1 : dayNumber, prevIndex),
    nextRain: isRainy(nextIndex === 0 ? dayNumber + 1 : dayNumber, nextIndex),
  };
}

// 何日目の何番目の時間帯に雨が降るか（決まった乱数なので、いつ調べても同じ答え）
function isRainy(dayNumber, phaseIndex) {
  const rand = createRandom(dayNumber * 10 + phaseIndex + 12345);
  return rand() < RAIN_CHANCE;
}

// 雨の日の倍率（図鑑のあまつぶキノコを見つけると、2 → 2.5）
function getRainBonus() {
  return WEATHER_BONUS + getZukanBonus('rain');
}

// 施設の天気の倍率（例：雨の日の菌糸ネットは 2）
function getWeatherMultiplier(facilityId) {
  const w = getWeather();
  let mul = 1;
  const effect = PHASE_EFFECTS[w.phase.id];
  if (effect.facilities && effect.facilities.includes(facilityId)) mul *= WEATHER_BONUS;
  if (w.rain && RAIN_FACILITIES.includes(facilityId)) mul *= getRainBonus();
  return mul;
}

// クリックの天気の倍率（夕方・朝は 2）
function getWeatherClickMultiplier() {
  return PHASE_EFFECTS[getWeather().phase.id].click ? WEATHER_BONUS : 1;
}

// 施設を強くしている天気のマーク（例：'🌙' や '🌧️'）
function getWeatherIcons(facilityId) {
  const w = getWeather();
  let icons = '';
  const effect = PHASE_EFFECTS[w.phase.id];
  if (effect.facilities && effect.facilities.includes(facilityId)) icons += w.phase.icon;
  if (w.rain && RAIN_FACILITIES.includes(facilityId)) icons += '🌧️';
  return icons;
}

// ---------- 画面（ステージ左上の天気表示） ----------
function renderWeather() {
  const w = getWeather();
  const seconds = Math.ceil(w.remainMs / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const title = `${w.phase.icon} ${w.phase.name}${w.rain ? '・🌧️ 雨' : ''}　あと ${time}`;
  const effects = PHASE_EFFECTS[w.phase.id].text + (w.rain ? `／${RAIN_TEXT.replace('×2', `×${getRainBonus()}`)}` : '');
  const titleEl = document.getElementById('weather-title');
  const effectEl = document.getElementById('weather-effect');
  if (titleEl.textContent !== title) titleEl.textContent = title;
  if (effectEl.textContent !== effects) effectEl.textContent = effects;
}
