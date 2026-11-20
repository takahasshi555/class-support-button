import React, { useEffect, useState } from 'react';
import { BookOpen, Check, CheckCircle2, Smile, HelpCircle, RotateCcw, ChevronRight, Lightbulb, Coffee, FileText, MessageCircle, ExternalLink, ShieldCheck } from 'lucide-react';

export function Brand() {
  return <a className="brand" href="/" aria-label="授業サポート トップへ"><span className="brand-icon"><BookOpen size={23} aria-hidden="true" /></span><span>授業サポートボタン</span></a>;
}

export default function StudentScreen({ roomId, selected, ready, material, commentsPanel, commentCount, breakRequested, busy, status, onSubmit, onWow, onBreak, preview = false, activityId, activityPanel }) {
  const [tab, setTab] = useState('answer');
  useEffect(() => { if (activityId) { setTab('answer'); window.scrollTo({ top: 0, behavior: 'instant' }); } }, [activityId]);
  const action = typeof selected === 'string' ? selected.split(':')[0] : selected?.action;
  const detail = typeof selected === 'string' ? selected.split(':')[1] : selected?.detail;
  const choices = [
    { id: 'understood', title: 'わかった', text: 'このまま進めて大丈夫', icon: CheckCircle2 },
    { id: 'lost', title: 'わからない', text: 'つまずいているところがある', icon: HelpCircle },
    { id: 'explain', title: 'もう一回説明してほしい', text: '説明をもう一回お願いします', icon: RotateCcw }
  ];
  const options = action === 'understood' ? { high: 'しっかりわかった', medium: 'だいたいわかった', low: '少し不安' } : action === 'lost' ? { explanation: '説明', term: '用語', solution: '解き方', step: '途中から', other: 'その他' } : null;
  function changeTab(value) { setTab(value); window.scrollTo({ top: 0, behavior: 'instant' }); }
  return <div className="learner-app">
    <header className="app-topbar"><Brand /><span className="room-badge">学生用</span></header>
    <main className="learner-main">
      {preview && <p className="preview-banner">デザインプレビュー · 操作はこの画面内だけに反映されます</p>}
      <section hidden={tab !== 'answer'} aria-label="回答">
        <div className="student-class-header"><h1><BookOpen size={23} />{ready ? '授業に参加中' : '接続しています…'}</h1><div><span>ルームコード</span><strong>{roomId}</strong></div></div>
        <p className="student-privacy"><ShieldCheck size={17} /><strong>氏名非表示</strong><span>回答に名前は表示されません。</span></p>
        {activityPanel || <div className="student-answer-stack">
          <div className="response-choices">{choices.slice(0, 2).map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`response-choice ${id} ${action === id ? 'is-selected' : ''}`} aria-pressed={action === id} disabled={!ready || busy} onClick={() => onSubmit(id)}><Icon size={34} /><strong>{title}</strong>{action === id && <span className="choice-selected"><Check size={16} />回答済み</span>}</button>)}</div>
          <button type="button" className="student-wow" onClick={onWow} disabled={!ready || busy}><Lightbulb size={38} /><strong>へぇー</strong><span>何度でも送れます</span></button>
          <button type="button" className={`student-explain ${action === 'explain' ? 'is-selected' : ''}`} aria-pressed={action === 'explain'} disabled={!ready || busy} onClick={() => onSubmit('explain')}><RotateCcw size={23} /><strong>もう一回説明してほしい</strong>{action === 'explain' && <Check size={20} />}</button>
        </div>}
        {activityPanel && <button type="button" className="student-wow compact" onClick={onWow} disabled={!ready || busy}><Lightbulb size={24} /><strong>へぇー</strong><span>何度でも送れます</span></button>}
        <button type="button" className={`student-break ${breakRequested ? 'is-selected' : ''}`} onClick={onBreak} disabled={!ready || busy} aria-pressed={breakRequested}><Coffee size={23} /><strong>{breakRequested ? '休憩リクエスト済み' : '休憩リクエスト'}</strong>{breakRequested && <Check size={18} />}</button>
        <p className="response-status" role="status">{busy ? '送信中…' : status || (breakRequested ? '休憩リクエストはもう一度押すと取り消せます' : action && !activityPanel ? '回答済み · 理解度はいつでも選び直せます' : ready ? 'ボタンを押すと、そのまま先生に届きます' : '授業に接続しています…')}</p>
        {!activityPanel && options && <details className="response-details"><summary>もう少し詳しく伝える（任意）</summary><p>{action === 'understood' ? 'どのくらいわかった？' : 'どこでつまずいた？'}</p><div>{Object.entries(options).map(([id, text]) => <button type="button" key={id} aria-pressed={detail === id} className={detail === id ? 'is-selected' : ''} disabled={busy || !ready} onClick={() => onSubmit(action, id)}>{text}</button>)}</div></details>}
      </section>
      <section hidden={tab !== 'comments'} aria-label="コメント"><div className="page-intro"><span className="section-kicker">CLASSROOM TALK</span><h1>質問も、気づきも。</h1><p>気になったことを、授業のみんなと共有しよう。</p></div>{commentsPanel}</section>
    </main>
    <nav className="student-navigation" aria-label="学生メニュー">{[{ id: 'answer', label: '回答', icon: CheckCircle2 }, { id: 'comments', label: 'コメント', icon: MessageCircle }].map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'is-active' : ''} onClick={() => changeTab(id)}><span><Icon size={22} />{id === 'comments' && commentCount > 0 && <i>{commentCount > 99 ? '99+' : commentCount}</i>}</span>{label}</button>)}</nav>
  </div>;
}
