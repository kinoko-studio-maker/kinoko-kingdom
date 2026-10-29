// =============================================
// キノコ王国 ― ログインボーナスと今日のミッション
// 毎日来ると、ログインボーナスがもらえる（つづけて来るほど豪華。7日でひとめぐり）。
// 毎日ちがうミッションが3つ出て、達成するとごほうびがもらえる
// 日付はパソコン・スマホの時計（その国の時間）で決める
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
// ログインボーナス（1日目〜7日目）。minutes = 毎秒生産の何分ぶん、clicks = クリック何回分、golden = 金のキノコがすぐ出る
const LOGIN_REWARDS = [
  { minutes: 10, clicks: 100 },
  { minutes: 15, clicks: 150 },
  { minutes: 20, clicks: 200, golden: true },
  { minutes: 30, clicks: 300 },
  { minutes: 40, clicks: 400 },
  { minutes: 50, clicks: 500 },
  { minutes: 90, clicks: 1000, golden: true },
];
// ミッションの種類。targets = 目標の候補（日によってどれかになる）、max = 回数ではなく「一番大きかった値」で数える
const MISSION_POOL = [
  { id: 'click',   icon: '👆', text: n => `王様キノコを ${n} 回クリックする`, targets: [200, 400, 800] },
  { id: 'buy',     icon: '🏠', text: n => `施設を ${n} 個買う`,               targets: [20, 40, 80] },
  { id: 'upgrade', icon: '📜', text: n => `強化を ${n} 個買う`,               targets: [1, 2, 3] },
  { id: 'fever',   icon: '🌪️', text: n => `胞子の嵐を ${n} 回起こす`,         targets: [1, 2, 3] },
  { id: 'golden',  icon: '🌟', text: n => `金のキノコを ${n} 回押す`,          targets: [2, 3, 5] },
  { id: 'combo',   icon: '🔥', text: n => `コンボを ${n} つなげる`,            targets: [30, 50, 80], max: true },
];
const MISSION_COUNT = 3;
const MISSION_REWARD = { minutes: 15, clicks: 150 };          // ミッション1つのごほうび
const MISSION_ALL_REWARD = { minutes: 30, clicks: 300, golden: true };   // 3つ全部達成したときのおまけ

// ---------- 日付 ----------
function getToday(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterday(now = Date.now()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return getToday(d.getTime());
}

// ---------- データ ----------
// 新しく作るときと、セーブから読むときで、中身の並び順をそろえる（セーブ→ロードで同じになるように）
function makeDaily(lastDay, streak, bestStreak, rewardDay, missionDay, missions, allClaimed, missionsDone) {
  return { lastDay, streak, bestStreak, rewardDay, missionDay, missions, allClaimed, missionsDone };
}

function makeMission(id, target, progress, claimed) {
  return { id, target, progress, claimed };
}

// セーブデータを、1つずつ確認しながら読む（なければ null）
function loadDaily(data) {
  if (!data || typeof data !== 'object') return null;
  const text = v => (typeof v === 'string' ? v : '');
  const missions = Array.isArray(data.missions) ? data.missions
    .filter(m => m && MISSION_POOL.some(p => p.id === m.id))
    .slice(0, MISSION_COUNT)
    .map(m => makeMission(m.id, Math.max(1, Math.floor(toSafeNumber(m.target))), Math.floor(toSafeNumber(m.progress)), m.claimed === true)) : [];
  return makeDaily(text(data.lastDay), Math.floor(toSafeNumber(data.streak)), Math.floor(toSafeNumber(data.bestStreak)),
    text(data.rewardDay), text(data.missionDay), missions, data.allClaimed === true, Math.floor(toSafeNumber(data.missionsDone)));
}

// 今日のミッションを決める（日付から決まるので、同じ日ならだれでも同じミッション）
function makeMissions(day) {
  const seed = Number(day.replace(/-/g, '')) || 1;
  const rand = createRandom(seed);   // game.js
  const pool = MISSION_POOL.slice();
  const list = [];
  while (list.length < MISSION_COUNT && pool.length > 0) {
    const p = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    list.push(makeMission(p.id, p.targets[Math.floor(rand() * p.targets.length)], 0, false));
  }
  return list;
}

// 日付が変わっていたら、ログインの記録とミッションを新しくする
function refreshDaily(now = Date.now()) {
  if (!state.daily) state.daily = makeDaily('', 0, 0, '', '', [], false, 0);
  const d = state.daily;
  const today = getToday(now);
  if (d.lastDay !== today) {
    d.streak = d.lastDay === getYesterday(now) ? d.streak + 1 : 1;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
    d.lastDay = today;
  }
  if (d.missionDay !== today) {
    d.missionDay = today;
    d.missions = makeMissions(today);
    d.allClaimed = false;
  }
}

function getBestStreak() {
  return state.daily ? state.daily.bestStreak : 0;
}

function getMissionsDone() {
  return state.daily ? state.daily.missionsDone : 0;
}

// 今日のログインボーナス（まだ受け取っていなければ）
function isLoginRewardReady() {
  return !!state.daily && state.daily.rewardDay !== state.daily.lastDay;
}

function getLoginRewardIndex() {
  return (Math.max(1, state.daily.streak) - 1) % LOGIN_REWARDS.length;
}

function getMissionInfo(m) {
  return MISSION_POOL.find(p => p.id === m.id);
}

function isMissionComplete(m) {
  return m.progress >= m.target;
}

// 受け取れるごほうびの数（ボタンの赤い数字）
function getDailyReadyCount() {
  if (!state.daily) return 0;
  let n = isLoginRewardReady() ? 1 : 0;
  for (const m of state.daily.missions) if (isMissionComplete(m) && !m.claimed) n++;
  if (isAllMissionsReady()) n++;
  return n;
}

function isAllMissionsReady() {
  const d = state.daily;
  return !!d && !d.allClaimed && d.missions.length > 0 && d.missions.every(m => m.claimed);
}

// ---------- ゲームのできごとを数える（game.js・combo.js・golden.js から呼ばれる） ----------
function onMissionEvent(type, amount) {
  if (!state.daily) return;
  for (const m of state.daily.missions) {
    if (m.id !== type || m.claimed) continue;
    const before = isMissionComplete(m);
    m.progress = getMissionInfo(m).max ? Math.max(m.progress, amount) : m.progress + amount;
    if (!before && isMissionComplete(m)) {
      showToast(`📅 ミッション達成！『${getMissionInfo(m).text(m.target)}』　「📅 毎日」で受け取ろう`);
      playSound('achievement');   // sound.js
    }
  }
}

// ---------- ごほうび ----------
// minutes 分の生産 ＋ clicks 回分のクリック。金のキノコつきなら、すぐに出す
function getRewardAmount(reward) {
  return getSps() * reward.minutes * 60 + getClickValue() * reward.clicks;
}

function giveReward(reward) {
  const amount = getRewardAmount(reward);
  addSpores(amount);
  if (reward.golden) golden.nextAt = Date.now();   // golden.js：次の tick で金のキノコが出る
  playSound('upgrade');
  return amount;
}

function rewardText(reward) {
  return `胞子 +${formatFull(getRewardAmount(reward))}${reward.golden ? '＋🌟金のキノコ' : ''}`;
}

function claimLoginReward() {
  if (!isLoginRewardReady()) return;
  const amount = giveReward(LOGIN_REWARDS[getLoginRewardIndex()]);
  state.daily.rewardDay = state.daily.lastDay;
  showToast(`📅 ログインボーナス ${state.daily.streak}日目！ 胞子 +${formatFull(amount)}`);
  renderDaily();
  render();
}

function claimMission(index) {
  const m = state.daily && state.daily.missions[index];
  if (!m || m.claimed || !isMissionComplete(m)) return;
  m.claimed = true;
  state.daily.missionsDone++;
  const amount = giveReward(MISSION_REWARD);
  showToast(`📅 ミッションのごほうび 胞子 +${formatFull(amount)}`);
  renderDaily();
  render();
}

function claimAllMissions() {
  if (!isAllMissionsReady()) return;
  state.daily.allClaimed = true;
  const amount = giveReward(MISSION_ALL_REWARD);
  showToast(`📅 ミッションぜんぶ達成！ 胞子 +${formatFull(amount)}　金のキノコが現れるよ`);
  renderDaily();
  render();
}

// ---------- 画面 ----------
function renderDailyButton() {
  const badge = document.getElementById('daily-badge');
  const n = getDailyReadyCount();
  badge.hidden = n === 0;
  if (badge.textContent !== String(n)) badge.textContent = n;
}

function renderDaily() {
  const d = state.daily;
  if (!d) return;
  document.getElementById('daily-streak').textContent = `${d.streak}日つづけて来ています（最高 ${d.bestStreak}日）`;

  // 7日分のスタンプ。受け取った日は押してあり、今日は光る
  const index = getLoginRewardIndex();
  const ready = isLoginRewardReady();
  document.getElementById('login-calendar').innerHTML = LOGIN_REWARDS.map((r, i) => {
    const done = i < index || (i === index && !ready);
    const today = i === index;
    return `
      <div class="login-day ${done ? 'done' : ''} ${today && ready ? 'today' : ''} ${r.golden ? 'special' : ''}">
        <div class="login-day-name">${i + 1}日目</div>
        <div class="login-day-icon">${done ? '🍄' : r.golden ? '🌟' : '🎁'}</div>
        <div class="login-day-reward">${r.minutes}分ぶん</div>
      </div>`;
  }).join('');
  const claim = document.getElementById('login-claim');
  claim.disabled = !ready;
  claim.textContent = ready ? `受け取る（${rewardText(LOGIN_REWARDS[index])}）` : '今日のぶんは受け取りました。また明日！';

  // ミッション
  document.getElementById('mission-list').innerHTML = d.missions.map((m, i) => {
    const info = getMissionInfo(m);
    const complete = isMissionComplete(m);
    const shown = Math.min(m.progress, m.target);
    const button = m.claimed ? '<span class="mission-claimed">受け取り済み</span>'
      : `<button class="mission-claim ok-button" data-index="${i}" ${complete ? '' : 'disabled'}>受け取る</button>`;
    return `
      <div class="mission ${complete ? 'complete' : ''} ${m.claimed ? 'claimed' : ''}">
        <span class="mission-icon">${info.icon}</span>
        <span class="mission-body">
          <span class="mission-text">${info.text(m.target)}</span>
          <span class="goal-bar"><span style="width:${Math.floor(shown / m.target * 100)}%"></span></span>
          <span class="mission-progress">${shown} / ${m.target}　ごほうび：${MISSION_REWARD.minutes}分ぶんの胞子</span>
        </span>
        ${button}
      </div>`;
  }).join('');
  const all = document.getElementById('mission-all');
  all.disabled = !isAllMissionsReady();
  all.textContent = d.allClaimed ? 'ぜんぶ達成のおまけ：受け取り済み' : `3つぜんぶ達成のおまけ（${MISSION_ALL_REWARD.minutes}分ぶん＋🌟金のキノコ）`;
}

function openDaily() {
  refreshDaily();
  renderDaily();
  document.getElementById('daily-modal').hidden = false;
}

// 0.1秒ごとに game.js の tick から呼ばれる：日付が変わったら新しくして、ログインボーナスのウィンドウを出す
function updateDaily(now) {
  if (state.daily && state.daily.lastDay === getToday(now) && state.daily.missionDay === state.daily.lastDay) return;
  refreshDaily(now);
  if (isLoginRewardReady() && hasPlayedBefore()) openDaily();
}

// 初めて遊ぶ人には、いきなりウィンドウを出さない（まず王様キノコを押してほしいので、ボタンの赤い数字で知らせるだけ）
function hasPlayedBefore() {
  return state.lifetimeSpores > 0;
}

// 「次の目標」に出すミッション（game.js の getNextGoals から呼ばれる）
function getMissionGoals() {
  if (!state.daily) return [];
  return state.daily.missions.filter(m => !m.claimed).map(m => {
    const info = getMissionInfo(m);
    const complete = isMissionComplete(m);
    return {
      text: `📅 ${info.text(m.target)}`,
      effect: `今日のミッション（ごほうび：${MISSION_REWARD.minutes}分ぶんの胞子）`,
      progress: complete ? 1.01 : Math.min(m.progress / m.target, 0.99),   // 受け取れるものは一番上に
      remain: complete ? '達成！「📅 毎日」で受け取ろう' : `${Math.min(m.progress, m.target)} / ${m.target}`,
    };
  });
}

function setupDaily() {
  const modal = document.getElementById('daily-modal');
  document.getElementById('daily-open').addEventListener('click', openDaily);
  document.getElementById('daily-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.hidden = true;
  });
  document.getElementById('login-claim').addEventListener('click', claimLoginReward);
  document.getElementById('mission-all').addEventListener('click', claimAllMissions);
  document.getElementById('mission-list').addEventListener('click', e => {
    const button = e.target.closest('.mission-claim');
    if (button) claimMission(Number(button.dataset.index));
  });
  // 開いたときに、今日のログインボーナスがあればウィンドウを出す
  refreshDaily();
  if (isLoginRewardReady() && hasPlayedBefore()) openDaily();
}
