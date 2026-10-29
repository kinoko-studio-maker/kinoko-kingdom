// =============================================
// キノコ王国 ― 星の道
// 星の胞子が決まった数たまるたびに、ずっと続く特典が解放される（星の胞子は減らない）。
// 転生を何度もくり返す人の、長い目標になる
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
// need = 必要な星の胞子の数
const STAR_ROAD = [
  { need: 3,   id: 'golden-often', icon: '🌟', text: '金のキノコが 20% 早く出る' },
  { need: 10,  id: 'start-chibi',  icon: '🍄', text: '転生したとき、ちびキノコ 10 本から始まる' },
  { need: 25,  id: 'offline-48',   icon: '🌙', text: '放置でもらえる時間が 24時間 → 48時間' },
  { need: 50,  id: 'golden-long',  icon: '⏳', text: '金のキノコの効果が 1.5倍 長く続く' },
  { need: 100, id: 'lucky-up',     icon: '💰', text: '金のキノコの「胞子の恵み」が 2倍' },
];

function hasStarPerk(id) {
  const perk = STAR_ROAD.find(p => p.id === id);
  return !!perk && state.starSpores >= perk.need;
}

// 次に解放される特典（全部解放ずみなら null）
function getNextStarPerk() {
  return STAR_ROAD.find(p => state.starSpores < p.need) || null;
}

// ---------- 画面（転生のウィンドウの中） ----------
function renderStarRoad() {
  const list = document.getElementById('star-road');
  const html = STAR_ROAD.map(p => {
    const open = state.starSpores >= p.need;
    return `
      <li class="star-perk ${open ? 'open' : ''}">
        <span class="star-perk-icon">${open ? p.icon : '🔒'}</span>
        <span class="star-perk-text">${p.text}</span>
        <span class="star-perk-need">${open ? '解放ずみ' : `⭐${p.need}`}</span>
      </li>`;
  }).join('');
  if (list.innerHTML !== html) list.innerHTML = html;
}

// 「次の目標」に出す（転生したことがある人だけ）
function getStarRoadGoal() {
  const next = getNextStarPerk();
  if (!next || state.prestigeCount === 0) return null;
  const after = state.starSpores + getPrestigeGain();
  return {
    text: `⭐ 星の道：星の胞子を ${next.need} 個にする`,
    effect: next.text,
    progress: Math.min(0.98, after / next.need),
    remain: after >= next.need ? '今転生すると解放！' : `今転生すると ${after} / ${next.need}`,
  };
}
