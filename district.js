// =============================================
// キノコ王国 ― 菌糸の根（地区）と相性
// 王様キノコの根元から5本の大きな根が伸びている。施設はどれか1本の根に「植える」。
// 相性の良い施設を同じ根に植えると、両方の生産が上がる。いつでも植え替えできる（無料）
// ちびキノコは地上に生えるので、根には植えない
// =============================================

// ---------- 設定 ----------
const ROOTS = [
  { name: 'ひだまりの根', color: '#e8b84a' },
  { name: 'しめりの根',   color: '#5fb3d6' },
  { name: 'こけの根',     color: '#8cc152' },
  { name: 'いわの根',     color: '#d08a5a' },
  { name: 'ほしの根',     color: '#b388ff' },
];
const ROOT_UNLOCK_AT = [0, 0, 30, 100, 250];   // 施設を合計いくつ持つと、その根が使えるようになるか
const ROOT_CAPACITY = 3;                        // 1本の根に植えられる施設の種類
const SYNERGY_BONUS = 0.3;                      // 相性の良い相手1種類につき、生産が何%上がるか

// 相性表：[施設A, 施設B, 理由]
//   3つとも相性が良い組（全員 +60%）：雨の3つ／町の3つ／宇宙の3つ
const SYNERGIES = [
  ['kinshi', 'hatake', '菌糸が畑に栄養を運ぶ'],
  ['hatake', 'mori', '森の落ち葉が畑の肥料になる'],
  ['mori', 'kinshi', '森じゅうが菌糸でつながる'],
  ['tou', 'shinden', '塔の鐘が神殿に祈りを届ける'],
  ['shinden', 'toshi', '都市の住人が神殿をうやまう'],
  ['toshi', 'tou', '塔が都市の目印になる'],
  ['wakusei', 'ginga', '惑星が銀河をめぐる'],
  ['ginga', 'uchu', '銀河が宇宙を照らす'],
  ['uchu', 'wakusei', '宇宙が惑星を見守る'],
  ['hatake', 'tou', '畑の胞子を塔が遠くへ飛ばす'],
  ['shinden', 'mori', '神殿が森の神をまつる'],
  ['wakusei', 'tou', '塔から惑星へ胞子を打ち上げる'],
  ['uchu', 'kinshi', '宇宙の果てまで菌糸がのびる'],
];

// ---------- 調べる ----------
function isRootUnlocked(r) {
  return getTotalOwned() >= ROOT_UNLOCK_AT[r];
}

function isPartner(a, b) {
  return SYNERGIES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// 施設が植わっている根（植わっていない・根がまだ使えないときは -1）
function getRootOf(facilityId) {
  const r = state.roots[facilityId];
  if (r === undefined || !isRootUnlocked(r) || state.owned[facilityId] === 0) return -1;
  return r;
}

// 根 r に植わっている施設の id の一覧
function getRootMembers(r) {
  return FACILITIES
    .filter(f => f.id !== 'chibi' && state.owned[f.id] > 0 && state.roots[f.id] === r && isRootUnlocked(r))
    .map(f => f.id);
}

// 根 r に、施設 facilityId を植える場所があるか（自分がすでにいる場合は数えない）
function hasSpace(r, facilityId) {
  if (!isRootUnlocked(r)) return false;
  return getRootMembers(r).filter(id => id !== facilityId).length < ROOT_CAPACITY;
}

// 同じ根にいる、相性の良い相手の数
function getPartnerCount(facilityId) {
  const r = getRootOf(facilityId);
  if (r < 0) return 0;
  return getRootMembers(r).filter(id => id !== facilityId && isPartner(id, facilityId)).length;
}

// 根の相性による生産の倍率（例：相手が2種類なら 1.6）
function getDistrictMultiplier(facilityId) {
  if (facilityId === 'chibi') return 1;
  return 1 + SYNERGY_BONUS * getPartnerCount(facilityId);
}

// ---------- 植える・植え替える ----------
// 新しい施設をはじめて買ったとき：前に植えていた根があればそこへ、なければいちばん相性の良い根へ
function plantFacility(facilityId) {
  const remembered = state.roots[facilityId];
  if (remembered !== undefined && hasSpace(remembered, facilityId)) return remembered;
  let best = -1;
  let bestScore = -Infinity;
  ROOTS.forEach((root, r) => {
    if (!hasSpace(r, facilityId)) return;
    const members = getRootMembers(r).filter(id => id !== facilityId);
    const score = members.filter(id => isPartner(id, facilityId)).length * 10 - members.length;
    if (score > bestScore) { bestScore = score; best = r; }
  });
  if (best >= 0) state.roots[facilityId] = best;
  return best;
}

// 植わっていない施設があれば植える（根が増えたときや、転生のあと）
function plantUnplanted() {
  for (const f of FACILITIES) {
    if (f.id !== 'chibi' && state.owned[f.id] > 0 && getRootOf(f.id) < 0) plantFacility(f.id);
  }
}

function moveFacility(facilityId, r) {
  if (!hasSpace(r, facilityId)) return false;
  state.roots[facilityId] = r;
  return true;
}

function swapFacilities(a, b) {
  const ra = state.roots[a];
  state.roots[a] = state.roots[b];
  state.roots[b] = ra;
}

// 1つ植え替えるだけで相性が良くなる組み合わせを探す（次の目標に出す）
function findBetterPlanting() {
  let best = null;
  for (const f of FACILITIES) {
    const from = getRootOf(f.id);
    if (from < 0) continue;
    const now = getPartnerCount(f.id);
    ROOTS.forEach((root, r) => {
      if (r === from || !hasSpace(r, f.id)) return;
      const after = getRootMembers(r).filter(id => isPartner(id, f.id)).length;
      const gain = after - now;
      if (gain > 0 && (!best || gain > best.gain)) best = { facility: f, root: r, gain };
    });
  }
  return best;
}

// 3種類とも相性の良い根があるか（実績用）
function hasPerfectRoot() {
  return ROOTS.some((root, r) => {
    const m = getRootMembers(r);
    return m.length === 3 && isPartner(m[0], m[1]) && isPartner(m[1], m[2]) && isPartner(m[0], m[2]);
  });
}

// ---------- 画面（根のウィンドウ） ----------
let selectedFacility = null;   // 植え替えるために選んでいる施設

function getFacility(id) {
  return FACILITIES.find(f => f.id === id);
}

function renderRoots() {
  const list = document.getElementById('root-list');
  list.innerHTML = ROOTS.map((root, r) => {
    if (!isRootUnlocked(r)) {
      return `
        <div class="root locked" style="--root-color:${root.color}">
          <div class="root-name">${root.name}</div>
          <div class="root-locked">施設を合計 ${ROOT_UNLOCK_AT[r]} 個持つと使える</div>
        </div>`;
    }
    const members = getRootMembers(r);
    const slots = [];
    for (const id of members) {
      const f = getFacility(id);
      const partners = getPartnerCount(id);
      slots.push(`
        <button class="root-slot member ${selectedFacility === id ? 'selected' : ''}" data-facility="${id}">
          <span class="root-icon">${f.icon}</span>
          <span class="root-member-name">${f.name}</span>
          <span class="root-bonus">${partners > 0 ? `相性 +${Math.round(partners * SYNERGY_BONUS * 100)}%` : '相性なし'}</span>
        </button>`);
    }
    while (slots.length < ROOT_CAPACITY) {
      slots.push(`<button class="root-slot empty" data-root="${r}">${selectedFacility ? 'ここに植える' : 'あき'}</button>`);
    }
    return `
      <div class="root" style="--root-color:${root.color}">
        <div class="root-name">${root.name}</div>
        ${slots.join('')}
      </div>`;
  }).join('');

  // 相性表（今効いている組み合わせは目立たせる）
  document.getElementById('synergy-list').innerHTML = SYNERGIES.map(([a, b, reason]) => {
    const fa = getFacility(a);
    const fb = getFacility(b);
    const active = getRootOf(a) >= 0 && getRootOf(a) === getRootOf(b);
    return `
      <div class="synergy ${active ? 'active' : ''}">
        <span class="synergy-pair">${fa.icon}${fa.name} × ${fb.icon}${fb.name}</span>
        <span class="synergy-reason">${reason}</span>
      </div>`;
  }).join('');
}

// 根のウィンドウの中をクリックしたとき：施設を選ぶ → 移したい根の「あき」か、入れかえたい施設を押す
function onRootListClick(event) {
  const member = event.target.closest('.root-slot.member');
  const empty = event.target.closest('.root-slot.empty');
  if (member) {
    const id = member.dataset.facility;
    if (!selectedFacility || selectedFacility === id) {
      selectedFacility = selectedFacility === id ? null : id;
    } else {
      swapFacilities(selectedFacility, id);
      selectedFacility = null;
      playSound('plant');   // sound.js
    }
  } else if (empty && selectedFacility) {
    if (moveFacility(selectedFacility, Number(empty.dataset.root))) playSound('plant');
    selectedFacility = null;
  }
  renderRoots();
  render();
}

function setupRoots() {
  const modal = document.getElementById('root-modal');
  document.getElementById('root-open').addEventListener('click', () => {
    selectedFacility = null;
    renderRoots();
    modal.hidden = false;
  });
  document.getElementById('root-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.hidden = true;
  });
  document.getElementById('root-list').addEventListener('click', onRootListClick);
}
