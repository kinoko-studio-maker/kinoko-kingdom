// =============================================
// キノコ王国 ― 効果音
// 音のファイルは使わず、ブラウザの中で音を作って鳴らす（Web Audio という仕組み）。
// だから著作権の心配がなく、インターネットにつながっていなくても鳴る
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
const SOUND_KEY = 'kinoko-kingdom-sound';   // 音の大きさの設定を覚えておく場所（セーブとは別なので、データを消しても残る）
// 右上の音ボタンを押すたびに、大 → 小 → なし → 大 … と切り替わる
const SOUND_LEVELS = [
  { volume: 0.5, icon: '🔊', name: '大' },
  { volume: 0.2, icon: '🔉', name: '小' },
  { volume: 0,   icon: '🔇', name: 'なし' },
];

// 音の高さ（Hz）。C = ド、E = ミ、G = ソ、A = ラ。数字が大きいほど高い音
const NOTE = { C4: 262, G4: 392, C5: 523, E5: 659, G5: 784, A5: 880, C6: 1047, D6: 1175, E6: 1319, G6: 1568, A6: 1760 };

// 音の種類。gap = 同じ音を続けて鳴らせる間隔（秒）。連打や実績のまとめ解除で音がうるさくならないように
const SOUNDS = {
  // 王様キノコを押した：「ポコッ」。コンボが続くほど少しずつ高くなる（コンボ24で1オクターブ上）
  click: { gap: 0.03, play: (comboCount = 1) => {
    const up = Math.pow(2, Math.min(comboCount, 24) / 24);
    tone(420 * up, 0, 0.09, { volume: 0.35, slideTo: 220 * up });
  } },
  // 施設を買った：「チャリン」
  buy: { gap: 0.05, play: () => {
    tone(NOTE.E5, 0, 0.08, { wave: 'triangle' });
    tone(NOTE.A5, 0.06, 0.16, { wave: 'triangle' });
  } },
  // 胞子が足りなくて買えなかった：小さく「ブッ」
  deny: { gap: 0.2, play: () => {
    tone(180, 0, 0.12, { wave: 'square', volume: 0.06, slideTo: 140 });
  } },
  // 強化を買った：ドミソド と駆け上がる
  upgrade: { gap: 0.1, play: () => {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(f, i * 0.06, 0.18, { wave: 'triangle', volume: 0.25 }));
  } },
  // 実績を達成した：「パッパラー」
  achievement: { gap: 0.4, play: () => {
    tone(NOTE.G5, 0, 0.1, { wave: 'triangle', volume: 0.25 });
    tone(NOTE.C6, 0.1, 0.1, { wave: 'triangle', volume: 0.25 });
    tone(NOTE.E6, 0.2, 0.45, { wave: 'triangle', volume: 0.25 });
    tone(NOTE.C6, 0.2, 0.45, { wave: 'sine', volume: 0.15 });
  } },
  // 図鑑に新しい種類がのった：キラキラと高い音
  discover: { gap: 0.3, play: () => {
    [NOTE.E6, NOTE.G6, NOTE.D6, NOTE.A6, NOTE.G6, NOTE.C6].forEach((f, i) => tone(f, i * 0.07, 0.3, { volume: 0.18 }));
  } },
  // 胞子の嵐が始まった：「ゴォーッ」という風と、明るい和音
  fever: { gap: 1, play: () => {
    whoosh(0, 1.2, 300, 3000, 0.5);
    [NOTE.C5, NOTE.E5, NOTE.G5].forEach(f => tone(f, 0.15, 0.8, { wave: 'triangle', volume: 0.12 }));
  } },
  // 胞子の嵐が終わった：風がおさまる
  feverEnd: { gap: 1, play: () => {
    whoosh(0, 0.8, 1500, 200, 0.25);
  } },
  // 転生した：ゆっくり駆け上がる、神秘的な音
  prestige: { gap: 1, play: () => {
    [NOTE.C4, NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(f, i * 0.12, 1.0, { volume: 0.18 }));
  } },
  // 金のキノコが現れた：「キラリン」と小さく知らせる
  goldenAppear: { gap: 1, play: () => {
    tone(NOTE.G6, 0, 0.25, { volume: 0.12 });
    tone(NOTE.C6, 0.08, 0.35, { volume: 0.1 });
  } },
  // 金のキノコを押した：「シャラララン」
  golden: { gap: 0.3, play: () => {
    [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C6 * 2, NOTE.G6, NOTE.C6 * 2].forEach((f, i) => tone(f, i * 0.05, 0.35, { wave: 'triangle', volume: 0.16 }));
  } },
  // 根の植え替え：「ポン」
  plant: { gap: 0.05, play: () => {
    tone(300, 0, 0.1, { volume: 0.3, slideTo: 520 });
  } },
};

// ---------- 音を鳴らす仕組み ----------
let audio = null;    // 音を作る装置（AudioContext）。初めて音を鳴らすときに作る
let master = null;   // 全体の音量つまみ
let soundLevel = loadSoundLevel();
const lastPlayed = {};   // 音ごとに、最後に鳴らした時刻

// ゲームのあちこちから呼ばれる。name = SOUNDS の名前、value = 音に渡す数（click のコンボ数など）
function playSound(name, value) {
  if (SOUND_LEVELS[soundLevel].volume === 0) return;
  const sound = SOUNDS[name];
  const now = performance.now();
  if (now - (lastPlayed[name] || -Infinity) < sound.gap * 1000) return;
  lastPlayed[name] = now;
  try {
    if (!prepareAudio()) return;
    sound.play(value);
  } catch (e) {
    // 音が鳴らせない環境でも、ゲームは止めない
  }
}

// 音の装置を用意する。ブラウザは「画面を一度押すまで音を出さない」決まりなので、止まっていたら動かし直す
function prepareAudio() {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audio = new AudioContextClass();
    master = audio.createGain();
    master.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  master.gain.value = SOUND_LEVELS[soundLevel].volume;
  return true;
}

// 1つの音を鳴らす。freq = 高さ(Hz)、start = 何秒後に鳴らすか、length = 長さ(秒)
//   wave = 音色（sine = やわらかい / triangle = 笛のよう / square = ピコピコ）、slideTo = 鳴りながらこの高さまで変える
function tone(freq, start, length, { wave = 'sine', volume = 0.3, slideTo = null } = {}) {
  const t = audio.currentTime + start;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  // すっと立ち上がって、だんだん消える
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

// 「サーッ」という風の音。ザーという雑音の、よく聞こえる高さを from → to へ動かして、風が吹き抜ける感じを出す
function whoosh(start, length, from, to, volume) {
  const t = audio.currentTime + start;
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * length), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(t);
}

// ---------- 音の大きさの切り替え ----------
function loadSoundLevel() {
  try {
    const n = Number(localStorage.getItem(SOUND_KEY));
    if (Number.isInteger(n) && n >= 0 && n < SOUND_LEVELS.length) return n;
  } catch (e) {
    // 読めない環境では、最初の設定（大）にする
  }
  return 0;
}

function renderSoundButton() {
  const level = SOUND_LEVELS[soundLevel];
  const button = document.getElementById('sound-button');
  button.textContent = level.icon;
  button.title = `音：${level.name}（押すと切り替え）`;
  button.setAttribute('aria-label', `音の大きさ：${level.name}`);
}

function setupSound() {
  renderSoundButton();
  document.getElementById('sound-button').addEventListener('click', () => {
    soundLevel = (soundLevel + 1) % SOUND_LEVELS.length;
    try {
      localStorage.setItem(SOUND_KEY, String(soundLevel));
    } catch (e) {
      // 保存できない環境では、開いている間だけ覚えておく
    }
    renderSoundButton();
    playSound('plant');   // 切り替えた大きさで、ためしに1回鳴らす
  });
}
