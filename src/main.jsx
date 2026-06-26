import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, CheckCircle2, Copy, Frown, Lightbulb, MessageCircle, QrCode, RefreshCcw, Send, Smartphone, ThumbsUp } from "lucide-react";
import QRCode from "qrcode";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase, ref, onValue, set, update, runTransaction } from "firebase/database";
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
const auth = getAuth(app);
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

let authPromise = null;

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ensureAuth() {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  if (!authPromise) {
    authPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .catch((error) => {
        authPromise = null;
        throw error;
      });
  }

  return authPromise;
}

function parseRoute() {
  const [, route, roomId] = window.location.pathname.split("/");
  return {
    route: route || "home",
    roomId: roomId?.toUpperCase() || ""
  };
}

function useTeacherRoom(roomId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    let unsubscribe = null;
    let cancelled = false;

    ensureAuth()
      .then(() => {
        if (cancelled) {
          return;
        }

        unsubscribe = onValue(
          ref(db, `rooms/${roomId}`),
          (snapshot) => {
            const data = snapshot.val();

            if (!data) {
              setError("授業ルームが見つかりません。");
              return;
            }

            const responses = data.responses || {};
            const counts = { understood: 0, lost: 0 };

            for (const value of Object.values(responses)) {
              if (counts[value] !== undefined) {
                counts[value] += 1;
              }
            }

            setState({
              roomId,
              counts,
              comments: data.comments || {},
              note: data.note || "",
              history: data.history || {},
              reactions: data.reactions || { wow: 0 },
              totalResponses: Object.values(counts).reduce((sum, count) => sum + count, 0),
              participants: data.participants ? Object.keys(data.participants).length : 0,
              resetVersion: data.resetVersion || 0
            });
            setError("");
          },
          (err) => {
            setError("先生権限がありません。この画面にはアクセスできません。");
            console.error(err);
          }
        );
      })
      .catch((err) => {
        setError("匿名認証に失敗しました: " + err.message);
      });

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [roomId]);

  return { state, error };
}

function useStudentRoom(roomId) {
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [clientId, setClientId] = useState("");
  const [comments, setComments] = useState({});

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    let responseUnsubscribe = null;
    let resetUnsubscribe = null;
    let commentsUnsubscribe = null;
    let cancelled = false;

    ensureAuth()
      .then((user) => {
        if (cancelled) {
          return;
        }

        setClientId(user.uid);
        set(ref(db, `rooms/${roomId}/participants/${user.uid}`), true).catch((err) => {
          setError("授業ルームが見つかりません: " + err.message);
        });

        responseUnsubscribe = onValue(
          ref(db, `rooms/${roomId}/responses/${user.uid}`),
          (snapshot) => {
            setSelected(snapshot.val() || "");
          },
          (err) => {
            setError("回答状態を取得できません: " + err.message);
          }
        );

        resetUnsubscribe = onValue(
          ref(db, `rooms/${roomId}/resetVersion`),
          (snapshot) => {
            if (!snapshot.exists()) {
              setError("授業ルームが見つかりません。");
            } else {
              setError("");
            }
          },
          (err) => {
            setError("授業ルームが見つかりません: " + err.message);
          }
        );

        commentsUnsubscribe = onValue(
          ref(db, `rooms/${roomId}/comments`),
          (snapshot) => {
            setComments(snapshot.val() || {});
          },
          (err) => {
            setError("コメントを取得できません: " + err.message);
          }
        );
      })
      .catch((err) => {
        setError("匿名認証に失敗しました: " + err.message);
      });

    return () => {
      cancelled = true;
      if (responseUnsubscribe) {
        responseUnsubscribe();
      }
      if (resetUnsubscribe) {
        resetUnsubscribe();
      }
      if (commentsUnsubscribe) {
        commentsUnsubscribe();
      }
    };
  }, [roomId]);

  return { error, selected, clientId, comments };
}

function Home() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  async function createRoom() {
    setIsCreating(true);
    setError("");

    try {
      const user = await ensureAuth();
      const roomId = generateRoomId();

      await set(ref(db, `rooms/${roomId}`), {
        createdAt: Date.now(),
        teacherUid: user.uid,
        note: "",
        resetVersion: 0,
        reactions: { wow: 0 }
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
          先生がルームを作り、学生はQRコードから匿名で理解度とリアクションを送信します。
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
  const [noteDraft, setNoteDraft] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [timelineLabel, setTimelineLabel] = useState("");
  const [timelineStatus, setTimelineStatus] = useState("");
  const joinUrl = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    setNoteDraft(state?.note || "");
  }, [state?.note]);

  useEffect(() => {
    if (!timelineLabel && state) {
      setTimelineLabel(`スライド${(state.resetVersion || 0) + 1}`);
    }
  }, [state, timelineLabel]);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      margin: 2,
      width: 280,
      color: { dark: "#17211b", light: "#ffffff" }
    }).then(setQrDataUrl);
  }, [joinUrl]);

  async function recordTimelineAndReset() {
    if (!state) {
      return;
    }

    const label = timelineLabel.trim().slice(0, 40) || `スライド${(state.resetVersion || 0) + 1}`;
    const note = noteDraft.trim().slice(0, 140);
    const historyId = `${Date.now()}-${generateId().slice(0, 8)}`;
    const nextResetVersion = (state.resetVersion || 0) + 1;

    setTimelineStatus("記録中...");
    try {
      await update(ref(db, `rooms/${roomId}`), {
        [`history/${historyId}`]: {
          label,
          note,
          createdAt: Date.now(),
          counts: state.counts || { understood: 0, lost: 0 },
          wow: state.reactions?.wow || 0,
          totalResponses: state.totalResponses || 0,
          participants: state.participants || 0,
          resetVersion: state.resetVersion || 0
        },
        note,
        responses: null,
        "reactions/wow": 0,
        resetVersion: nextResetVersion
      });
      setTimelineLabel(`スライド${nextResetVersion + 1}`);
      setTimelineStatus("記録しました");
      window.setTimeout(() => setTimelineStatus(""), 1600);
    } catch (err) {
      setTimelineStatus("記録できませんでした");
      console.error(err);
    }
  }

  async function saveNote() {
    setNoteStatus("保存中...");
    try {
      await update(ref(db, `rooms/${roomId}`), {
        note: noteDraft.trim().slice(0, 140)
      });
      setNoteStatus("保存しました");
      window.setTimeout(() => setNoteStatus(""), 1600);
    } catch (err) {
      setNoteStatus("保存できませんでした");
      console.error(err);
    }
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
          <button className="reset-button" type="button" onClick={recordTimelineAndReset}>
            <RefreshCcw aria-hidden="true" />
            記録して次へ
          </button>
        </div>

        <div className="stats-strip">
          <Metric label="参加中" value={`${state?.participants || 0}人`} />
          <Metric label="回答数" value={`${total}件`} />
          <Metric label="リセット" value={`${state?.resetVersion || 0}回`} />
        </div>

        <section className="note-panel" aria-label="先生メモ">
          <div className="note-heading">
            <div>
              <span>メモ</span>
              <strong>この集計の話題</strong>
            </div>
            <button className="note-save-button" type="button" onClick={saveNote}>
              保存
            </button>
          </div>
          <textarea
            maxLength={140}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="例: 問3の解説後、微分の連鎖律について"
          />
          <div className="note-footer">
            <span>{noteDraft.length}/140</span>
            <span>{noteStatus}</span>
          </div>
        </section>

        <section className="timeline-control" aria-label="タイムライン記録">
          <div className="timeline-control-heading">
            <div>
              <span>タイムライン記録</span>
              <strong>現在の集計を保存して次へ</strong>
            </div>
            <button className="timeline-record-button" type="button" onClick={recordTimelineAndReset}>
              <RefreshCcw aria-hidden="true" />
              記録して次へ
            </button>
          </div>
          <label>
            <span>タグ</span>
            <input
              maxLength={40}
              value={timelineLabel}
              onChange={(event) => setTimelineLabel(event.target.value)}
              placeholder="例: スライド1 / 問3 / 小テスト後"
            />
          </label>
          <div className="note-footer">
            <span>{timelineLabel.length}/40</span>
            <span>{timelineStatus}</span>
          </div>
        </section>

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

        <Timeline history={state?.history || {}} />
        <CommentsPanel comments={state?.comments || {}} roomId={roomId} title="授業コメント" />
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

function Timeline({ history }) {
  const items = Object.entries(history)
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (items.length === 0) {
    return (
      <section className="timeline-panel" aria-label="授業タイムライン">
        <div className="timeline-panel-heading">
          <span>授業タイムライン</span>
          <strong>まだ記録はありません</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="timeline-panel" aria-label="授業タイムライン">
      <div className="timeline-panel-heading">
        <span>授業タイムライン</span>
        <strong>{items.length}件の記録</strong>
      </div>
      <div className="timeline-list">
        {items.map((item) => {
          const understood = item.counts?.understood || 0;
          const lost = item.counts?.lost || 0;
          const total = item.totalResponses || understood + lost;
          const lostRate = total > 0 ? Math.round((lost / total) * 100) : 0;

          return (
            <article className="timeline-item" key={item.id}>
              <div className="timeline-item-title">
                <strong>{item.label || "無題"}</strong>
                <span>{formatTime(item.createdAt)}</span>
              </div>
              <div className={`timeline-note ${item.note ? "" : "empty"}`}>
                <span>メモ</span>
                <p>{item.note || "メモなし"}</p>
              </div>
              <div className="timeline-metrics">
                <span>わかった {understood}人</span>
                <span>わからない {lost}人</span>
                <span>つまずき {lostRate}%</span>
                <span>へぇー {item.wow || 0}回</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CommentsPanel({ comments, roomId, clientId, title = "コメント" }) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const items = Object.entries(comments || {})
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 50);

  async function postComment() {
    const text = draft.trim().slice(0, 120);
    if (!clientId || !text) {
      return;
    }

    const commentId = `${Date.now()}-${generateId().slice(0, 8)}`;
    setStatus("送信中...");
    try {
      await set(ref(db, `rooms/${roomId}/comments/${commentId}`), {
        text,
        authorUid: clientId,
        createdAt: Date.now()
      });
      await set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
      setDraft("");
      setStatus("送信しました");
      window.setTimeout(() => setStatus(""), 1400);
    } catch (err) {
      setStatus("送信できませんでした");
      console.error(err);
    }
  }

  async function likeComment(commentId) {
    if (!clientId) {
      return;
    }

    try {
      await set(ref(db, `rooms/${roomId}/comments/${commentId}/likes/${clientId}`), true);
      await set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <section className="comments-panel" aria-label={title}>
      <div className="comments-heading">
        <div>
          <span>{title}</span>
          <strong>{items.length}件</strong>
        </div>
        <MessageCircle aria-hidden="true" />
      </div>

      {clientId ? (
        <div className="comment-form">
          <textarea
            maxLength={120}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="質問や気づきを匿名で投稿"
          />
          <div className="comment-form-footer">
            <span>{draft.length}/120</span>
            <span>{status}</span>
            <button type="button" onClick={postComment} disabled={!draft.trim()}>
              <Send aria-hidden="true" />
              送信
            </button>
          </div>
        </div>
      ) : null}

      <div className="comment-list">
        {items.length === 0 ? (
          <p className="comment-empty">まだコメントはありません</p>
        ) : (
          items.map((item) => {
            const likes = item.likes || {};
            const likeCount = Object.keys(likes).length;
            const liked = clientId && likes[clientId];

            return (
              <article className="comment-item" key={item.id}>
                <div className="comment-item-header">
                  <span>匿名コメント</span>
                  <time>{formatTime(item.createdAt)}</time>
                </div>
                <p>{item.text}</p>
                <button
                  className={`comment-like ${liked ? "liked" : ""}`}
                  type="button"
                  onClick={() => likeComment(item.id)}
                  disabled={!clientId || liked}
                >
                  <ThumbsUp aria-hidden="true" />
                  {likeCount}
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function Student({ roomId }) {
  const { error, selected, clientId, comments } = useStudentRoom(roomId);

  function submit(value) {
    if (!clientId) {
      return;
    }

    set(ref(db, `rooms/${roomId}/responses/${clientId}`), value);
    set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
  }

  async function sendWow() {
    if (!clientId) {
      return;
    }

    await runTransaction(ref(db, `rooms/${roomId}/reactions/wow`), (current) => (current || 0) + 1);
    await set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
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

      <CommentsPanel comments={comments} roomId={roomId} clientId={clientId} title="みんなのコメント" />
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
        <h1 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>{message}</h1>
        {isTeacherError ? (
          <p className="lead">ルームを作成したブラウザからのみ、先生画面を開くことができます。</p>
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
