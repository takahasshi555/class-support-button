import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PictureInPicture2, CheckCircle2, CircleHelp, RotateCcw, Coffee } from 'lucide-react';
import { summarizeActivity } from './activity-model';

const miniStyles = `
.mini-urgent{min-height:100vh;background:#fff0e8;border:4px solid #a84317;color:#842c0d;text-align:center}.mini-urgent h1{font-size:19px;margin:10px 0}.mini-urgent p{font-size:12px;line-height:1.6;margin:8px 0}.mini-urgent p strong{font-size:23px}.mini .mini-ack{width:100%;background:#922f0c;color:white;border:0;font-size:13px;font-weight:bold;min-height:42px}.mini .mini-enable{margin-top:6px;width:100%;font-size:10px;color:#9b3e19}

*{box-sizing:border-box}html,body{margin:0;background:#f4f7fa;color:#19344e;font-family:Meiryo, sans-serif}body{min-width:200px}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #4ba4dd;outline-offset:2px}.mini{padding:10px}.mini header{display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-bottom:9px}.mini header strong{display:flex;gap:5px;align-items:center}.mini header span{font-size:10px;color:#607080}.mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.mini-stat{background:white;border:1px solid #dce5ee;border-radius:10px;padding:9px 10px}.mini-label{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700}.mini-value{display:flex;align-items:baseline;gap:4px;margin-top:2px}.mini-value strong{font-size:30px;line-height:1.3}.mini-value small{font-size:11px}.mini-stat.good{background:#edf8f0;color:#187442}.mini-stat.lost{background:#fff4e5;color:#955400}.mini-stat.repeat{color:#40658d}.mini-stat.rest{color:#9c4c29}.mini footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:10px;color:#526579}.mini button{border:1px solid #c9d5e0;border-radius:7px;background:white;color:#19344e;padding:5px 8px;font-size:10px}.mini-mode{font-size:10px;margin:0 0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-poll{padding:10px;background:#e8eef5;border-radius:9px;margin-bottom:7px;font-size:12px}.mini-poll strong{font-size:22px}.mini progress{width:100%;accent-color:#19344e;height:6px}@media(max-height:220px){.mini{padding:6px}.mini-stat{padding:5px 8px}.mini-value strong{font-size:24px}.mini header{margin-bottom:5px}.mini footer{margin-top:5px}}`;

export function MiniMonitorContents({ roomId, state, onReturn, notification, onAcknowledge, onEnableNotifications }) {
  const activity = state?.activity;
  const results = activity ? summarizeActivity(activity, state?.pollAnswers?.[activity.id] || {}) : null;
  const understandingPoll = activity?.kind === 'understanding';
  const counts = understandingPoll ? {understood:results.counts?.[0] || 0,lost:results.counts?.[1] || 0,explain:results.counts?.[2] || 0} : state?.counts || {};
  const participants = state?.participants || 0;
  const total = understandingPoll ? results.total : state?.totalResponses || 0;
  const items = [{label:'わかった',value:counts.understood || 0,icon:CheckCircle2,tone:'good'},{label:'わからない',value:counts.lost || 0,icon:CircleHelp,tone:'lost'},{label:'もう一回説明',value:counts.explain || 0,icon:RotateCcw,tone:'repeat'},{label:'休憩希望',value:Object.keys(state?.breakRequests || {}).length,icon:Coffee,tone:'rest'}];
  if (notification?.pending) return <main className="mini mini-urgent" role="alert"><header><strong>{notification.pending.test ? '通知テスト' : '休憩のお願い'}</strong><span>未確認</span></header><Coffee size={30}/><h1>{notification.pending.test ? '通知の表示テスト' : '休憩を希望しています'}</h1><p><strong>{notification.pending.count} / {notification.pending.participants}人</strong>が休憩を希望{notification.pending.test && '（サンプル）'}</p><p>確認するまで表示を続けます</p><button className="mini-ack" type="button" onClick={onAcknowledge}>確認しました · 通知を止める</button></main>;
  return <main className="mini"><header><strong>授業ミニモニター</strong><span>{roomId}</span></header>
    {activity && <p className="mini-mode" title={activity.question}>{understandingPoll ? '理解度チェック' : 'アンケート'}：{activity.question}</p>}
    {activity && !understandingPoll && <div className="mini-poll">アンケート回答 <strong>{results.total}</strong> / {participants}人 <progress max={Math.max(1,participants)} value={results.total}/><small>下は通常の理解度です</small></div>}
    <div className="mini-grid">{items.map(({label,value,icon:Icon,tone})=><section className={`mini-stat ${tone}`} key={tone} aria-label={`${label} ${value}人`}><div className="mini-label"><Icon size={15}/>{label}</div><div className="mini-value"><strong>{value}</strong><small>人</small></div></section>)}</div>
    <footer><span>{state ? `理解度回答 ${total} / ${participants}人` : '接続しています…'}</span><button type="button" onClick={onReturn}>教員画面へ</button></footer>{notification && !(notification.enabled && notification.soundReady) && <button className="mini-enable" type="button" onClick={onEnableNotifications}>音の通知が未有効 · 有効にする</button>}</main>;
}

export default function MiniMonitor({ roomId, state, notification, onAcknowledge, onEnableNotifications }) {
  const [pipWindow, setPipWindow] = useState(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [inlineVisible, setInlineVisible] = useState(false);
  const [inlineBody, setInlineBody] = useState(null);
  const attempt = useRef(0);
  const help = useRef(null);
  const activeWindow = useRef(null);
  const userClosing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current += 1; activeWindow.current?.close(); }; }, []);
  function showFallback(message) {
    setError(message);
    setInlineVisible(true);
    setInlineBody(null);
  }
  async function openMonitor() {
    if (activeWindow.current && !activeWindow.current.closed) { activeWindow.current.focus(); return; }
    if (!window.documentPictureInPicture?.requestWindow) {
      showFallback('このブラウザーは最前面表示に非対応のため、ページ内に表示しています。スライドの上には表示されません。'); return;
    }
    setOpening(true); setError('');
    const requestId = ++attempt.current;
    let timer;
    try {
      const request = window.documentPictureInPicture.requestWindow({width:300,height:280});
      request.then(floating => { if (!mounted.current || requestId !== attempt.current) floating.close(); }, () => {});
      const floating = await Promise.race([request, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('timeout')), 5000); })]);
      if (!mounted.current || requestId !== attempt.current) { floating.close(); return; }
      clearTimeout(timer);
      setInlineVisible(false);
      activeWindow.current = floating;
      floating.document.title = '授業ミニモニター';
      floating.document.documentElement.lang = 'ja';
      const style = floating.document.createElement('style'); style.textContent = miniStyles; floating.document.head.appendChild(style);
      floating.addEventListener('pagehide', () => { activeWindow.current = null; if (mounted.current) { setPipWindow(null); if (!userClosing.current && Date.now() - openedAt < 1500) showFallback('小窓がすぐに閉じられたため、ページ内に表示しています。このブラウザーでは最前面表示が制限されている可能性があります。'); } }, {once:true});
      setPipWindow(floating);
    } catch {
      if (mounted.current && requestId === attempt.current) {
        attempt.current += 1;
        showFallback('最前面の小窓を開けなかったため、ページ内に表示しています。スライドの上には表示されません。');
      }
    } finally { clearTimeout(timer); if (mounted.current) setOpening(false); }
  }
  return <><button type="button" className="mini-launch" onClick={openMonitor} disabled={opening}><PictureInPicture2 size={17}/>{opening ? '開いています…' : pipWindow ? 'ミニ表示を確認' : 'ミニ表示'}</button>
    {inlineVisible && createPortal(<aside className="mini-inline-fallback" aria-label="ページ内ミニモニター"><div className="mini-inline-heading"><strong>ページ内ミニ表示</strong><button type="button" aria-label="ページ内ミニ表示を閉じる" onClick={() => setInlineVisible(false)}>×</button></div><p role="status">{error}</p><iframe title="授業ミニモニター" srcDoc={`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${miniStyles}</style></head><body></body></html>`} onLoad={e => setInlineBody(e.currentTarget.contentDocument.body)} />{inlineBody && createPortal(<MiniMonitorContents roomId={roomId} state={state} notification={notification} onAcknowledge={onAcknowledge} onEnableNotifications={onEnableNotifications} onReturn={() => setInlineVisible(false)}/>,inlineBody)}<button className="mini-fallback-help" type="button" onClick={() => help.current?.showModal()}>スライドの上に表示するには</button></aside>,document.body)}
    <dialog className="mini-help-dialog" ref={help}><h2>授業ミニモニター</h2><p>デスクトップ版Chromeの通常タブで授業ルームを作成し、その教員画面から「ミニ表示」を押してください。このアプリ内では最前面表示が利用できない場合があります。</p><p>教員権限はブラウザーごとに保存されています。別のブラウザーで同じURLを開いても、教員として入れない場合があります。</p><button type="button" onClick={() => help.current?.close()}>閉じる</button></dialog>
    {pipWindow && createPortal(<MiniMonitorContents roomId={roomId} state={state} notification={notification} onAcknowledge={onAcknowledge} onEnableNotifications={onEnableNotifications} onReturn={() => {userClosing.current = true; window.focus(); pipWindow.close();}}/>, pipWindow.document.body)}
  </>;
}
