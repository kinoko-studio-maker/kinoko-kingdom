// =============================================
// キノコ王国 ― Firebase（ランキングのデータを置く場所）の設定
// Firebase のサイトに表示される「firebaseConfig」の中身を、下の '' の中に貼りつける。
// 空のままだと、ランキングは「準備中」と表示され、ゲームはふつうに遊べる。
//
// ※ この値は「秘密の鍵」ではなく、「どの Firebase プロジェクトか」を示す名札のようなもの。
//    ブラウザで動くゲームでは、だれでも見られる場所に置くしかなく、Firebase もそれを前提に作られている。
//    データの守りは、別のファイル firestore.rules（書きこみのルール）で行う。
// =============================================
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBEGLTX2QRiUifXP5fdzOJ7sVrbQb_gZic',
  authDomain: 'kinoko-kingdom.firebaseapp.com',
  projectId: 'kinoko-kingdom',
  storageBucket: 'kinoko-kingdom.firebasestorage.app',
  messagingSenderId: '375423074384',
  appId: '1:375423074384:web:5542270eaa3c1e377c1155',
};
