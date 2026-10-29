// =============================================
// キノコ王国 ― 世界ランキング
// 名前を決めて参加すると、「累計の胞子」がネット上のランキングにのる。
// データは Firebase（Google の無料サービス）に置く。設定は firebase-config.js
// 参加した人は「名前のない仮のアカウント（匿名ログイン）」を自動で作り、自分の記録だけを書きかえられる
// =============================================

// ---------- 設定（数字を変えると調整できる） ----------
const RANKING_SIZE = 50;                    // ランキングに何位まで表示するか
const RANKING_SUBMIT_MS = 5 * 60 * 1000;    // 記録を送る間隔（5分）
const RANKING_MIN_GAP_MS = 70 * 1000;       // 送ったあと、次に送れるまでの時間（firestore.rules で「60秒に1回まで」にしているので、少し余裕をもたせる）
const RANKING_CHECK_MS = 10 * 1000;         // 送るかどうかを調べる間隔
const RANKING_KEY = 'kinoko-kingdom-ranking';   // 名前を覚えておく場所（セーブとは別）
const NAME_MAX = 12;                        // 名前の最大の文字数
// 名前に使えない言葉（ひらがな・小文字に直してから調べる）。足りなければ、ここに追加する
const NG_WORDS = ['しね', '死ね', 'ころす', '殺す', 'きもい', 'うざい', 'ちんこ', 'まんこ', 'せっくす', 'えろ',
  'fuck', 'shit', 'bitch', 'sex', 'porn', 'nigger', 'http', 'www.', '.com'];

// ---------- 状態 ----------
let rankingDb = null;        // Firestore（ランキングのデータベース）。使えないときは null
let rankingUid = null;       // 自分の仮のアカウントの番号（ランキングの自分の行の目印）
let rankingName = loadRankingName();   // 参加したときの名前（参加していなければ ''）
let rankingPending = false;  // 名前を変えたので、すぐ送りたいとき true
let lastSubmitAt = 0;        // 最後に送った時刻
let lastSubmittedScore = -1; // 最後に送った点数

// ---------- 名前 ----------
function loadRankingName() {
  try {
    const data = JSON.parse(localStorage.getItem(RANKING_KEY) || '{}');
    return typeof data.name === 'string' ? data.name : '';
  } catch (e) {
    return '';
  }
}

function saveRankingName(name) {
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify({ name: name }));
  } catch (e) {
    // 保存できない環境では、開いている間だけ覚えておく
  }
}

// 名前を整える：前後の空白と、見えない文字（改行など）を消す
function cleanName(text) {
  const chars = Array.from(String(text)).filter(ch => {
    const code = ch.codePointAt(0);
    const control = code < 32 || code === 127;                  // 改行・タブなど
    const invisible = (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) || code === 0xfeff;   // 幅のない空白・文字の向きを変える記号など
    return !control && !invisible;
  });
  return chars.join('').trim();
}

// 名前が使えるか調べる。問題なければ ''、だめなら理由を返す
function checkName(name) {
  const length = Array.from(name).length;   // 絵文字も1文字と数える
  if (length === 0) return '名前を入れてください';
  if (length > NAME_MAX) return `名前は ${NAME_MAX} 文字までです`;
  // カタカナ → ひらがな、大文字 → 小文字、空白や記号を消してから、使えない言葉をさがす
  const plain = name.toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s_\-・。、!！?？]/g, '');
  if (NG_WORDS.some(w => plain.includes(w))) return 'その名前は使えません。別の名前にしてください';
  return '';
}

// ---------- Firebase とのやりとり ----------
function isRankingConfigured() {
  return typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined' && !!FIREBASE_CONFIG.apiKey;
}

// 仮のアカウントでログインする（参加している人だけ）。
// 前に作った仮のアカウントがこのブラウザに残っていれば、同じものが使われる
function signInForRanking() {
  if (!rankingDb) return;
  firebase.auth().signInAnonymously().then(result => {
    rankingUid = result.user.uid;
    maybeSubmitScore();
  }).catch(() => {
    setRankingStatus('ランキングにつながりませんでした。公開したページ（https://〜）で開くと使えます');
  });
}

// 送るかどうかを調べて、必要なら送る（RANKING_CHECK_MS ごとに呼ばれる）
function maybeSubmitScore() {
  if (!rankingDb || !rankingUid || !rankingName) return;
  const now = Date.now();
  if (now - lastSubmitAt < RANKING_MIN_GAP_MS) return;
  const score = Math.floor(state.lifetimeSpores);
  const timeToSend = now - lastSubmitAt >= RANKING_SUBMIT_MS && score !== lastSubmittedScore;
  if (!rankingPending && !timeToSend) return;
  if (!Number.isFinite(score)) return;

  lastSubmitAt = now;
  rankingPending = false;
  rankingDb.collection('scores').doc(rankingUid).set({
    name: rankingName,
    score: score,
    stars: Math.floor(state.starSpores),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(() => {
    lastSubmittedScore = score;
    if (!document.getElementById('ranking-modal').hidden) loadRanking();   // 開いていれば、表を新しくする
  }).catch(() => {
    // 送れなかったとき（ネットが切れた・送る間隔が短すぎた など）は、次の機会にもう一度送る
    rankingPending = true;
  });
}

// ランキングを読みこんで表示する
function loadRanking() {
  if (!rankingDb) return;
  setRankingStatus('読みこみ中…');
  rankingDb.collection('scores').orderBy('score', 'desc').limit(RANKING_SIZE).get()
    .then(snapshot => {
      const rows = [];
      snapshot.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
      renderRankingList(rows);
      setRankingStatus(rows.length === 0 ? 'まだだれも参加していません。一番乗りしよう！' : '');
    })
    .catch(() => setRankingStatus('ランキングを読みこめませんでした。ネットにつながっているか確かめてください'));
}

// ---------- 画面 ----------
function setRankingStatus(text) {
  document.getElementById('ranking-status').textContent = text;
}

// ランキングの表。名前はだれでも入れられるので、必ず textContent で文字として入れる（innerHTML は使わない）
function renderRankingList(rows) {
  const list = document.getElementById('ranking-list');
  list.innerHTML = '';
  let myRank = 0;
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'ranking-row';
    if (i < 3) li.classList.add(`top${i + 1}`);
    if (row.id === rankingUid) {
      li.classList.add('me');
      myRank = i + 1;
    }
    const cells = [
      ['ranking-rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`],
      ['ranking-name', String(row.name || '？')],
      ['ranking-stars', row.stars > 0 ? `⭐${Number(row.stars).toLocaleString('ja-JP')}` : ''],
      ['ranking-score', formatFull(Number(row.score) || 0)],
    ];
    for (const [className, text] of cells) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      li.appendChild(span);
    }
    list.appendChild(li);
  });

  // 自分の順位
  const me = document.getElementById('ranking-me');
  if (!rankingName) {
    me.textContent = '';
  } else if (myRank > 0) {
    me.textContent = `あなた（${rankingName}）は ${myRank} 位！`;
  } else {
    me.textContent = `あなた（${rankingName}）：${RANKING_SIZE} 位より下　累計 ${formatFull(state.lifetimeSpores)} 胞子`;
  }
}

// 参加の欄（名前の入力）
function renderRankingJoin() {
  document.getElementById('ranking-name').value = rankingName;
  document.getElementById('ranking-save').textContent = rankingName ? '名前を変える' : '参加する';
  document.getElementById('ranking-leave').hidden = !rankingName;
  document.getElementById('ranking-error').textContent = '';
}

function onRankingSave() {
  const name = cleanName(document.getElementById('ranking-name').value);
  const error = checkName(name);
  document.getElementById('ranking-error').textContent = error;
  if (error) return;
  rankingName = name;
  saveRankingName(name);
  rankingPending = true;
  renderRankingJoin();
  signInForRanking();
  maybeSubmitScore();
  setRankingStatus('参加しました！ ランキングへの反映は、少し時間がかかることがあります');
}

// 参加をやめる：自分の記録をランキングから消す
function onRankingLeave() {
  if (!confirm('ランキングへの参加をやめて、あなたの記録をランキングから消しますか？')) return;
  if (rankingDb && rankingUid) {
    rankingDb.collection('scores').doc(rankingUid).delete().then(loadRanking).catch(() => {});
  }
  rankingName = '';
  rankingPending = false;
  saveRankingName('');
  renderRankingJoin();
  document.getElementById('ranking-me').textContent = '';
}

function openRanking() {
  document.getElementById('ranking-modal').hidden = false;
  renderRankingJoin();
  if (!rankingDb) {
    document.getElementById('ranking-join').hidden = true;
    setRankingStatus('ランキングは準備中です。もうしばらくお待ちください');
    return;
  }
  loadRanking();
}

function setupRanking() {
  const modal = document.getElementById('ranking-modal');
  document.getElementById('ranking-open').addEventListener('click', openRanking);
  document.getElementById('ranking-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.hidden = true;
  });
  document.getElementById('ranking-save').addEventListener('click', onRankingSave);
  document.getElementById('ranking-leave').addEventListener('click', onRankingLeave);
  document.getElementById('ranking-reload').addEventListener('click', loadRanking);

  // Firebase の設定がない・読みこめないときは、ランキングなしでゲームを続ける
  if (!isRankingConfigured()) return;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    rankingDb = firebase.firestore();
    if (rankingName) signInForRanking();
  } catch (e) {
    rankingDb = null;
    return;
  }
  setInterval(maybeSubmitScore, RANKING_CHECK_MS);
}
