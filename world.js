// =============================================
// キノコ王国 ― 演出（見た目だけ。胞子の計算には関わらない）
// 王様キノコの根元から菌糸が伸び、施設が「実」として育つ
// game.js の state・FACILITIES・getSps() をそのまま使う
// =============================================

// ---------- 設定（数字を変えると演出の量を調整できる） ----------
const MAX_BRANCHES = 400;            // 菌糸の枝の最大数
const BRANCHES_PER_BUILDING = 2;     // 施設1つで伸びる枝の数
const MAX_FRUITS_PER_FACILITY = 40;  // 1種類の施設で表示する「実」の最大数
const MAX_CHIBI = 150;               // 地上に生えるちびキノコの最大数（画面がせまいときは入るぶんだけ）
const CHIBI_SPACING = 18;            // ちびキノコどうしの間かく
const CHIBI_ROWS = 5;                // ちびキノコを何列まで並べるか（後ろの列ほど小さく暗い）
const KING_STIFFNESS = 600;          // 王様キノコのバネの強さ（大きいほど速くプルプルする）
const KING_DAMPING = 12;             // 王様キノコのゆれの止まりやすさ
const MAX_FLOW_PARTICLES = 150;      // 菌糸を流れる光の粒の最大数
const MAX_SKY_PARTICLES = 120;       // 空に舞う胞子の最大数
const NETWORK_SEED = 20261029;       // 菌糸の形を決める数（変えると形が変わる）
const GROW_MS = 500;                 // 枝1本が伸びきるまでの時間（ミリ秒）
const REVEAL_INTERVAL_MS = 30;       // 次の枝が伸び始めるまでの間隔（ミリ秒）
const MAX_ZOOM = 1.6;                // 序盤のいちばん寄ったときの倍率
const MAX_STRETCH = 2;               // 横長の画面で、菌糸を横に引き伸ばす最大の倍率
const PARTICLE_SPEED = 140;          // 光の粒が流れる速さ（画面上で1秒に何ピクセル）

// 「視覚効果を減らす」設定の人には、粒の量を3割にする
const MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;

// ---------- 演出の状態 ----------
const canvas = document.getElementById('world-canvas');
const ctx = canvas.getContext('2d');
const network = generateNetwork();   // 菌糸の枝（0番は王様キノコの根元）
let revealedCount = 0;               // 今見えている枝の数
let lastRevealAt = 0;
let fruits = [];                     // 施設の実 { facilityIndex, nodeIndex, bornAt }
let chibiBornAt = [];                // 地上のちびキノコが生えた時刻
let flowParticles = [];              // 菌糸を流れる光の粒
let skyParticles = [];               // 空に舞う胞子
let flowTimer = 0;
let skyTimer = 0;
let ripples = [];                    // クリックしたときに地面に広がる波紋の開始時刻
let chibiHopStart = [];              // ちびキノコごとの、ジャンプし始めた時刻
const HOP_MS = 350;                  // ちびキノコ1匹のジャンプの長さ
const HOP_DELAY_MS = 40;             // となりのちびキノコが跳ねるまでのずれ
const kingSvg = document.querySelector('#mushroom svg');
const kingSpring = { squash: 0, velocity: 0 };   // squash > 0 = つぶれている / < 0 = 上にのびている
let sparkles = [];                   // 新しく出てきたキノコや実の「キラッ」 { getPos, start }
let rootGlow = 0;                    // 根元の光り具合（0〜1）
let highlight = null;                // 新しく育った施設を光らせる { facilityIndex, until }
let announceTimer = null;
let lastFrame = performance.now();
const camera = { scale: MAX_ZOOM, stretch: 1, ready: false };   // stretch = 横方向だけの引き伸ばし
const view = { w: 0, h: 0, groundY: 0, kingX: 0, kingTopY: 0, kingHalf: 0 };
const nodeX = new Float32Array(MAX_BRANCHES + 1);   // 枝の画面上の位置（毎フレーム計算）
const nodeY = new Float32Array(MAX_BRANCHES + 1);
const sprites = {};
const decorRandom = createRandom(7);
const stars = makeDots(60);          // 空の星
const specks = makeDots(80);         // 地中の光る粒
const fireflies = makeDots(18);      // 森を飛ぶホタル
const raindrops = makeDots(140);     // 雨つぶ
let backgroundCaches = {};           // 動かない背景を、時間帯ごとに描いておいた canvas
let stormParticles = [];             // 胞子の嵐で吹き荒れる胞子
let stormTimer = 0;

// 時間帯ごとの空の色（weather.js の DAY_PHASES の id と同じ名前）
//   body = 空に出るもの（sun = 太陽 / sunset = 夕日 / moon = 月 / sunrise = 朝日）
//   stars・fireflies = 星とホタルの見え方（0 = 見えない、1 = よく見える）
const SKY_PALETTES = {
  day:   { top: '#4f8fd6', middle: '#8cc4ec', horizon: '#d8f0f7', body: 'sun',     farForest: '#7f93c4', nearForest: '#3d4c7a', hills: '#5a6f9e', spot: 0.15, stars: 0,   fireflies: 0 },
  dusk:  { top: '#2c2160', middle: '#a0507a', horizon: '#ffa36b', body: 'sunset',  farForest: '#5a3a6e', nearForest: '#2a1a3c', hills: '#4a2c55', spot: 0.3,  stars: 0.4, fireflies: 0.5 },
  night: { top: '#0f0b24', middle: '#2a1f4a', horizon: '#5a3a5e', body: 'moon',    farForest: '#33274f', nearForest: '#1c1430', hills: '#241a3a', spot: 0.45, stars: 1,   fireflies: 1 },
  dawn:  { top: '#3a4a8f', middle: '#c48aa8', horizon: '#ffd2a8', body: 'sunrise', farForest: '#6a5a8a', nearForest: '#33284f', hills: '#4f4570', spot: 0.2,  stars: 0.3, fireflies: 0.3 },
};
const SKY_FADE_MS = 3000;            // 時間帯が変わるとき、空の色が切り替わるまでの時間

// 乱数 createRandom は game.js にある（天気でも使うため）
function makeDots(count) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    dots.push({ x: decorRandom(), y: decorRandom(), phase: decorRandom() * 6.28, size: 1 + decorRandom() * 1.5 });
  }
  return dots;
}

// ---------- 菌糸の形を作る ----------
// 根元(0,0)から、まず大きな根（district.js の ROOTS）を左から右へ等間隔に伸ばす。
// そこから先は枝分かれさせ、枝は必ず親と同じ根に属する（node.root = 根の番号）。y が大きいほど深い
function getRootAngle(r) {
  return Math.PI * (0.88 - 0.76 * r / (ROOTS.length - 1));   // 0.88π（左）〜 0.12π（右）
}

function generateNetwork() {
  const rand = createRandom(NETWORK_SEED);
  const nodes = [{ x: 0, y: 0, parent: -1, angle: Math.PI / 2, bend: 0, bornAt: -Infinity, root: -1 }];
  const byRoot = ROOTS.map(() => []);   // 根ごとの枝の番号
  for (let r = 0; r < ROOTS.length; r++) {
    const angle = getRootAngle(r);
    nodes.push({ x: Math.cos(angle) * 45, y: Math.sin(angle) * 45 + 10, parent: 0, angle, bend: (rand() - 0.5) * 0.3, bornAt: -Infinity, root: r });
    byRoot[r].push(nodes.length - 1);
  }
  // 5本の根に、順番に1本ずつ枝を足していく（どの根もまんべんなく育つように）
  let turn = 0;
  let fails = 0;
  let attempts = 0;
  while (nodes.length <= MAX_BRANCHES && attempts < 50000) {
    attempts++;
    const r = turn % ROOTS.length;
    // その根の中で、新しい枝ほど選ばれやすくして、外へ外へと広がるようにする
    const list = byRoot[r];
    const parentIndex = list[Math.floor(Math.pow(rand(), 0.6) * list.length)];
    const parent = nodes[parentIndex];
    const center = getRootAngle(r);
    let angle = parent.angle + (rand() - 0.5) * 1.6;
    angle = Math.min(center + Math.PI * 0.13, Math.max(center - Math.PI * 0.13, angle));   // 自分の根の方向から外れない
    angle = Math.min(Math.PI * 0.96, Math.max(Math.PI * 0.04, angle));
    const length = 30 + rand() * 30;
    const x = parent.x + Math.cos(angle) * length;
    const y = parent.y + Math.sin(angle) * length;
    if (y < 12 || isTooClose(nodes, x, y, 20)) {
      // 何度やってもうまく伸ばせないときは、次の根の番にする
      if (++fails > 40) { turn++; fails = 0; }
      continue;
    }
    nodes.push({ x, y, parent: parentIndex, angle, bend: (rand() - 0.5) * 0.5, bornAt: -Infinity, root: r });
    list.push(nodes.length - 1);
    turn++;
    fails = 0;
  }
  return nodes;
}

// "#rrggbb" の色を、透明度つきの色にする
function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function isTooClose(nodes, x, y, minDistance) {
  for (const n of nodes) {
    if ((n.x - x) ** 2 + (n.y - y) ** 2 < minDistance ** 2) return true;
  }
  return false;
}

// ---------- 数の計算 ----------
// 施設の合計数（game.js の getTotalOwned）から、見せる枝の数を決める
function getVisibleBranchCount() {
  return Math.min(network.length - 1, getTotalOwned() * BRANCHES_PER_BUILDING);
}

// 0 → 1 に進む割合（start から duration ミリ秒かけて）
function progress(now, start, duration) {
  return Math.max(0, Math.min(1, (now - start) / duration));
}

// ---------- 更新（毎フレーム） ----------
function updateReveal(now) {
  const target = getVisibleBranchCount();
  // データを消したときなど、枝が減ったら一気に戻す
  if (target < revealedCount) {
    revealedCount = target;
    fruits = fruits.filter(fr => fr.nodeIndex <= target);
    flowParticles = [];
  }
  // 枝を1本ずつ順番に伸ばす（たくさん待っているときは少し速く）
  if (revealedCount < target && now - lastRevealAt >= REVEAL_INTERVAL_MS) {
    const step = Math.max(1, Math.ceil((target - revealedCount) / 40));
    for (let i = 0; i < step && revealedCount < target; i++) {
      revealedCount++;
      network[revealedCount].bornAt = now;
    }
    lastRevealAt = now;
  }
}

// 施設の実を、植えた根の見えている枝に割り当てる（ちびキノコは地上なので除く）
function assignFruits(now, instant) {
  FACILITIES.forEach((f, fi) => {
    if (fi === 0) return;
    const root = getRootOf(f.id);   // district.js（-1 = まだ植わっていない → どの根でもよい）
    // 植え替えたときは、前の根にあった実を消す（新しい根に生え直す）
    if (root >= 0) fruits = fruits.filter(fr => fr.facilityIndex !== fi || network[fr.nodeIndex].root === root);
    const want = Math.min(state.owned[f.id], MAX_FRUITS_PER_FACILITY);
    let mine = fruits.filter(fr => fr.facilityIndex === fi);
    if (mine.length > want) {
      const removed = mine.slice(want);
      fruits = fruits.filter(fr => !removed.includes(fr));
      mine = mine.slice(0, want);
    }
    for (let j = mine.length; j < want; j++) {
      const nodeIndex = pickFruitNode(fi, j, root);
      if (nodeIndex < 0) break;
      const node = network[nodeIndex];
      // 枝が伸びきってから実がなる
      const bornAt = instant ? -Infinity : Math.max(now, node.bornAt + GROW_MS);
      fruits.push({ facilityIndex: fi, nodeIndex, bornAt });
      if (!instant) addSparkle(() => ({ x: nodeX[nodeIndex], y: nodeY[nodeIndex] }), bornAt);
    }
  });
}

// 実をつける枝を選ぶ。植えた根（root）の、見えていて空いている枝の中から。外側（新しく伸びた枝）を選びやすくする
function pickFruitNode(facilityIndex, number, root) {
  const used = new Set(fruits.map(fr => fr.nodeIndex));
  const candidates = [];
  for (let i = 1; i <= revealedCount; i++) {
    if ((root < 0 || network[i].root === root) && !used.has(i)) candidates.push(i);
  }
  if (candidates.length === 0) return -1;
  const rand = createRandom(facilityIndex * 1000 + number + 1);
  const pick = Math.floor((0.4 + rand() * 0.6) * candidates.length);
  return candidates[Math.min(candidates.length - 1, pick)];
}

// 地上のちびキノコ（買った数だけ生える。画面に入るぶんまで）
function updateChibi(now, instant) {
  const count = Math.min(state.owned.chibi, getChibiCapacity());
  if (chibiBornAt.length > count) {
    chibiBornAt.length = count;
    chibiHopStart.length = count;
  }
  while (chibiBornAt.length < count) {
    const k = chibiBornAt.length;
    const born = instant ? -Infinity : now + (k % 5) * 60;
    chibiBornAt.push(born);
    chibiHopStart.push(-Infinity);
    if (!instant) {
      addSparkle(() => {
        const p = getChibiPosition(k);
        return { x: p.x, y: p.y - p.size * 0.5 };
      }, born);
    }
  }
}

// 新しく出てきたものに「キラッ」を付ける（多すぎるときは省く）
function addSparkle(getPos, start) {
  if (sparkles.length < 60) sparkles.push({ getPos, start });
}

// 王様キノコのバネ：押すとつぶれて、プルンと戻る。細かく分けて計算して、動きを安定させる
function updateKingSpring(dt) {
  let remain = dt;
  while (remain > 0) {
    const h = Math.min(remain, 1 / 240);
    const accel = -KING_STIFFNESS * kingSpring.squash - KING_DAMPING * kingSpring.velocity;
    kingSpring.velocity += accel * h;
    kingSpring.squash += kingSpring.velocity * h;
    remain -= h;
  }
  const s = kingSpring.squash;
  kingSvg.style.transform = Math.abs(s) < 0.002
    ? ''
    : `translateY(${s < 0 ? s * 30 : 0}%) scale(${1 + s * 0.6}, ${1 - s})`;
}

// 全部の枝が画面に収まるように、なめらかに引いていく
function updateCamera(dt) {
  let maxSide = 1;
  let maxDepth = 1;
  for (let i = 1; i <= revealedCount; i++) {
    maxSide = Math.max(maxSide, Math.abs(network[i].x));
    maxDepth = Math.max(maxDepth, network[i].y);
  }
  const margin = 34;
  const fitX = (view.w / 2 - margin) / maxSide;
  const fitY = (view.h - view.groundY - margin) / maxDepth;
  const target = Math.max(0.05, Math.min(MAX_ZOOM, fitX, fitY));
  // 横に余白があるときは、横方向だけ広げて画面いっぱいに使う
  const stretchTarget = Math.max(1, Math.min(MAX_STRETCH, fitX / target));
  if (!camera.ready) {
    camera.scale = target;
    camera.stretch = stretchTarget;
    camera.ready = true;
  } else {
    const k = Math.min(1, dt * 2);
    camera.scale += (target - camera.scale) * k;
    camera.stretch += (stretchTarget - camera.stretch) * k;
  }
}

// 光の粒と空の胞子
function updateParticles(now, dt) {
  const sps = getSps();
  const networkSps = sps - state.owned.chibi * getSpsPerFacility(FACILITIES[0]);

  // 生産量が多いほど粒が増える（桁が1つ増えるごとに少しずつ）
  skyTimer += dt * MOTION * Math.min(12, 0.5 + 2 * Math.log10(1 + sps));
  while (skyTimer >= 1) {
    skyTimer -= 1;
    spawnSkySpore();
  }
  flowTimer += dt * MOTION * Math.min(30, 1 + 4 * Math.log10(1 + networkSps));
  while (flowTimer >= 1) {
    flowTimer -= 1;
    spawnFlowParticle(now);
  }

  // 空の胞子：ふわふわ上へ
  for (const p of skyParticles) {
    p.life += dt;
    p.vx *= 1 - p.drag * dt;
    p.vy *= 1 - p.drag * dt;
    p.x += (p.vx + Math.sin(p.life * 2 + p.phase) * 8) * dt;
    p.y += p.vy * dt;
  }
  skyParticles = skyParticles.filter(p => p.life < p.maxLife);

  // 菌糸の粒：実から根元へ、枝をたどって流れる
  const speed = PARTICLE_SPEED / camera.scale;   // 画面上で同じ速さに見えるようにする
  for (const p of flowParticles) {
    let move = speed * dt;
    while (move > 0 && p.step < p.path.length - 1) {
      const a = network[p.path[p.step]];
      const b = network[p.path[p.step + 1]];
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      const remain = (1 - p.t) * length;
      if (move < remain) {
        p.t += move / length;
        move = 0;
      } else {
        move -= remain;
        p.step++;
        p.t = 0;
      }
    }
    if (p.step >= p.path.length - 1) {
      p.done = true;
      rootGlow = Math.min(1, rootGlow + 0.06);
    }
  }
  flowParticles = flowParticles.filter(p => !p.done);
  rootGlow *= 1 - Math.min(1, dt * 1.5);
}

function spawnSkySpore() {
  if (skyParticles.length >= MAX_SKY_PARTICLES) return;
  const fromChibi = chibiBornAt.length > 0 && Math.random() < 0.5;
  let x = view.kingX + (Math.random() - 0.5) * view.kingHalf * 1.8;
  let y = view.kingTopY + view.kingHalf * 0.5;
  if (fromChibi) {
    const pos = getChibiPosition(Math.floor(Math.random() * chibiBornAt.length));
    x = pos.x;
    y = pos.y - pos.size;
  }
  skyParticles.push({
    x, y,
    vx: (Math.random() - 0.5) * 10,
    vy: -(15 + Math.random() * 20),
    drag: 0,
    life: 0,
    maxLife: 3 + Math.random() * 2,
    phase: Math.random() * 6.28,
    size: 1.5 + Math.random() * 1.5,
  });
}

// 生産量の多い施設の実ほど、粒を多く出す
function spawnFlowParticle(now) {
  if (fruits.length === 0 || flowParticles.length >= MAX_FLOW_PARTICLES) return;
  const weights = fruits.map(fr => {
    const f = FACILITIES[fr.facilityIndex];
    const shown = Math.min(state.owned[f.id], MAX_FRUITS_PER_FACILITY);
    return state.owned[f.id] * getSpsPerFacility(f) / Math.max(1, shown);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let chosen = fruits[0];
  for (let i = 0; i < fruits.length; i++) {
    r -= weights[i];
    if (r <= 0) { chosen = fruits[i]; break; }
  }
  if (now < chosen.bornAt) return;   // まだ実がなっていない

  // 実から根元までの道すじ
  const path = [];
  for (let i = chosen.nodeIndex; i >= 0; i = network[i].parent) path.push(i);
  flowParticles.push({ path, step: 0, t: 0, done: false });
}

// ---------- 描画 ----------
// 枝 index を少し曲げるための「引っぱる点」
function controlPoint(index) {
  const n = network[index];
  const ax = nodeX[n.parent], ay = nodeY[n.parent];
  const bx = nodeX[index], by = nodeY[index];
  return { x: (ax + bx) / 2 - (by - ay) * n.bend, y: (ay + by) / 2 + (bx - ax) * n.bend };
}

// 枝 index の曲線上の点（u = 0 で親の側、1 で枝の先）
function curvePoint(index, u) {
  const n = network[index];
  const ax = nodeX[n.parent], ay = nodeY[n.parent];
  const bx = nodeX[index], by = nodeY[index];
  const c = controlPoint(index);
  const v = 1 - u;
  return { x: v * v * ax + 2 * v * u * c.x + u * u * bx, y: v * v * ay + 2 * v * u * c.y + u * u * by };
}

// ---------- 背景 ----------
// 動かない部分（空・月・キノコの森・丘・地層・石・根・化石）は、画面の大きさが変わったときに
// 時間帯ごとに1回だけ別の canvas に描いておき、毎フレームはそれを貼るだけにする（軽くするため）
function buildBackgrounds() {
  if (view.w <= 0 || view.h <= 0) return;
  backgroundCaches = {};
  for (const id of Object.keys(SKY_PALETTES)) {
    backgroundCaches[id] = buildBackground(SKY_PALETTES[id]);
  }
}

function buildBackground(palette) {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.width = Math.round(view.w * dpr);
  c.height = Math.round(view.h * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rand = createRandom(99);   // いつも同じ景色になるように、決まった乱数を使う

  paintSky(g, palette);
  paintSkyBody(g, palette.body);
  paintMushroomForest(g, rand, { count: Math.ceil(view.w / 70), minH: 0.12, maxH: 0.3, color: palette.farForest, spot: palette.spot * 0.6 });
  paintHills(g, palette.hills);
  paintMushroomForest(g, rand, { count: Math.ceil(view.w / 160), minH: 0.25, maxH: 0.5, color: palette.nearForest, spot: palette.spot, edgeOnly: true });
  paintSoil(g, rand);
  paintRoots(g, rand);
  paintStones(g, rand);
  paintFossil(g);
  return c;
}

// 空：上から下へ、3色のグラデーション
function paintSky(g, palette) {
  const sky = g.createLinearGradient(0, 0, 0, view.groundY);
  sky.addColorStop(0, palette.top);
  sky.addColorStop(0.6, palette.middle);
  sky.addColorStop(1, palette.horizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, view.w, view.groundY);
}

// 太陽・夕日・朝日・月
function paintSkyBody(g, body) {
  const r = Math.max(14, Math.min(36, view.groundY * 0.1));
  const settings = {
    sun:     { x: 0.13, y: 0.3,  color: '#fff6c2', glow: 'rgba(255, 245, 190, 0.45)', size: 1 },
    sunset:  { x: 0.15, y: 0.82, color: '#ffb35c', glow: 'rgba(255, 150, 80, 0.5)',   size: 1.3 },
    sunrise: { x: 0.85, y: 0.82, color: '#ffd08a', glow: 'rgba(255, 200, 140, 0.5)',  size: 1.2 },
    moon:    { x: 0.13, y: 0.3,  color: '#fdf3d0', glow: 'rgba(255, 240, 200, 0.25)', size: 1 },
  }[body];
  const x = view.w * settings.x;
  const y = view.groundY * settings.y;
  const radius = r * settings.size;
  const glow = g.createRadialGradient(x, y, radius, x, y, radius * 4);
  glow.addColorStop(0, settings.glow);
  glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
  g.fillStyle = glow;
  g.fillRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
  g.fillStyle = settings.color;
  g.beginPath();
  g.arc(x, y, radius, 0, Math.PI * 2);
  g.fill();
  if (body === 'moon') {
    g.fillStyle = '#ecdcae';   // 月のクレーター
    for (const [dx, dy, s] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.38, 0.12]]) {
      g.beginPath();
      g.arc(x + dx * radius, y + dy * radius, s * radius, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// 地平線に並ぶ、大きなキノコのシルエット（カサに光る斑点つき）
function paintMushroomForest(g, rand, opt) {
  for (let i = 0; i < opt.count; i++) {
    let x = rand() * view.w;
    const height = view.groundY * (opt.minH + rand() * (opt.maxH - opt.minH));
    const capW = height * (0.6 + rand() * 0.5);
    // 手前の大きいキノコは、王様キノコに重ならないよう左右のはしに寄せる
    if (opt.edgeOnly) x = i % 2 === 0 ? rand() * view.w * 0.18 : view.w * (0.82 + rand() * 0.18);
    else if (Math.abs(x - view.kingX) < view.kingHalf * 1.4) continue;
    paintMushroomShape(g, x, view.groundY + 2, height, capW, opt.color);
    // 光る斑点
    g.fillStyle = `rgba(127, 227, 208, ${opt.spot})`;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(x + (rand() - 0.5) * capW * 0.6, view.groundY - height + capW * 0.12 + rand() * capW * 0.12, 1.5 + rand() * capW * 0.05, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function paintMushroomShape(g, x, baseY, height, capW, color) {
  const capH = capW * 0.42;
  const stemW = capW * 0.2;
  g.fillStyle = color;
  g.beginPath();   // 柄（下が少し太い）
  g.moveTo(x - stemW * 0.6, baseY);
  g.lineTo(x - stemW * 0.4, baseY - height + capH * 0.5);
  g.lineTo(x + stemW * 0.4, baseY - height + capH * 0.5);
  g.lineTo(x + stemW * 0.6, baseY);
  g.fill();
  g.beginPath();   // カサ
  g.ellipse(x, baseY - height + capH, capW / 2, capH, 0, Math.PI, Math.PI * 2);
  g.fill();
}

// なだらかな丘
function paintHills(g, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, view.groundY);
  for (let x = 0; x <= view.w; x += 8) {
    const y = view.groundY - 14 - Math.sin(x * 0.006) * 12 - Math.sin(x * 0.017 + 1) * 6;
    g.lineTo(x, y);
  }
  g.lineTo(view.w, view.groundY);
  g.fill();
}

// 地中：深さごとに色の違う地層（境目は波打つ）
function paintSoil(g, rand) {
  const depth = view.h - view.groundY;
  const layers = [
    { top: 0, color: '#4a3324' },
    { top: 0.22, color: '#3d2a2a' },
    { top: 0.5, color: '#30212f' },
    { top: 0.78, color: '#221828' },
  ];
  for (const layer of layers) {
    const phase = rand() * 6.28;
    g.fillStyle = layer.color;
    g.beginPath();
    g.moveTo(0, view.h);
    for (let x = 0; x <= view.w; x += 10) {
      const wave = layer.top === 0 ? 0 : Math.sin(x * 0.01 + phase) * 8 + Math.sin(x * 0.031 + phase * 2) * 4;
      g.lineTo(x, view.groundY + layer.top * depth + wave);
    }
    g.lineTo(view.w, view.h);
    g.fill();
  }
  // 地面のふち（こけ）
  g.fillStyle = '#3f6b3f';
  g.fillRect(0, view.groundY - 2, view.w, 6);
  g.fillStyle = '#2c4a2e';
  g.fillRect(0, view.groundY + 4, view.w, 3);
}

// 木の根（菌糸とは違う、茶色の太い線）
function paintRoots(g, rand) {
  const count = Math.max(3, Math.ceil(view.w / 220));
  g.strokeStyle = '#5c3f2b';
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = (i + 0.3 + rand() * 0.4) * view.w / count;
    if (Math.abs(x - view.kingX) < view.kingHalf * 1.5) continue;   // 王様キノコの真下はあける
    let y = view.groundY + 4;
    let angle = Math.PI / 2 + (rand() - 0.5) * 0.6;
    let width = 5 + rand() * 3;
    const steps = 6 + Math.floor(rand() * 6);
    for (let s = 0; s < steps; s++) {
      const len = 10 + rand() * 14;
      const nx = x + Math.cos(angle) * len;
      const ny = y + Math.sin(angle) * len;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      x = nx;
      y = ny;
      angle += (rand() - 0.5) * 0.7;
      width = Math.max(1, width * 0.82);
    }
  }
}

// 石ころ
function paintStones(g, rand) {
  const depth = view.h - view.groundY;
  const count = Math.ceil(view.w * depth / 7000);
  for (let i = 0; i < count; i++) {
    const x = rand() * view.w;
    const y = view.groundY + 12 + rand() * (depth - 16);
    const rx = 2 + rand() * 7;
    const ry = rx * (0.55 + rand() * 0.25);
    g.fillStyle = y - view.groundY < depth * 0.5 ? '#5b4636' : '#433348';
    g.beginPath();
    g.ellipse(x, y, rx, ry, rand() * 0.6 - 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255, 240, 220, 0.12)';   // 光が当たっているところ
    g.beginPath();
    g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
}

// 深いところに眠る、アンモナイトの化石
function paintFossil(g) {
  const depth = view.h - view.groundY;
  const scale = Math.min(1, depth / 350);   // 地中が浅い（スマホなど）ときは小さくする
  const x = view.w * 0.84;
  const y = view.groundY + depth * 0.86;
  g.strokeStyle = '#6b5a62';
  g.lineWidth = Math.max(1, 2 * scale);
  g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.2) {
    const r = (1.5 + a * 1.4) * scale;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.85;
    if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
}

// 毎フレーム描く部分：背景の画像＋またたく星＋ホタル＋揺れる草＋地中の光る粒
function drawBackground(now) {
  const { w, h, groundY } = view;

  // 時間帯が変わった直後は、前の時間帯の空から少しずつ切り替える
  const weather = getWeather();
  const fade = Math.min(1, weather.elapsedMs / SKY_FADE_MS);
  const current = backgroundCaches[weather.phase.id];
  const previous = backgroundCaches[weather.prevPhase.id];
  if (previous && fade < 1) ctx.drawImage(previous, 0, 0, w, h);
  if (current) {
    ctx.globalAlpha = fade;
    ctx.drawImage(current, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  const palette = SKY_PALETTES[weather.phase.id];
  const prevPalette = SKY_PALETTES[weather.prevPhase.id];
  const starLevel = prevPalette.stars + (palette.stars - prevPalette.stars) * fade;
  const fireflyLevel = prevPalette.fireflies + (palette.fireflies - prevPalette.fireflies) * fade;

  // 星（夜ほどよく見える）
  if (starLevel > 0) {
    ctx.fillStyle = '#fff6e8';
    for (const s of stars) {
      ctx.globalAlpha = (0.25 + 0.25 * Math.sin(now / 900 + s.phase)) * starLevel;
      ctx.fillRect(s.x * w, s.y * groundY * 0.7, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  // ホタル（キノコの森をふわふわ飛ぶ光。夜に多い）
  if (fireflyLevel > 0) {
    for (const f of fireflies) {
      const x = f.x * w + Math.sin(now / 2100 + f.phase) * 30;
      const y = groundY * (0.5 + f.y * 0.42) + Math.cos(now / 1700 + f.phase) * 12;
      drawGlow(x, y, 7, (0.35 + 0.35 * Math.sin(now / 500 + f.phase * 3)) * fireflyLevel, getGlowSprite('green'));
    }
  }

  // 草（1本ずつ、風でゆれる）
  ctx.strokeStyle = '#5d8f4f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 2; x < w; x += 6) {
    const len = 4 + ((x * 37) % 7);
    const sway = Math.sin(now / 1100 + x * 0.05) * 2;
    ctx.moveTo(x, groundY);
    ctx.lineTo(x + sway, groundY - len);
  }
  ctx.stroke();

  ctx.fillStyle = '#9be7c4';
  for (const s of specks) {
    ctx.globalAlpha = 0.08 + 0.08 * Math.sin(now / 1500 + s.phase);
    ctx.fillRect(s.x * w, groundY + 10 + s.y * (h - groundY - 10), s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

function drawNetwork(now) {
  // 枝の画面上の位置を計算（根元は王様キノコの足もと）
  for (let i = 0; i <= revealedCount; i++) {
    nodeX[i] = view.kingX + network[i].x * camera.scale * camera.stretch;
    nodeY[i] = view.groundY + network[i].y * camera.scale;
  }

  // 根ごとに色を変えて、2回ずつ描く：太くて薄い線（光のにじみ）→ 細くて明るい線
  // まだ使えない根は、細くて暗い線だけ
  const widthScale = Math.max(0.6, Math.min(1.3, Math.sqrt(camera.scale)));
  ROOTS.forEach((root, r) => {
    const unlocked = isRootUnlocked(r);
    const passes = unlocked
      ? [{ width: 7, color: withAlpha(root.color, 0.16) }, { width: 1.8, color: withAlpha(root.color, 0.85) }]
      : [{ width: 1.2, color: 'rgba(200, 190, 170, 0.22)' }];
    for (const pass of passes) {
      ctx.beginPath();
      for (let i = 1; i <= revealedCount; i++) {
        const n = network[i];
        if (n.root !== r) continue;
        const t = progress(now, n.bornAt, GROW_MS);
        if (t <= 0) continue;
        // 伸びている途中は、曲線の途中までを描く
        const ax = nodeX[n.parent], ay = nodeY[n.parent];
        const c = controlPoint(i);
        const end = curvePoint(i, t);
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(ax + (c.x - ax) * t, ay + (c.y - ay) * t, end.x, end.y);
      }
      ctx.lineWidth = pass.width * widthScale;
      ctx.strokeStyle = pass.color;
      ctx.stroke();
    }
  });

  drawSynergyLinks(now);
}

// 大きな根の名前：それぞれの根が伸びる方向へ、根元から少し離して置く（重ならないように）
// 実に隠れないよう、実を描いたあとに描く
function drawRootLabels() {
  ctx.font = '11px "Kiwi Maru", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const spreadX = Math.min(130, view.w * 0.32);
  ROOTS.forEach((root, r) => {
    if (r + 1 > revealedCount) return;
    const angle = getRootAngle(r);
    const x = view.kingX + Math.cos(angle) * spreadX;
    const y = view.groundY + 14 + Math.sin(angle) * 60;
    const label = isRootUnlocked(r) ? root.name : `🔒${root.name}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.85)';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = isRootUnlocked(r) ? root.color : 'rgba(200, 190, 170, 0.6)';
    ctx.fillText(label, x, y);
  });
}

// 伸びている枝の先と、根元の光
function drawNetworkTips(now) {
  // 伸びている枝の先を光らせる
  for (let i = 1; i <= revealedCount; i++) {
    const t = progress(now, network[i].bornAt, GROW_MS);
    if (t > 0 && t < 1) {
      const p = curvePoint(i, t);
      drawGlow(p.x, p.y, 10, 0.9);
    }
  }

  // 根元の光（粒が届くほど明るい）
  drawGlow(view.kingX, view.groundY, 26 + 30 * rootGlow, 0.3 + 0.6 * rootGlow);
}

// 相性が効いている施設どうしを、流れる点線でつなぐ（同じ根の中だけ）
function drawSynergyLinks(now) {
  ctx.setLineDash([5, 5]);
  ctx.lineDashOffset = -now / 40;   // 点線が流れて見える
  ctx.lineWidth = 2;
  for (const [a, b] of SYNERGIES) {
    const r = getRootOf(a);
    if (r < 0 || r !== getRootOf(b)) continue;
    const fa = fruits.find(fr => FACILITIES[fr.facilityIndex].id === a && now >= fr.bornAt);
    const fb = fruits.find(fr => FACILITIES[fr.facilityIndex].id === b && now >= fr.bornAt);
    if (!fa || !fb) continue;
    const ax = nodeX[fa.nodeIndex], ay = nodeY[fa.nodeIndex];
    const bx = nodeX[fb.nodeIndex], by = nodeY[fb.nodeIndex];
    ctx.strokeStyle = withAlpha(ROOTS[r].color, 0.55 + 0.3 * Math.sin(now / 300));
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 30, bx, by);   // 少し下にたわませる
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawFruits(now) {
  const baseSize = Math.max(18, Math.min(32, 30 * Math.sqrt(camera.scale)));
  const labeled = new Set();
  for (const fr of fruits) {
    const pop = easeOutBack(progress(now, fr.bornAt, 400));
    if (pop <= 0) continue;
    const f = FACILITIES[fr.facilityIndex];
    const x = nodeX[fr.nodeIndex];
    const y = nodeY[fr.nodeIndex];
    const pulse = 1 + 0.07 * Math.sin(now / 400 + fr.nodeIndex);
    const size = (baseSize + fr.facilityIndex * 0.8) * pop * pulse;

    drawGlow(x, y, size * 0.9, 0.55);
    ctx.drawImage(getEmojiSprite(f.icon), x - size / 2, y - size / 2, size, size);

    // 新しく育った施設は、輪を広げて目立たせる
    if (highlight && highlight.facilityIndex === fr.facilityIndex && now < highlight.until) {
      const ring = (now % 1000) / 1000;
      ctx.strokeStyle = `rgba(255, 209, 102, ${1 - ring})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, size * (0.6 + ring), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 種類ごとに1つだけ、持っている数を添える
    if (!labeled.has(fr.facilityIndex) && state.owned[f.id] > 1 && pop >= 1) {
      labeled.add(fr.facilityIndex);
      drawLabel(`×${state.owned[f.id].toLocaleString('ja-JP')}`, x + size * 0.45, y + size * 0.45);
    }
  }
}

// 1列に並べられる数（王様キノコの左右に、画面に入るぶん）
function getChibiPerRow() {
  const perSide = Math.max(2, Math.floor((view.w / 2 - view.kingHalf - 16) / CHIBI_SPACING));
  return perSide * 2;
}

function getChibiCapacity() {
  return Math.min(MAX_CHIBI, getChibiPerRow() * CHIBI_ROWS);
}

// k 番目のちびキノコの位置。前の列からうまっていき、後ろの列ほど上・小さく見える（奥にいる感じ）
function getChibiPosition(k) {
  const perRow = getChibiPerRow();
  const row = Math.floor(k / perRow);
  const index = k % perRow;
  const side = index % 2 === 0 ? 1 : -1;
  const slot = Math.floor(index / 2);
  const jitter = ((k * 37) % 7) - 3;
  const offset = row % 2 === 1 ? CHIBI_SPACING / 2 : 0;   // 後ろの列は半分ずらす
  return {
    x: view.kingX + side * (view.kingHalf + 16 + slot * CHIBI_SPACING + offset + jitter),
    y: view.groundY + 2 - row * 7,
    size: (24 - (k % 3) * 4) * (1 - row * 0.1),
    row,
    slot,
  };
}

function drawChibi(now) {
  for (let k = chibiBornAt.length - 1; k >= 0; k--) {   // 後ろの列から描く
    const pop = easeOutBack(progress(now, chibiBornAt[k], 400));
    if (pop <= 0) continue;
    const species = state.chibiSpecies[k] || 'normal';   // zukan.js：この場所に生えている種類
    const pos = getChibiPosition(k);
    const size = pos.size * pop * (species === 'normal' ? 1 : 1.15);   // レア種は少し大きい
    const hop = (now - chibiHopStart[k]) / HOP_MS;
    const jump = hop > 0 && hop < 1 ? Math.sin(Math.PI * hop) * 12 : 0;
    ctx.globalAlpha = 1 - pos.row * 0.12;
    ctx.save();
    ctx.translate(pos.x, pos.y - jump);
    ctx.rotate(Math.sin(now / 600 + k) * 0.12);   // ゆらゆら
    ctx.drawImage(getSpeciesSprite(species), -size / 2, -size, size, size);
    ctx.restore();
    // レア種は、ときどきキラッと光る
    if (species !== 'normal') {
      const twinkle = Math.sin(now / 350 + k * 1.7);
      if (twinkle > 0.6) drawGlow(pos.x + size * 0.25, pos.y - jump - size * 0.85, 5 + 6 * twinkle, twinkle);
    }
  }
  ctx.globalAlpha = 1;
}

// 図鑑のキノコの絵（カサの色だけ種類ごとに変える）。1回描いたら使い回す
function getSpeciesSprite(id) {
  const key = 'species-' + id;
  if (!sprites[key]) {
    const s = SPECIES.find(x => x.id === id) || SPECIES[0];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    // まわりの光（光る種類だけ）
    if (s.glow) {
      const glow = g.createRadialGradient(32, 30, 4, 32, 30, 32);
      glow.addColorStop(0, s.glow);
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 64, 64);
    }
    // 柄
    g.fillStyle = '#f3e6c8';
    g.beginPath();
    g.moveTo(24, 62);
    g.quadraticCurveTo(23, 42, 26, 30);
    g.lineTo(38, 30);
    g.quadraticCurveTo(41, 42, 40, 62);
    g.closePath();
    g.fill();
    // カサ
    if (s.cap === 'rainbow') {
      const rainbow = g.createLinearGradient(6, 0, 58, 0);
      ['#ff5f5f', '#ffb347', '#fff07a', '#6fe08a', '#5fb3ff', '#b388ff'].forEach((col, i, arr) => rainbow.addColorStop(i / (arr.length - 1), col));
      g.fillStyle = rainbow;
    } else {
      g.fillStyle = s.cap;
    }
    g.beginPath();
    g.moveTo(5, 34);
    g.quadraticCurveTo(7, 7, 32, 6);
    g.quadraticCurveTo(57, 7, 59, 34);
    g.quadraticCurveTo(32, 40, 5, 34);
    g.fill();
    g.strokeStyle = 'rgba(60, 30, 20, 0.45)';
    g.lineWidth = 1.5;
    g.stroke();
    // カサの白い点
    g.fillStyle = s.id === 'shiro' ? 'rgba(200, 185, 160, 0.9)' : 'rgba(255, 250, 240, 0.9)';
    for (const [x, y, r] of [[20, 22, 4.5], [35, 15, 3.5], [46, 25, 4.5], [30, 28, 2.5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    sprites[key] = c;
  }
  return sprites[key];
}

// 新しく出てきたキノコや実の「キラッ」
function drawSparkles(now) {
  sparkles = sparkles.filter(s => now - s.start < 500);
  for (const s of sparkles) {
    const t = (now - s.start) / 500;
    if (t < 0) continue;   // まだ出てきていない
    const p = s.getPos();
    drawGlow(p.x, p.y, 10 + 24 * t, 1 - t);
    const r = 6 + 18 * t;
    ctx.strokeStyle = `rgba(255, 245, 190, ${1 - t})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < 4; a++) {
      const angle = a * Math.PI / 2 + Math.PI / 4;
      ctx.moveTo(p.x + Math.cos(angle) * r * 0.35, p.y + Math.sin(angle) * r * 0.35);
      ctx.lineTo(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r);
    }
    ctx.stroke();
  }
}

// 雨の強さ（0〜1）。降り始めと降り終わりは、3秒かけて強く・弱くなる
function getRainAmount() {
  const w = getWeather();
  if (!w.rain) return 0;
  let amount = 1;
  if (!w.prevRain) amount = Math.min(amount, w.elapsedMs / SKY_FADE_MS);
  if (!w.nextRain) amount = Math.min(amount, w.remainMs / SKY_FADE_MS);
  return amount;
}

// 雨：少し暗くして、ななめに雨つぶを降らせる
function drawRain(now) {
  const amount = getRainAmount();
  if (amount <= 0) return;
  ctx.fillStyle = `rgba(25, 35, 70, ${0.3 * amount})`;
  ctx.fillRect(0, 0, view.w, view.h);
  const count = Math.floor(raindrops.length * amount * MOTION);
  const fallHeight = view.groundY + 20;
  ctx.strokeStyle = 'rgba(190, 215, 255, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const d = raindrops[i];
    const y = (d.y * fallHeight + now * (0.5 + d.size * 0.2)) % fallHeight - 20;
    const x = (d.x * view.w + y * 0.25) % view.w;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y + 12);
  }
  ctx.stroke();
}

// 胞子の嵐：画面じゅうを、金色の胞子が左から右へ吹き荒れる
function updateStorm(dt) {
  if (isFever()) {
    stormTimer += dt * 70 * MOTION;
    while (stormTimer >= 1) {
      stormTimer -= 1;
      if (stormParticles.length >= 160) break;
      stormParticles.push({
        x: -10,
        y: Math.random() * view.h,
        vx: 250 + Math.random() * 350,
        phase: Math.random() * 6.28,
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }
  for (const p of stormParticles) {
    p.x += p.vx * dt;
    p.y += Math.sin(p.x * 0.02 + p.phase) * 60 * dt;
  }
  stormParticles = stormParticles.filter(p => p.x < view.w + 10);
}

function drawStorm() {
  if (stormParticles.length === 0) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of stormParticles) {
    drawGlow(p.x, p.y, p.size * 3, 0.8);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// 王様キノコから、色つきの胞子をいっせいに飛ばす（胞子の嵐・転生のとき）
function burstFromKing(count, color) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * Math.random();
    const speed = 80 + Math.random() * 220;
    skyParticles.push({
      x: view.kingX,
      y: view.kingTopY + view.kingHalf * 0.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: 1.5,
      life: 0,
      maxLife: 1.5 + Math.random(),
      phase: Math.random() * 6.28,
      size: 2 + Math.random() * 2.5,
      color,
    });
  }
}

// クリックで地面に広がる波紋
function drawRipples(now) {
  ripples = ripples.filter(start => now - start < 600);
  ctx.lineWidth = 2;
  for (const start of ripples) {
    const t = progress(now, start, 600);
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.8 * (1 - t)})`;
    ctx.beginPath();
    ctx.ellipse(view.kingX, view.groundY, view.kingHalf * 1.1 + 150 * t, 5 + 16 * t, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles() {
  ctx.globalCompositeOperation = 'lighter';   // 重なるほど明るく光る
  for (const p of flowParticles) {
    const pos = curvePoint(p.path[p.step], 1 - p.t);
    drawGlow(pos.x, pos.y, 7, 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';

  for (const p of skyParticles) {
    ctx.fillStyle = p.color || '#fff3d6';
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLabel(text, x, y) {
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20, 15, 34, 0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(text, x, y);
}

function drawGlow(x, y, radius, alpha, sprite = getGlowSprite('warm')) {
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

function easeOutBack(t) {
  if (t <= 0) return 0;
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// 絵文字や光は、最初に1回だけ小さな画像にしておき、使い回す（速く描ける）
function getEmojiSprite(icon) {
  if (!sprites[icon]) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '48px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, 32, 36);
    sprites[icon] = c;
  }
  return sprites[icon];
}

// 光の玉。kind = 'warm'（オレンジ色：菌糸・実）/ 'green'（緑色：ホタル）
const GLOW_COLORS = {
  warm: ['rgba(255, 236, 180, 1)', 'rgba(255, 200, 120, 0.45)', 'rgba(255, 180, 100, 0)'],
  green: ['rgba(230, 255, 190, 1)', 'rgba(160, 240, 140, 0.45)', 'rgba(120, 220, 120, 0)'],
};

function getGlowSprite(kind) {
  const key = 'glow-' + kind;
  if (!sprites[key]) {
    const colors = GLOW_COLORS[kind];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.35, colors[1]);
    gradient.addColorStop(1, colors[2]);
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    sprites[key] = c;
  }
  return sprites[key];
}

// ---------- 1フレームぶんの処理 ----------
function updateWorld(now, dt) {
  updateKingSpring(dt);
  updateReveal(now);
  assignFruits(now, false);
  updateChibi(now, false);
  updateCamera(dt);
  updateParticles(now, dt);
  updateStorm(dt);
}

function drawWorld(now) {
  ctx.clearRect(0, 0, view.w, view.h);
  drawBackground(now);
  drawNetwork(now);
  drawNetworkTips(now);
  drawFruits(now);
  drawRootLabels();
  drawRipples(now);
  drawParticles();
  drawChibi(now);
  drawRain(now);
  drawStorm();
  drawSparkles(now);
}

function worldLoop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);   // タブを戻したときに一気に進みすぎないように
  lastFrame = now;
  updateWorld(now, dt);
  drawWorld(now);
  requestAnimationFrame(worldLoop);
}

// 画面の大きさに合わせて canvas を作り直す
function resizeWorld() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.w = rect.width;
  view.h = rect.height;

  // 王様キノコの位置から、地面の高さを決める（CSS と合わせるため）
  const king = document.getElementById('mushroom');
  view.kingX = king.offsetLeft + king.offsetWidth / 2;
  view.groundY = king.offsetTop + king.offsetHeight * 0.92;
  view.kingTopY = king.offsetTop;
  view.kingHalf = king.offsetWidth * 0.45;

  buildBackgrounds();   // 大きさが変わったので、背景も描き直す
}

// ---------- game.js から呼ばれる入口 ----------
function worldOnBuy(facility, isFirst) {
  if (!isFirst) return;
  const fi = FACILITIES.indexOf(facility);
  const root = getRootOf(facility.id);   // district.js：植えた根
  let text = `菌糸の先に『${facility.name}』が育った！`;
  if (fi === 0) text = `地上に『${facility.name}』が生えた！`;
  else if (root >= 0) text = `「${ROOTS[root].name}」に『${facility.name}』が育った！`;
  highlight = { facilityIndex: fi, until: performance.now() + 3000 };
  showAnnouncement(text);
}

// 図鑑の新種を見つけたとき（zukan.js から呼ばれる）
function worldOnDiscover(species) {
  showAnnouncement(`📖 新種発見！ ${species.name}　${species.bonusText}`);
  burstFromKing(30, '#fff1a8');
}

function worldOnClick() {
  // 王様キノコ：押した瞬間にぐっとつぶれ、バネのようにプルンと戻る（連打するとプルルルと震え続ける）
  kingSpring.squash = Math.min(0.3, Math.max(kingSpring.squash, 0) + 0.16);
  kingSpring.velocity = 0;

  // 地面に波紋が広がる
  const now = performance.now();
  if (ripples.length < 6) ripples.push(now);

  // ちびキノコ：今ジャンプしていない子だけ、王様キノコに近い順に跳ねる（跳んでいる子は着地まで続ける）
  for (let k = 0; k < chibiBornAt.length; k++) {
    if (now - chibiHopStart[k] < HOP_MS) continue;
    const pos = getChibiPosition(k);
    chibiHopStart[k] = now + pos.slot * HOP_DELAY_MS + pos.row * 30;
  }

  // カサから胞子がはじける
  const count = Math.round(14 * MOTION);
  for (let i = 0; i < count && skyParticles.length < MAX_SKY_PARTICLES; i++) {
    const angle = -Math.PI * (0.05 + Math.random() * 0.9);
    const speed = 80 + Math.random() * 130;
    skyParticles.push({
      x: view.kingX + (Math.random() - 0.5) * view.kingHalf,
      y: view.kingTopY + view.kingHalf * 0.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: 2.5,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.5,
      phase: Math.random() * 6.28,
      size: 2 + Math.random() * 1.5,
    });
  }
}

// 転生したとき：金色の胞子が王様キノコから一気にあふれ出す
function worldOnPrestige(gain) {
  showAnnouncement(`⭐ 転生！ 星の胞子 +${gain}`);
  kingSpring.squash = 0.3;
  kingSpring.velocity = 0;
  burstFromKing(60, '#ffd25e');
}

// 胞子の嵐が始まったとき（combo.js から呼ばれる）
function worldOnFeverStart() {
  showAnnouncement(`🌪️ 胞子の嵐！ ${getFeverSeconds()}秒間 生産・クリック ×${getFeverPower()}`);
  kingSpring.squash = 0.3;
  kingSpring.velocity = 0;
  burstFromKing(50, '#bfefff');
}

function showAnnouncement(text) {
  const el = document.getElementById('announce');
  el.textContent = text;
  el.hidden = true;
  void el.offsetWidth;     // 出てくるアニメーションをやり直す
  el.hidden = false;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------- はじめに1回だけ ----------
function initWorld() {
  resizeWorld();
  // ステージの大きさが変わったら（ウィンドウの大きさ変更・タブ切り替えなど）描き直す
  new ResizeObserver(resizeWorld).observe(canvas);
  // 読み込んだ時点の状態は、アニメーションなしで一気に表示する
  revealedCount = getVisibleBranchCount();
  assignFruits(performance.now(), true);
  updateChibi(performance.now(), true);
  requestAnimationFrame(worldLoop);
}
// initWorld() は main.js から呼ぶ
