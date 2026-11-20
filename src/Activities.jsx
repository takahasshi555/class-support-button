import React, { useEffect, useState } from 'react';
import { ref, onValue, set, update, get } from 'firebase/database';
import { makeActivity, summarizeActivity } from './activity-model';

const kinds = { understanding: '理解度チェック', choice: '選択式アンケート', text: '自由記述' };

export function ActivityResults({ activity, results }) {
  return <div className="activity-results"><strong>{results?.total || 0}件の回答</strong>
    {activity.kind === 'text' ? <ul>{(results?.texts || []).map((text, i) => <li key={i}>{text}</li>)}</ul> : (activity.options || []).map((option, i) => {
      const count = results?.counts?.[i] || 0;
      const percent = results?.total ? Math.round(count / results.total * 100) : 0;
      return <div className="activity-result" key={i}><div><span>{option}</span><b>{count}人 · {percent}％</b></div><progress value={percent} max={100} aria-label={option} /></div>;
    })}
    {!results?.total && <p>まだ回答はありません。</p>}
  </div>;
}

export function TeacherActivity({ activity, answers, participants, onStart, onClose, onShare, onReturn }) {
  const [kind, setKind] = useState('understanding');
  const [question, setQuestion] = useState('ここまでの内容は理解できましたか？');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const results = summarizeActivity(activity || {}, answers);
  async function perform(task) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (err) { setError(err.message || '操作に失敗しました。もう一度お試しください。'); }
    finally { setBusy(false); }
  }
  return <section className="activity-panel" aria-label="授業モード">
    <div className="activity-heading"><div><span className="section-kicker">授業モード</span><h2>{activity ? kinds[activity.kind] : '今、みんなに聞いてみよう'}</h2></div><span className="activity-phase">{activity ? { active: '回答受付中', closed: '受付終了', results: '結果共有中' }[activity.phase] : '通常の授業'}</span></div>
    {!activity ? <><p>形式を選んで開始すると、学生の回答画面が自動で切り替わります。</p><div className="activity-kinds">{Object.entries(kinds).map(([id, label]) => <button key={id} type="button" disabled={busy} aria-pressed={kind === id} onClick={() => { setKind(id); setQuestion(id === 'understanding' ? 'ここまでの内容は理解できましたか？' : ''); }}>{label}</button>)}</div>
      <label className="activity-field">質問<input maxLength={120} value={question} disabled={busy} onChange={e => setQuestion(e.target.value)} placeholder={kind === 'text' ? '例：今日の授業で気になったことは？' : '例：どの解き方だと思いますか？'} /></label>
      {kind === 'choice' && <div className="activity-options">{options.map((option, i) => <label className="activity-field" key={i}>選択肢 {i + 1}<input value={option} maxLength={80} disabled={busy} onChange={e => setOptions(options.map((s, n) => n === i ? e.target.value : s))} /></label>)}<button type="button" disabled={busy || options.length >= 6} onClick={() => setOptions([...options, ''])}>＋ 選択肢を追加</button><small>2〜6個。空欄の選択肢は追加されません。</small></div>}
      <button className="primary-action" type="button" disabled={busy || !question.trim()} onClick={() => perform(() => onStart(makeActivity(kind, question, options, crypto.randomUUID())))}>{busy ? '開始しています…' : '回答を開始する'}</button>
    </> : <><h3 className="activity-question">{activity.question}</h3><p>{results.total} / {participants}人が回答 · 学生は受付中なら回答を変更できます</p>
      <ActivityResults activity={activity} results={activity.phase === 'active' ? results : activity.results || results} />
      <div className="activity-actions">{activity.phase === 'active' ? <button className="primary-action" disabled={busy} onClick={() => perform(onClose)}>回答を締め切る</button> : <>
        {activity.phase === 'closed' && <button className="primary-action" disabled={busy} onClick={() => perform(onShare)}>結果を学生に共有</button>}
        <button disabled={busy} onClick={() => perform(onReturn)}>通常の授業に戻る</button>
      </>}</div>{activity.phase === 'closed' && <p>結果はまだ学生には表示されていません。自由記述は内容を確認してから共有してください。</p>}
    </>}
    {busy && <p role="status">処理中…</p>}{error && <p role="alert" className="error-text">{error}</p>}
  </section>;
}

export function useStudentActivity(db, roomId, uid) {
  const [activity, setActivity] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!uid) return;
    return onValue(ref(db, `rooms/${roomId}/activity`), snap => { setActivity(snap.val()); setError(''); }, () => setError('授業モードを取得できません。接続またはアクセス設定を確認してください。'));
  }, [db, roomId, uid]);
  useEffect(() => {
    setAnswer(null);
    if (!uid || !activity?.id) return;
    return onValue(ref(db, `rooms/${roomId}/pollAnswers/${activity.id}/${uid}`), snap => setAnswer(snap.val()), () => setError('回答状態を取得できません。'));
  }, [db, roomId, uid, activity?.id]);
  return { activity, answer, error };
}

export function StudentActivity({ activity, answer, onAnswer }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { setDraft(answer || ''); }, [answer]);
  async function submit(value) {
    if (busy) return;
    setBusy(true); setStatus('');
    try { await onAnswer(value); setStatus('回答を送信しました。受付中は変更できます。'); }
    catch { setStatus('送信できませんでした。受付状況や通信を確認してください。'); }
    finally { setBusy(false); }
  }
  return <section className="activity-panel" aria-label="先生からの質問"><span className="section-kicker">{kinds[activity.kind]} · {{ active: '回答受付中', closed: '受付終了', results: '結果共有' }[activity.phase]}</span><h1 className="activity-question">{activity.question}</h1>
    {activity.phase === 'active' ? <>{activity.kind === 'text' ? <form onSubmit={e => { e.preventDefault(); submit(draft.trim()); }}><label className="activity-field">あなたの回答<textarea maxLength={120} value={draft} onChange={e => setDraft(e.target.value)} placeholder="120文字以内で入力" disabled={busy} /></label><button className="primary-action" disabled={busy || !draft.trim()}>回答を送信</button></form> : <div className="activity-student-options">{(activity.options || []).map((option, i) => <button key={i} disabled={busy} aria-pressed={answer === String(i)} onClick={() => submit(String(i))}><span>{String.fromCharCode(65 + i)}</span>{option}{answer === String(i) && <b>✓ 回答済み</b>}</button>)}</div>}
      <p role="status">{busy ? '送信中…' : status || (answer !== null ? '回答済みです。受付中は変更できます。' : 'あなたの回答を先生に届けましょう。')}</p></> : activity.phase === 'results' ? <ActivityResults activity={activity} results={activity.sharedResults} /> : <p role="status">回答を締め切りました。先生が結果を共有するまでお待ちください。</p>}
  </section>;
}

export async function closeActivity(db, roomId, activity) {
  const base = `rooms/${roomId}`;
  await update(ref(db, `${base}/activity`), { phase: 'closed' });
  const snapshot = await get(ref(db, `${base}/pollAnswers/${activity.id}`));
  const results = summarizeActivity(activity, snapshot.val() || {});
  await set(ref(db, `${base}/pollHistory/${activity.id}`), { ...activity, phase: 'closed', results, closedAt: Date.now() });
  return results;
}
