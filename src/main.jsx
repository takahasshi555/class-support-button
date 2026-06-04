import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, CheckCircle2, Copy, Frown, Lightbulb, QrCode, RefreshCcw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, runTransaction, get } from "firebase/database";
import "./styles.css";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const labels = {
  understood: "わかった",
  lost: "わからない"
};

const descriptions = {
  understood: "このまま進めて大丈夫",
  lost: "一度止まってほしい"
};

const buttonIcons = {
  understood: CheckCircle2,
  lost: Frown
};

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function getStorageItem(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function setStorageItem(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function removeStorageItem(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

function getClientId() {
  const key = "understanding-client-id";
  const saved = getStorageItem(key);
  if (saved) return saved;
  const value = generateId();
  setStorageItem(key, value);
  return value;
}

function parseRoute() {
  const [, route, roomId] = window.location.pathname.split("/");
  return {
    route: route || "home",
    roomId: roomId?.toUpperCase() || ""
  };
}

// 先生用のデータフック（全体を監視）
function useTeacherRoom(roomId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setError("授業ルームが見つかりません。");
        return;
      }

      // セキュリティ: 先生トークンの一致を確認
      const localToken = getStorageItem(`teacher-token-${roomId}`);
      if (data.teacherToken && data.teacherToken !== localToken) {
        setError("先生権限がありません。この画面にはアクセスできません。");
        return;
      }

      const responses = data.responses || {};
      const counts = { understood: 0, lost: 0 };
      for (const val of Object.values(responses)) {
        if (counts[val] !== undefined) counts[val]++;
      }

      const totalResponses = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const participantsCount = data.participants ? Object.keys(data.participants).length : 0;

      setState({
        roomId,
        counts,
        reactions: data.reactions || { wow: 0 },
        totalResponses,
        participants: participantsCount,
        resetVersion: data.resetVersion || 0
      });
      setError("");
    }, (err) => {
      setError("データベース接続エラー: " + err.message);
    });

    return () => unsubscribe();
  }, [roomId]);

  return { state, error };
}

// 学生用のデータフック（通信量を抑えるため個別のデータだけを監視）
function useStudentRoom(roomId) {
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const clientId = useMemo(() => getClientId(), []);

  useEffect(() => {
    if (!roomId) return;

    // まず部屋が存在するかチェック
    get(ref(db, `rooms/${roomId}/resetVersion`)).then((snapshot) => {
      if (!snapshot.exists()) {
        setError("授業ルームが見つかりません。");
      }
    }).catch((err) => setError("エラー: " + err.message));

    // リセット時に自分の回答だけを監視する
    const responseRef = ref(db, `rooms/${roomId}/responses/${clientId}`);
    const unsubResponse = onValue(responseRef, (snapshot) => {
      setSelected(snapshot.val() || ""); // nullになれば未回答に戻る
    });

    // 参加者として自分を登録
    set(ref(db, `rooms/${roomId}/participants/${clientId}`), true).catch(console.error);

    return () => {
      unsubResponse();
    };
  }, [roomId, clientId]);

  return { error, selected, clientId };
}

function Home() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  async function createRoom() {
    setIsCreating(true);
    setError("");

    try {
      let roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
      
      while (true) {
        const snapshot = await get(ref(db, `rooms/${roomId}`));
        if (!snapshot.exists()) break;
        roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
      }

      const token = generateId();
      setStorageItem(`teacher-token-${roomId}`, token); // 先生の証明書をブラウザに保存

      await set(ref(db, `rooms/${roomId}`), {
        createdAt: Date.now(),
        resetVersion: 0,
        reactions: { wow: 0 },
        participants: {},
        responses: {},
        teacherToken: token // データベース側にも保存
      });

      window.location.href = `/teacher/${roomId}`;
    } catch (err) {
      setError("授業ルームを作成できませんでした: " + err.message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="home-shell">
      <section className="home-panel">
        <div className="app-mark">
          <BarChart3 aria-hidden="true" />
        </div>
        <p className="eyebrow">授業理解確認ボタン</p>
        <h1>今の理解度を、授業中にすぐ見る。</h1>
        <p className="lead">
          先生がルームを作り、学生はQRコードから匿名で3段階の理解度を送信します。
        </p>
        <button className="primary-action" type="button" onClick={createRoom} disabled={isCreating}>
          <QrCode aria-hidden="true" />
          {isCreating ? "作成中..." : "授業ルームを作成"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}

function Teacher({ roomId }) {
  const { state, error } = useTeacherRoom(roomId);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const joinUrl = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      margin: 2,
      width: 280,
      color: { dark: "#17211b", light: "#ffffff" }
    }).then(setQrDataUrl);
  }, [joinUrl]);

  function resetRoom() {
    const updates = {
      responses: null, // 全員の回答を消去
      "reactions/wow": 0
    };
    runTransaction(ref(db, `rooms/${roomId}/resetVersion`), (current) => (current || 0) + 1);
    update(ref(db, `rooms/${roomId}`), updates);
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(joinUrl);
  }

  if (error) {
    return <ErrorScreen message={error} isTeacherError={true} />;
  }

  const counts = state?.counts || { understood: 0, lost: 0 };
  const total = state?.totalResponses || 0;
  const wowCount = state?.reactions?.wow || 0;

  return (
    <main className="teacher-layout">
      <section className="teacher-main">
        <div className="teacher-heading">
          <div>
            <p className="eyebrow">先生画面</p>
            <h1>授業ルーム {roomId}</h1>
          </div>
          <button className="reset-button" type="button" onClick={resetRoom}>
            <RefreshCcw aria-hidden="true" />
            リセット
          </button>
        </div>

        <div className="stats-strip">
          <Metric label="参加中" value={`${state?.participants || 0}人`} />
          <Metric label="回答数" value={`${total}件`} />
          <Metric label="リセット" value={`${state?.resetVersion || 0}回`} />
        </div>

        <section className="results-panel" aria-label="理解度の集計">
          {Object.entries(labels).map(([key, label]) => (
            <ResultBar key={key} label={label} value={counts[key]} total={total} tone={key} />
          ))}
        </section>

        <section className="reaction-panel" aria-label="リアクションの集計">
          <div>
            <span>へぇー</span>
            <strong>{wowCount}回</strong>
          </div>
          <p>理解度とは別に、押された回数をそのまま数えます。</p>
        </section>
      </section>

      <aside className="join-panel">
        <div className="join-header">
          <Smartphone aria-hidden="true" />
          <h2>学生参加</h2>
        </div>
        {qrDataUrl ? <img className="qr-image" src={qrDataUrl} alt="学生参加用QRコード" /> : <div className="qr-placeholder" />}
        <div className="url-row">
          <span>{joinUrl}</span>
          <button type="button" onClick={copyUrl} aria-label="参加URLをコピー">
            <Copy aria-hidden="true" />
          </button>
        </div>
      </aside>
    </main>
  );
}

function Student({ roomId }) {
  const { error, selected, clientId } = useStudentRoom(roomId);

  function submit(value) {
    set(ref(db, `rooms/${roomId}/responses/${clientId}`), value);
    set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
  }

  function sendWow() {
    const wowRef = ref(db, `rooms/${roomId}/reactions/wow`);
    runTransaction(wowRef, (current) => (current || 0) + 1);
    set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
  }

  if (error) {
    return <ErrorScreen message={error} />;
  }

  return (
    <main className="student-shell">
      <section className="student-header">
        <p className="eyebrow">匿名回答</p>
        <h1>今の理解度は？</h1>
        <p>先生には全体の人数だけが届きます。</p>
      </section>

      <section className="choice-stack" aria-label="理解度ボタン">
        {Object.entries(labels).map(([key, label]) => {
          const Icon = buttonIcons[key];
          return (
            <button
              className={`choice-button ${key} ${selected === key ? "selected" : ""}`}
              key={key}
              type="button"
              onClick={() => submit(key)}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                <small>{descriptions[key]}</small>
              </span>
            </button>
          );
        })}
      </section>

      <button className="wow-button" type="button" onClick={sendWow}>
        <Lightbulb aria-hidden="true" />
        <span>
          <strong>へぇー</strong>
          <small>何回でも押せます</small>
        </span>
      </button>

      <p className="student-status">
        {selected ? `送信しました: ${labels[selected]}` : "まだ回答していません"}
      </p>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultBar({ label, value, total, tone }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="result-row">
      <div className="result-meta">
        <span>{label}</span>
        <strong>{value}人 / {percentage}%</strong>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div className={`bar-fill ${tone}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function ErrorScreen({ message, isTeacherError }) {
  return (
    <main className="home-shell">
      <section className="home-panel">
        <p className="eyebrow">エラー</p>
        <h1 style={{fontSize: "1.2rem", marginBottom: "1rem"}}>{message}</h1>
        {isTeacherError ? (
          <p className="lead">ルームを作成したPCのブラウザからのみ、先生画面を開くことができます。</p>
        ) : null}
        <a className="text-link" href="/">トップへ戻る</a>
      </section>
    </main>
  );
}

function App() {
  const { route, roomId } = parseRoute();

  if (route === "teacher" && roomId) {
    return <Teacher roomId={roomId} />;
  }

  if (route === "room" && roomId) {
    return <Student roomId={roomId} />;
  }

  return <Home />;
}

createRoot(document.getElementById("root")).render(<App />);
