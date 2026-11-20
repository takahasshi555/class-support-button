import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, CheckCircle2, Copy, BookOpen, Lightbulb, MessageCircle, QrCode, RefreshCcw, Send, ThumbsUp, FileText, Link as LinkIcon, UploadCloud, Trash2, ExternalLink, Coffee } from "lucide-react";
import QRCode from "qrcode";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase, ref, onValue, set, update, runTransaction, remove } from "firebase/database";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import "./styles.css";
import "./classroom.css";
import StudentScreen, { Brand } from "./StudentScreen";
import PulsePreview from "./PulsePreview";
import ActivityPreview from "./ActivityPreview";
import ClassPulse from "./ClassPulse";
import TeacherPreview from "./TeacherPreview";
import TeacherWorkspace from "./TeacherWorkspace";
import "./teacher-console.css";
import { TeacherActivity, StudentActivity, useStudentActivity, closeActivity, ActivityResults } from "./Activities";

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
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
if (appCheckSiteKey) {
  if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

const labels = {
  understood: "わかった",
  lost: "わからない",
  explain: "もう一回説明してほしい"
};

const confidences = {
  high: "しっかり分かった",
  medium: "だいたい分かった",
  low: "少し不安"
};

const reasons = {
  explanation: "説明が分からない",
  term: "用語が分からない",
  solution: "解き方が分からない",
  step: "途中までは分かる",
  other: "その他"
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

function materialUploadErrorMessage(error) {
  const code = error?.code || "unknown";

  if (code === "storage/quota-exceeded") {
    return "Firebase Storageの利用が制限されています。FirebaseプロジェクトのBlazeプラン、課金状態、利用量を確認してください。（storage/quota-exceeded）";
  }
  if (code === "storage/unauthorized") {
    return "Firebase Storageのアクセスルールで拒否されました。Storage Rulesで資料のアップロードが許可されているか確認してください。（storage/unauthorized）";
  }
  if (code === "storage/bucket-not-found" || code === "storage/no-default-bucket") {
    return "Firebase Storageのバケットが設定されていないか、見つかりません。FirebaseのStorage設定と環境変数を確認してください。(" + code + ")";
  }
  if (code === "storage/unauthenticated") {
    return "Firebase認証が完了していないため、資料をアップロードできませんでした。ページを再読み込みして再度お試しください。（storage/unauthenticated）";
  }
  if (code === "storage/retry-limit-exceeded") {
    return "アップロードがタイムアウトしました。通信状態を確認して、もう一度お試しください。（storage/retry-limit-exceeded）";
  }

  return `資料をアップロードできませんでした。Firebase設定と通信状態を確認してください。（${code}）`;
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
            const counts = { understood: 0, lost: 0, explain: 0 };
            const details = { understood: {}, lost: {}, explain: {} };
            let answered = 0;

            for (const value of Object.values(responses)) {
              let action = null;
              let detail = null;
              
              if (typeof value === "string") {
                const parts = value.split(":");
                action = parts[0];
                detail = parts[1] || null;
              } else if (value && typeof value === "object") {
                action = value.action;
                detail = value.detail;
              }

              if (action && counts[action] !== undefined) {
                counts[action] += 1;
                answered += 1;
                if (detail) {
                  details[action][detail] = (details[action][detail] || 0) + 1;
                }
              }
            }
            
            const participantsCount = data.participants ? Object.keys(data.participants).length : 0;
            const unanswered = Math.max(0, participantsCount - answered);
            const responseRate = participantsCount > 0 ? Math.round((answered / participantsCount) * 100) : 0;

            setState({
              roomId,
              activity: data.activity || null,
              pollAnswers: data.pollAnswers || {},
              pollHistory: data.pollHistory || {},
              counts,
              details,
              material: data.material || null,
              breakRequests: data.break_requests || {},
              comments: data.comments || {},
              note: data.note || "",
              history: data.history || {},
              reactions: data.reactions || { wow: 0 },
              totalResponses: answered,
              participants: participantsCount,
              unanswered,
              responseRate,
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
  const [selected, setSelected] = useState(null);
  const [clientId, setClientId] = useState("");
  const [comments, setComments] = useState({});
  const [material, setMaterial] = useState(null);
  const [breakRequested, setBreakRequested] = useState(false);

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    let responseUnsubscribe = null;
    let resetUnsubscribe = null;
    let commentsUnsubscribe = null;
    let materialUnsubscribe = null;
    let breakUnsubscribe = null;
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
            setSelected(snapshot.val() || null);
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

        materialUnsubscribe = onValue(
          ref(db, `rooms/${roomId}/material`),
          (snapshot) => {
            setMaterial(snapshot.val() || null);
          },
          (err) => {
            console.error("資料情報を取得できません: " + err.message);
          }
        );

        breakUnsubscribe = onValue(
          ref(db, `rooms/${roomId}/break_requests/${user.uid}`),
          (snapshot) => {
            setBreakRequested(snapshot.val() === true);
          },
          (err) => {
            console.error("休憩状態を取得できません: " + err.message);
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
      if (materialUnsubscribe) {
        materialUnsubscribe();
      }
      if (breakUnsubscribe) {
        breakUnsubscribe();
      }
    };
  }, [roomId]);

  return { error, selected, clientId, comments, material, breakRequested };
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

  return <div className="teacher-entry">
    <header className="app-topbar"><Brand /><span className="entry-teacher-label">教員向け</span></header>
    <main className="teacher-entry-main">
      <section className="entry-intro"><span className="section-kicker">授業の進行を、もっとスムーズに。</span><h1>学生の「今」が、<br />見える授業へ。</h1><p>理解度や休憩の希望を、その場で確認。<br />学生の反応を見ながら、説明のペースを調整できます。</p><div className="entry-feature-list"><span><BarChart3 size={20}/>理解度をリアルタイムに集計</span><span><Coffee size={20}/>休憩の希望を通知</span><span><CheckCircle2 size={20}/>スライド中もミニ表示で確認</span></div></section>
      <section className="entry-start" aria-labelledby="entry-start-title"><span className="entry-start-icon"><BookOpen size={30}/></span><h2 id="entry-start-title">授業をはじめる</h2><p>授業ルームを作成して、学生にQRコードを提示しましょう。</p><button className="primary-action" type="button" onClick={createRoom} disabled={isCreating}><BarChart3 size={19}/>{isCreating ? '授業ルームを作成中…' : '授業ルームを作成'}</button>{error && <p role="alert" className="error-text">{error}</p>}<div className="entry-browser-note">作成したブラウザーが教員用になります。<br />ミニ表示には通常のChromeをご利用ください。</div></section>
      <section className="entry-steps" aria-label="授業開始までの流れ"><article><span>01</span><h2>ルームを作成</h2><p>上のボタンで教員画面を開きます。</p></article><article><span>02</span><h2>QRを学生に提示</h2><p>教員画面の「QR・参加案内」を開き、学生に読み取ってもらいます。</p></article><article><span>03</span><h2>反応を見ながら授業</h2><p>理解度の集計やミニ表示で、説明のタイミングをつかみます。</p></article></section>
      <aside className="entry-student-note"><QrCode size={23}/><div><strong>学生の皆さんへ</strong><p>先生が授業中に表示するQRコードを、スマートフォンのカメラで読み取って参加してください。</p></div></aside>
    </main><footer className="welcome-footer">授業サポートボタン — 教員向けスタートページ</footer>
  </div>;
}

function Teacher({ roomId }) {
  const { state, error } = useTeacherRoom(roomId);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [timelineLabel, setTimelineLabel] = useState("");
  const [timelineStatus, setTimelineStatus] = useState("");
  const recording = timelineStatus === '記録中...';
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
    if (!state || recording) {
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
          counts: state.counts || { understood: 0, lost: 0, explain: 0 },
          details: state.details || { understood: {}, lost: {}, explain: {} },
          wow: state.reactions?.wow || 0,
          totalResponses: state.totalResponses || 0,
          participants: state.participants || 0,
          unanswered: state.unanswered || 0,
          responseRate: state.responseRate || 0,
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

  const counts = state?.counts || { understood: 0, lost: 0, explain: 0 };
  const details = state?.details || { understood: {}, lost: {}, explain: {} };
  const total = state?.totalResponses || 0;
  const participants = state?.participants || 0;
  const unanswered = state?.unanswered || 0;
  const responseRate = state?.responseRate || 0;
  const wowCount = state?.reactions?.wow || 0;

  // 休憩要求の集計
  const breakRequests = state?.breakRequests || {};
  const breakCount = Object.keys(breakRequests).length;



  if (error) return <ErrorScreen message={error} isTeacherError={true} />;

  return <TeacherWorkspace roomId={roomId} state={state} labels={labels} topicLabel={timelineLabel} panels={{
    invite: (<section className="classroom-invite qr-only" aria-label="学生の参加案内"><h3>このQRコードから授業に参加</h3>{qrDataUrl ? <img className="student-join-qr" src={qrDataUrl} alt="学生参加用QRコード" /> : <p role="status">QRコードを準備しています…</p>}<p>スマートフォンのカメラで読み取り、<br />表示されたリンクを開いてください。</p><small>授業ルーム：{roomId}</small></section>),
    activity: (<TeacherActivity activity={state?.activity ? { ...state.activity, results: state.pollHistory?.[state.activity.id]?.results } : null} answers={state?.pollAnswers?.[state?.activity?.id] || {}} participants={participants}
          onStart={activity => set(ref(db, `rooms/${roomId}/activity`), activity)}
          onClose={() => closeActivity(db, roomId, state.activity)}
          onShare={async () => {
            const results = await closeActivity(db, roomId, state.activity);
            await update(ref(db, `rooms/${roomId}/activity`), { phase: 'results', sharedResults: results });
          }}
          onReturn={async () => {
            await closeActivity(db, roomId, state.activity);
            await remove(ref(db, `rooms/${roomId}/activity`));
          }} />),
    details: (<section className="results-panel" aria-label="理解度の詳細">
            {Object.entries(labels).map(([key, label]) => {
              const hasDetails = (key === "understood" || key === "lost") && Object.keys(details[key] || {}).length > 0;
              const dictionary = key === "understood" ? confidences : reasons;

              return (
                <div key={key}>
                  <ResultBar label={label} value={counts[key] || 0} total={total} tone={key} />
                  {hasDetails && (
                    <div className="result-details">
                      {Object.entries(dictionary).map(([dKey, dLabel]) => {
                        const count = (details[key] && details[key][dKey]) || 0;
                        if (count === 0) return null;
                        return (
                          <div key={dKey} className="result-details-item">
                            <span>{dLabel}</span>
                            <strong>{count}人</strong>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </section>),
    record: (<section className="timeline-control" aria-label="タイムライン記録">
          <div className="timeline-control-heading">
            <div>
              <span>話題の区切りに</span>
              <strong>集計を保存して次の話題へ</strong>
            </div>
            <button className="timeline-record-button" type="button" onClick={recordTimelineAndReset} disabled={!state || recording}>
              <RefreshCcw aria-hidden="true" />
              {recording ? '記録中…' : '記録して次へ進む'}
            </button>
          </div>
          <label>
            <span>話題の名前</span>
            <input
              maxLength={40}
              value={timelineLabel}
              onChange={(event) => setTimelineLabel(event.target.value)}
              placeholder="例：スライド1、問3、小テスト後"
            />
          </label>
          <label className="timeline-note-input">
            <span>先生用メモ（任意）</span>
            <textarea
              maxLength={140}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="例：問3の解説後、連鎖律の理解度を確認"
            />
          </label>
          <p className="timeline-help">この操作で今の集計を記録し、理解度と「へぇー」の数をリセットします。</p>
          <div className="note-footer">
            <span>話題 {timelineLabel.length}/40 ・メモ {noteDraft.length}/140</span>
            <span role="status">{timelineStatus}</span>
          </div>
        </section>),
    materials: <MaterialManager roomId={roomId} material={state?.material} />,
    history: (<><Timeline history={state?.history || {}} />
          {Object.values(state?.pollHistory || {}).sort((a, b) => b.closedAt - a.closedAt).map(item => <section className="activity-panel" key={item.id}><h3>{item.question}</h3><ActivityResults activity={item} results={item.results} /></section>)}</>),
    comments: <CommentsPanel comments={state?.comments || {}} roomId={roomId} title="授業コメント" />
  }} />;
}

function MaterialManager({ roomId, material }) {
  const [urlDraft, setUrlDraft] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const insightFileRef = useRef(null);
  const fileInputRef = useRef(null);

  async function generateTrivia(file) {
    if (!file || !aiConsent) return;
    if (!/^application\/pdf$|^image\//.test(file.type)) {
      setStatus("豆知識生成はPDFまたは画像に対応しています。");
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setStatus("AIに送れるファイルは18MB以下です。資料を分割してお試しください。");
      return;
    }
    if (!appCheckSiteKey) {
      setStatus("Firebase ConsoleでFirebase AI LogicとApp Checkを設定し、VITE_FIREBASE_APP_CHECK_SITE_KEYを登録してください。");
      return;
    }

    setIsGenerating(true);
    setStatus("資料を読み取り、豆知識を作成中...");
    try {
      const ai = getAI(app, { backend: new GoogleAIBackend() });
      const model = getGenerativeModel(ai, {
        model: "gemini-3.8-flash",
        generationConfig: { responseMimeType: "application/json" }
      });
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
        reader.readAsDataURL(file);
      });
      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType: file.type } },
        "これは授業資料です。資料の内容を読み、学習者が将来や実社会での活用を想像できる豆知識を日本語で1つ作成してください。資料にない事実を断定しないでください。JSONのみで返答: {\"title\":\"短い見出し\",\"fact\":\"資料分野に関する意外な知識\",\"application\":\"学んだ内容が実際に使われる場面\",\"question\":\"自分の将来や身近な場面と結びつける問い\"}"
      ]);
      const text = result.response.text();
      const insight = JSON.parse(text);
      const saved = {
        title: String(insight.title || "授業の先にあるもの").slice(0, 80),
        fact: String(insight.fact || "").slice(0, 500),
        application: String(insight.application || "").slice(0, 500),
        question: String(insight.question || "").slice(0, 300),
        createdAt: Date.now()
      };
      if (!saved.fact || !saved.application) throw new Error("AIの回答に必要な項目がありませんでした。");
      await set(ref(db, `rooms/${roomId}/material/trivia`), saved);
      setStatus("豆知識を学生画面に共有しました。");
    } catch (err) {
      console.error(err);
      setStatus(`豆知識を作成できませんでした。Firebase AI Logic/App Checkの設定と利用上限をご確認ください。(${err?.code || err.message || "unknown"})`);
    } finally {
      setIsGenerating(false);
      if (insightFileRef.current) insightFileRef.current.value = "";
    }
  }

  async function handleUrlSave() {
    const url = urlDraft.trim();
    if (!url) return;
    setStatus("保存中...");
    try {
      await set(ref(db, `rooms/${roomId}/material`), {
        url,
        type: "link",
        name: "参考リンク"
      });
      setStatus("保存しました");
      setUrlDraft("");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      console.error(err);
      setStatus("エラーが発生しました");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setStatus("アップロード中...");
    let fileRef = null;
    let fileUploaded = false;
    try {
      fileRef = storageRef(storage, `materials/${roomId}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      fileUploaded = true;
      const url = await getDownloadURL(fileRef);
      await set(ref(db, `rooms/${roomId}/material`), {
        url,
        type: "file",
        name: file.name
      });
      setStatus("アップロード完了");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      console.error(err);
      if (fileUploaded && fileRef) {
        try {
          await deleteObject(fileRef);
        } catch (cleanupError) {
          console.error("アップロード後の資料ファイルを削除できませんでした:", cleanupError);
          setStatus("資料ファイルのアップロード後にルームへの登録で失敗し、Storageに未登録ファイルが残った可能性があります。Firebase設定を確認してください。");
          return;
        }
        setStatus("ファイルはStorageへ送れましたが、ルームへの登録に失敗しました。Realtime Databaseのルールを確認してください。");
      } else {
        setStatus(materialUploadErrorMessage(err));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete() {
    try {
      await remove(ref(db, `rooms/${roomId}/material`));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <section className="material-panel" aria-label="授業資料">
      <div className="material-heading">
        <div>
          <span>授業資料</span>
          <strong>資料の共有</strong>
        </div>
        <FileText aria-hidden="true" />
      </div>
      
      {material ? (
        <div className="material-current">
          <p>現在の資料: <strong>{material.name}</strong></p>
          <div className="material-actions">
            <a href={material.url} target="_blank" rel="noopener noreferrer" className="material-btn-secondary">
              <ExternalLink size={16} /> 確認する
            </a>
            <button onClick={handleDelete} className="material-btn-danger">
              <Trash2 size={16} /> 削除
            </button>
          </div>
          <div className="trivia-create">
            <strong>資料から「授業の先にあるもの」を作る</strong>
            <p>PDF・画像を選ぶと、活用例や豆知識を自動生成して学生画面に表示します。共有リンクの内容は読み取れないため、ファイルを選んでください。</p>
            <label className="ai-consent">
              <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
              この資料をGoogle Geminiへ送って生成することに同意します。個人情報・機密情報を含む資料は選ばないでください。
            </label>
            <input ref={insightFileRef} type="file" accept=".pdf,image/*" disabled={!aiConsent || isGenerating} onChange={(event) => generateTrivia(event.target.files?.[0])} />
            <button type="button" className="material-btn-primary" onClick={() => insightFileRef.current?.click()} disabled={!aiConsent || isGenerating}>
              <Lightbulb size={16} /> {isGenerating ? "生成中..." : "資料を選んで豆知識を生成"}
            </button>
          </div>
          {material.trivia ? <p className="trivia-saved">現在の豆知識: {material.trivia.title}</p> : null}
        </div>
      ) : (
        <div className="material-upload-forms">
          <div className="material-upload-box">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              disabled={isUploading}
              accept=".pdf,image/*" 
              className="material-file-input" 
            />
            <button className="material-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              <UploadCloud size={16} /> 
              {isUploading ? "処理中..." : "ファイルを選択 (PDF/画像)"}
            </button>
          </div>
          <div className="material-divider">または</div>
          <div className="material-url-box">
            <input 
              type="url" 
              aria-label="共有する資料のURL"
              placeholder="https://..." 
              value={urlDraft} 
              onChange={e => setUrlDraft(e.target.value)} 
              className="material-url-input"
            />
            <button onClick={handleUrlSave} className="material-btn-primary" disabled={!urlDraft.trim()}>
              <LinkIcon size={16} /> リンクを設定
            </button>
          </div>
        </div>
      )}
      {status && <p className="material-status">{status}</p>}
    </section>
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
          const explain = item.counts?.explain || 0;
          const total = item.totalResponses || understood + lost + explain;
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
              <div className="timeline-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))", gap: "6px" }}>
                <span>わかった<br/>{understood}</span>
                <span>わからない<br/>{lost}</span>
                <span>もう一回<br/>{explain}</span>
                <span>つまずき<br/>{lostRate}%</span>
                <span>へぇー<br/>{item.wow || 0}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CommentsPanel({ comments, roomId, clientId, title = "コメント", onPost, onLike }) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [posting, setPosting] = useState(false);
  const items = Object.entries(comments || {})
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 50);

  async function postComment() {
    const text = draft.trim().slice(0, 120);
    if (!clientId || !text || posting) {
      return;
    }

    const commentId = `${Date.now()}-${generateId().slice(0, 8)}`;
    setStatus("送信中...");
    setPosting(true);
    try {
      const comment = {
        text,
        authorUid: clientId,
        createdAt: Date.now()
      };
      if (onPost) {
        await onPost(commentId, comment);
      } else {
        await set(ref(db, `rooms/${roomId}/comments/${commentId}`), comment);
        await set(ref(db, `rooms/${roomId}/participants/${clientId}`), true);
      }
      setDraft("");
      setStatus("送信しました");
      window.setTimeout(() => setStatus(""), 1400);
    } catch (err) {
      setStatus("送信できませんでした");
      console.error(err);
    } finally {
      setPosting(false);
    }
  }

  async function likeComment(commentId) {
    if (!clientId) {
      return;
    }

    try {
      if (onLike) {
        await onLike(commentId, clientId);
        return;
      }
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
            aria-label="授業への質問や気づき"
            maxLength={120}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="質問や気づきを匿名で投稿"
          />
          <div className="comment-form-footer">
            <span>{draft.length}/120</span>
            <span role="status">{status}</span>
            <button type="button" onClick={postComment} disabled={!draft.trim() || posting}>
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
  const { error, selected, clientId, comments, material, breakRequested } = useStudentRoom(roomId);
  const poll = useStudentActivity(db, roomId, clientId);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function perform(task, message) {
    if (!clientId || busy) return;
    setBusy(true);
    setStatus("");
    try { await task(); setStatus(message); }
    catch (err) { console.error(err); setStatus("送信できませんでした。通信を確認してもう一度お試しください。"); }
    finally { setBusy(false); }
  }
  function submit(action, detail) {
    return perform(() => update(ref(db, "rooms/" + roomId), {
      ["responses/" + clientId]: detail ? action + ":" + detail : action,
      ["participants/" + clientId]: true
    }), "回答を送信しました。いつでも選び直せます。");
  }
  function toggleBreak() {
    return perform(() => breakRequested
      ? remove(ref(db, "rooms/" + roomId + "/break_requests/" + clientId))
      : set(ref(db, "rooms/" + roomId + "/break_requests/" + clientId), true),
      breakRequested ? "休憩のお願いを取り消しました。" : "休憩のお願いを送りました。");
  }
  function sendWow() {
    return perform(() => runTransaction(ref(db, "rooms/" + roomId + "/reactions/wow"), (current) => (current || 0) + 1), "「へぇー！」を送りました。");
  }
  useEffect(() => { if (!selected) setStatus(""); }, [selected]);
  if (error) return <ErrorScreen message={error} />;
  return <StudentScreen activityId={poll.activity?.id} activityPanel={poll.error ? <p role="alert" className="error-text">{poll.error}</p> : poll.activity ? <StudentActivity key={poll.activity.id} activity={poll.activity} answer={poll.answer} onAnswer={value => set(ref(db, `rooms/${roomId}/pollAnswers/${poll.activity.id}/${clientId}`), value)} /> : null} roomId={roomId} selected={selected} ready={!!clientId} material={material} breakRequested={breakRequested}
    busy={busy} status={status} onSubmit={submit} onWow={sendWow} onBreak={toggleBreak}
    commentCount={Object.keys(comments || {}).length}
    commentsPanel={<CommentsPanel comments={comments} roomId={roomId} clientId={clientId} title="みんなのコメント" />} />;
}

function StudentPreview() {
  const [comments, setComments] = useState({});
  const [selected, setSelected] = useState(null);
  const [breakRequested, setBreakRequested] = useState(false);
  const [status, setStatus] = useState("");
  const material = { name: "人工知能の基礎 · 第3回", url: "#", trivia: {
    title: "「おすすめ」の裏側にも、今日の学び。",
    fact: "教師あり学習は、正解のついた例からパターンを学ぶ仕組みです。",
    application: "画像の分類や、迷惑メールの判定などに応用されています。",
    question: "身近な作業で、AIが手伝えそうなことは？"
  }};
  return <StudentScreen preview roomId="DEMO01" ready selected={selected} material={material} breakRequested={breakRequested} status={status}
    onSubmit={(action, detail) => { setSelected(detail ? action + ":" + detail : action); setStatus(""); }}
    onWow={() => setStatus("「へぇー！」を送りました（プレビュー）")}
    onBreak={() => { setBreakRequested(!breakRequested); setStatus(""); }}
    commentCount={Object.keys(comments).length} commentsPanel={<CommentsPanel
      comments={comments} clientId="preview-student" title="みんなのコメント"
      onPost={(id, comment) => setComments(current => ({ ...current, [id]: comment }))}
      onLike={(id, uid) => setComments(current => ({ ...current, [id]: { ...current[id], likes: { ...current[id].likes, [uid]: true } } }))}
    />} />;
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

  if (import.meta.env.DEV && route === "preview" && roomId === "TEACHER") return <TeacherPreview />;
  if (import.meta.env.DEV && route === "preview" && roomId === "PULSE") return <PulsePreview />;
  if (import.meta.env.DEV && route === "preview" && roomId === "MODES") return <ActivityPreview />;
  if (import.meta.env.DEV && route === "preview" && roomId === "STUDENT") return <StudentPreview />;
  if (route === "teacher" && roomId) {
    return <Teacher roomId={roomId} />;
  }

  if (route === "room" && roomId) {
    return <Student roomId={roomId} />;
  }

  return <Home />;
}

createRoot(document.getElementById("root")).render(<App />);
