import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { advanceBreakAlert, acknowledgeBreakAlert } from './class-pulse-model';

function readSaved(key, fallback) {
  try { return JSON.parse(sessionStorage.getItem(key)) || fallback; } catch { return fallback; }
}
export default forwardRef(function BreakNotifier({ count, participants, roomId, ready = true, compact = false, onStatusChange }, ref) {
  const storageKey = `break-alert:${roomId}`;
  const [threshold, setThreshold] = useState(() => readSaved(`${storageKey}:threshold`, 75));
  const [alert, setAlert] = useState(() => readSaved(storageKey, { reached: false, pending: null }));
  const [enabled, setEnabled] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [permission, setPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const [message, setMessage] = useState('');
  const audio = useRef(null);
  const notification = useRef(null);
  const dialog = useRef(null);
  const settingsDialog = useRef(null);
  const pending = alert.pending;
  const body = pending ? `${pending.participants}人中${pending.count}人が休憩を希望しました。休憩を検討してください。` : '';

  function playSound() {
    const ctx = audio.current;
    if (!ctx || ctx.state !== 'running') return;
    [0, 0.3, 0.6].forEach(delay => {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.connect(gain); gain.connect(ctx.destination);
      tone.frequency.value = 740;
      const start = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      tone.start(start); tone.stop(start + 0.25);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    });
  }
  function desktop(text) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      notification.current?.close();
      notification.current = new Notification('【未確認】授業サポート・休憩のお知らせ', { body: text, tag: `break-${roomId}`, requireInteraction: true });
      notification.current.onclick = () => { window.focus(); notification.current?.close(); };
    } catch { setMessage('デスクトップ通知を表示できません。画面の未確認通知と音を確認してください。'); }
  }
  async function enable() {
    setMessage('');
    const Audio = window.AudioContext || window.webkitAudioContext;
    try {
      if (Audio) {
        audio.current ||= new Audio();
        audio.current.onstatechange = () => setSoundReady(audio.current?.state === 'running');
        await audio.current.resume();
        setSoundReady(audio.current.state === 'running');
      }
      setEnabled(true);
      playSound();
      if ('Notification' in window) setPermission(await Notification.requestPermission());
    } catch { setMessage('音または通知を有効にできませんでした。ブラウザーの設定をご確認ください。'); }
  }
  function acknowledge() {
    setAlert(current => acknowledgeBreakAlert(current));
    notification.current?.close();
  }
  useImperativeHandle(ref, () => ({ acknowledge, enable }));
  useEffect(() => { onStatusChange?.({ pending, enabled, soundReady, permission }); }, [pending, enabled, soundReady, permission, onStatusChange]);
  useEffect(() => {
    if (!ready) return;
    setAlert(current => advanceBreakAlert(current, { count, participants, threshold, now: Date.now() }));
  }, [count, participants, threshold, ready]);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(alert.pending?.test ? { ...alert, pending: null } : alert)); sessionStorage.setItem(`${storageKey}:threshold`, JSON.stringify(threshold)); } catch { /* In-memory notifications remain available. */ }
  }, [alert, threshold, storageKey]);
  useEffect(() => {
    if (!pending) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousTitle = document.title;
    document.title = `【休憩・未確認】${previousTitle}`;
    element?.showModal();
    return () => { element?.close(); document.title = previousTitle; if (previousFocus?.isConnected) previousFocus.focus?.(); };
  }, [pending]);
  useEffect(() => {
    if (!pending || !enabled) return;
    playSound(); desktop(body);
    const soundTimer = window.setInterval(playSound, 10000);
    const reminderTimer = window.setInterval(() => desktop(body), 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') playSound(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(soundTimer); clearInterval(reminderTimer); document.removeEventListener('visibilitychange', onVisible); notification.current?.close(); };
  }, [pending, enabled]);
  useEffect(() => () => { if (audio.current) { audio.current.onstatechange = null; audio.current.close(); } notification.current?.close(); }, []);

  const controls = <><div className="break-notifier-controls"><label>通知する目安 <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}>{[25, 50, 75, 100].map(n => <option key={n} value={n}>{n}％以上</option>)}</select></label>
    <button type="button" onClick={enabled ? () => setEnabled(false) : enable}>{enabled ? '音・通知を停止' : '音・通知を有効にする'}</button>
    {enabled && <button type="button" onClick={() => { playSound(); desktop('通知テストです。実際の休憩要求ではありません。'); }}>音・通知をテスト</button>}
    <button type="button" disabled={!!pending} onClick={() => { settingsDialog.current?.close(); setAlert(current => ({...current,pending:{count:3,participants:4,threshold:75,at:Date.now(),test:true}})); }}>画面・ミニ表示の通知を試す</button>
  </div><p className="notification-health">画面表示：常時有効 ／ 音：{enabled && soundReady ? '有効' : '未有効'} ／ デスクトップ通知：{enabled && permission === 'granted' ? '許可済み' : '未有効'}</p>
    <p>確認するまで画面に表示し、音は10秒ごとに繰り返します。先生画面を開いたまま使い、授業前に音が聞こえるかテストしてください。</p>
    {message && <p role="status">{message}</p>}</>;
  return <>{compact ? <><button className="notification-shortcut" type="button" onClick={() => settingsDialog.current?.showModal()}>通知 {enabled && soundReady ? '有効' : '音が未有効'}</button><dialog className="notification-settings-dialog" ref={settingsDialog}><h2>休憩の通知設定</h2>{controls}<button type="button" onClick={() => settingsDialog.current?.close()}>閉じる</button></dialog></> : <details className="break-notifier" open={!enabled}><summary>休憩の通知設定 {!enabled && <span>音・通知が未有効</span>}</summary>{controls}</details>}
    {pending && createPortal(<dialog ref={dialog} className="urgent-break-dialog" aria-labelledby="break-alert-title" aria-describedby="break-alert-body" onCancel={event => event.preventDefault()}>
      <span className="urgent-label">{pending.test ? '通知テスト · 未確認' : '休憩のお願い · 未確認'}</span><h2 id="break-alert-title">{pending.test ? "通知テストです" : "学生が休憩を希望しています"}</h2><p id="break-alert-body">{body}</p>
      <p>通知時の目安：{pending.threshold}％以上 ／ 現在の希望：{count} / {participants}人</p><p>人数が減っても、確認するまでこの通知を残します。</p>
      {!enabled && <button type="button" onClick={enable}>音・通知も有効にする</button>}
      <button className="acknowledge-break" type="button" autoFocus onClick={acknowledge}>確認しました · 通知を止める</button>
    </dialog>, document.body)}
  </>;
});
