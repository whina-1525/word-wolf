# ワードウルフ

家族のスマホで遊ぶワードウルフです。ブラウザで開いて、ホーム画面に追加できます。

## このパソコンで試す

Firestore のエミュレータに Java 21 が必要です。

```powershell
npm install
npm --prefix functions install
npm run icons
npm test
npm --prefix functions run build
npm run emulators
```

別の端末で、もう一つ:

```powershell
npm run dev
```

ブラウザで http://localhost:5173 を開きます。合言葉で入るテストは、ブラウザを分けてください。同じブラウザだと同じ人になります。

## 本番の Firebase

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作る
2. Authentication で匿名ログインを有効にする
3. Firestore、Realtime Database、Storage、Functions、Hosting を作る
4. Functions は Blaze（従量課金）プランが必要です。家族で遊ぶ量なら無料枠に収まる想定です
5. Realtime Database はアジア東北リージョンにする
6. `.firebaserc` の `demo-word-wolf` を自分のプロジェクト ID に変える
7. `.env.example` を `.env.production` にコピーし、ウェブアプリの設定値を入れる。`VITE_USE_EMULATOR` は `false`
8. `firebase login`
9. `npm run deploy`

スマホでは、出た Hosting の URL を開いてホーム画面に追加します。

単語を配る処理は Cloud Functions 側です。自分の画面には、自分の言葉だけが届きます。
