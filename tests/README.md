# 50人のローカル動作検証

実際のアプリ画面を、教員1人と独立した学生50人のChromeブラウザーコンテキストで操作します。Firebase Auth / Realtime Database Emulatorと本番と同じ `database.rules.json` を使用します。本番への負荷試験ではありません。AI生成は実行しません。

## 準備

- Node.js、Chrome、Java 21を用意し、`java` にPATHを通します。
- `npm ci` を実行します。Playwrightはインストール済みChromeを利用します。
- 以下の3つをプロジェクトのルートで、別々のターミナルから実行します。

```powershell
npx firebase-tools@15.37.0 emulators:start --only auth,database --project demo-class-support --config firebase.loadtest.json
```

```powershell
npm run dev:loadtest
```

```powershell
npm run test:load
```

必ず `demo-class-support` を使用してください。検証モードはlocalhost限定で、実プロジェクトの環境変数を使用せず、App Checkも無効にします。通常の開発・本番ビルドではこのモードは無効です。テストのHTTP通信も指定したローカルポートだけ許可します。

## 内容と結果

- 50人の独立した匿名認証で同時参加し、教員画面の参加人数を確認
- 30対20の同時回答、10人の回答変更後の40対10を確認
- 休憩通知の75%境界（37人では未通知、38人で通知）、人数減少後も確認まで表示する動作
- 50人同時の「へぇー」を3回、合計150回の集計
- 10人を一時オフラインにして復帰・再読込・回答変更し、重複がないことを確認

結果は `outputs/load-test/results.json`、休憩通知のスクリーンショットは同じフォルダーの `teacher-break.png` に保存します。失敗時は終了コード1です。テストは毎回新しいローカルルームを作り、終了時にブラウザーを閉じます。エミュレーターはCtrl+Cで停止すると、保存していない検証データを破棄します。

`durationMs` は操作・確認・待機を含むシナリオ全体の所要時間です。個々の通信の遅延や本番の性能保証を示す値ではありません。50台のスマホ・学校のWi-Fi・Firebase本番の上限・App Check・音やOS通知・長時間の利用は別途検証が必要です。

2026-11-20の初回検証では「へぇー」の50人同時送信が18回で止まる問題を検出しました。クライアント側トランザクションをサーバー側の `increment(1)` に置き換え、同じテストで再検証し、6項目すべてが通過しました。修正前の結果は `outputs/load-test/before-fix.json` に保存しています。

参考: [Firebase Emulator](https://firebase.google.com/docs/emulator-suite/connect_rtdb)、[サーバー側の加算](https://firebase.google.com/docs/database/web/read-and-write#atomic_server-side_increments)
