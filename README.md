# 授業理解確認ボタン

先生が授業中に学生の理解度を匿名・リアルタイムで確認するためのWebアプリです。

## 使い方

### npmなしでWeb版を動かす

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local-web.ps1
```

ブラウザで `http://localhost:5173/` を開きます。学生画面は `http://localhost:5173/room` です。

### npmなしでローカル試作を見る

`local-prototype.html` をダブルクリックして開きます。先生画面と学生画面を1つの画面で試せます。

### Webアプリ版を動かす

```powershell
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開き、「授業ルームを作成」を押します。先生画面に表示されたQRコードを学生がスマホで読み取ると、匿名で3段階の理解度を送信できます。

## 主な機能

- 先生用ルーム作成
- 学生参加用QRコード表示
- 「わかった」「少し不安」「わからない」の3段階回答
- Socket.IOによるリアルタイム集計
- 参加者数と回答数の表示
- 先生による回答リセット
- メモリ上だけの一時データ保持
