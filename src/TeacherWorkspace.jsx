import React, { useEffect, useRef, useState } from 'react';
import { QrCode, MessageCircle, FileText, History, ClipboardList, X, CheckCircle2, Users } from 'lucide-react';
import MiniMonitor from './MiniMonitor';
import { Brand } from './StudentScreen';
import ClassPulse from './ClassPulse';
import BreakNotifier from './BreakNotifier';
import { ActivityResults } from './Activities';
import { summarizeActivity } from './activity-model';

export default function TeacherWorkspace({ roomId, state, labels, topicLabel, panels }) {
  const [panel, setPanel] = useState(null);
  const [notificationState, setNotificationState] = useState({pending:null,enabled:false,soundReady:false});
  const notifier = useRef(null);
  const dialog = useRef(null);
  const previousFocus = useRef(null);
  const activity = state?.activity;
  const participants = state?.participants || 0;
  const answers = state?.pollAnswers?.[activity?.id] || {};
  const pollResults = activity ? summarizeActivity(activity, answers) : null;
  const total = activity ? pollResults.total : state?.totalResponses || 0;
  const counts = state?.counts || {};
  const comments = Object.values(state?.comments || {}).sort((a,b) => b.createdAt-a.createdAt);
  const breakCount = Object.keys(state?.breakRequests || {}).length;
  const titles = { invite: '学生を招待', activity: 'アンケート', details: '理解度の詳細', record: 'メモ・集計を保存', materials: '資料・豆知識', history: '授業の記録', comments: '授業コメント' };
  useEffect(() => {
    if (panel) { previousFocus.current = document.activeElement; dialog.current?.showModal(); }
    else { dialog.current?.close(); previousFocus.current?.focus?.(); }
  }, [panel]);
  return <div className="teacher-console">
    <header className="console-header"><Brand /><span>教員用 <b>{roomId}</b></span><button type="button" onClick={() => setPanel('invite')}><QrCode size={17} />QR・参加案内</button></header>
    <main className="console-main">
      <div className="console-toolbar"><div><h1>授業の状況</h1><span>{state ? 'リアルタイム更新' : '接続しています…'}</span></div><nav aria-label="授業の操作"><MiniMonitor roomId={roomId} state={state} notification={notificationState} onAcknowledge={() => notifier.current?.acknowledge()} onEnableNotifications={() => notifier.current?.enable()}/><button type="button" onClick={() => setPanel('activity')}><ClipboardList size={17} />{activity ? 'アンケートを操作' : 'アンケート'}</button><button type="button" onClick={() => setPanel('materials')}><FileText size={17} />資料</button><button type="button" onClick={() => setPanel('history')}><History size={17} />履歴</button></nav></div>
      <section className="console-attendance" aria-label="参加と回答"><div><Users size={20} /><span>参加者</span><strong>{participants}<small>人</small></strong></div><div><CheckCircle2 size={20} /><span>回答済み</span><strong>{total}<small>人</small></strong></div><div><span>未回答</span><strong>{Math.max(0, participants-total)}<small>人</small></strong></div><div className="console-current"><span>{activity ? 'アンケート' : '今の話題'}</span><strong title={activity?.question || topicLabel}>{activity?.question || topicLabel || '授業中'}</strong><small>{activity ? {active:'回答受付中',closed:'受付終了',results:'結果共有中'}[activity.phase] : '通常の理解度チェック'}</small></div></section>
      <section className="console-understanding"><div className="console-card-heading"><h2>{activity ? 'アンケートの回答状況' : '理解の状況'}</h2><button type="button" onClick={() => setPanel(activity ? 'activity' : 'details')}>{activity ? '締切・結果共有' : '詳細を見る'} →</button></div>
        {activity ? activity.kind === 'text' ? <div className="console-text-results"><strong>{pollResults.total}件の回答</strong><p>自由記述の内容を確認してから、学生に結果を共有できます。</p><button type="button" onClick={() => setPanel('activity')}>回答を確認する</button></div> : <ActivityResults activity={activity} results={pollResults} /> : <><div className="understanding-stack" role="img" aria-label={total ? Object.entries(labels).map(([key,label])=>`${label} ${counts[key] || 0}人`).join('、') : '回答を待っています'}>{total ? Object.entries(labels).filter(([key])=>counts[key]>0).map(([key,label])=><div key={key} className={key} style={{flex:counts[key]}} title={`${label} ${counts[key]}人`}><span>{Math.round(counts[key]/total*100)}％</span></div>):<span className="stack-empty">学生の回答を待っています</span>}</div><div className="understanding-legend">{Object.entries(labels).map(([key,label])=><span key={key}><i className={key}/>{label}：<b>{counts[key] || 0}人</b></span>)}</div></>}
      </section>
      <ClassPulse compact showNotifier={false} ready={!!state} wow={state?.reactions?.wow || 0} breakCount={breakCount} participants={participants} history={state?.history || {}} roomId={roomId} topicLabel={topicLabel} />
      <footer className="console-footer"><button className="console-comments" type="button" onClick={() => setPanel('comments')}><MessageCircle size={18}/><strong>コメント {comments.length}件</strong><span>{comments[0]?.text || 'まだコメントはありません'}</span></button><button type="button" className="console-record" onClick={() => setPanel('record')}>メモ・集計を保存 →</button><BreakNotifier ref={notifier} onStatusChange={setNotificationState} compact ready={!!state} key={roomId} count={breakCount} participants={participants} roomId={roomId}/></footer>
    </main>
    <dialog className="console-dialog" ref={dialog} onCancel={() => setPanel(null)} onClose={() => setPanel(null)}><header><h2>{titles[panel]}</h2><button type="button" aria-label="閉じる" onClick={() => setPanel(null)}><X size={22}/></button></header><div className="console-dialog-body">{Object.entries(panels).map(([id,content])=><section key={id} hidden={panel!==id}>{content}</section>)}</div></dialog>
  </div>;
}
