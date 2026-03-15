# GitHub セットアップガイド

## 前提条件

- GitHub アカウント
- Git がインストール済み
- Node.js 18+ がインストール済み（https://nodejs.org）

---

## ステップ 1: GitHub リポジトリ作成

1. https://github.com/new にアクセス
2. 以下を設定:
   - **Repository name:** `4d-gs-viewer`
   - **Description:** `4D Gaussian Splatting ブラウザビューアー`
   - **Public** を選択
   - **Add a README file** は **チェックしない**（こちらで用意済み）
3. 「Create repository」をクリック

---

## ステップ 2: ローカルにプロジェクトを配置

ダウンロードした zip を展開し、ターミナルで以下を実行:

```bash
cd 4d-gs-viewer

# Git 初期化 & リモート接続
git init
git remote add origin https://github.com/Arashiyama2024/4d-gs-viewer.git

# ※ YOUR_USERNAME を自分の GitHub ユーザー名に置き換えてください
```

---

## ステップ 3: vite.config.js のリポジトリ名を確認

`vite.config.js` の `base` がリポジトリ名と一致しているか確認:

```js
base: '/4d-gs-viewer/',
```

リポジトリ名を変えた場合はここも合わせて変更してください。

---

## ステップ 4: 初回 push

```bash
# 依存関係インストール（ローカル開発確認用）
npm install

# ローカルで動作確認
npm run dev
# → ブラウザで http://localhost:5173/4d-gs-viewer/ を開いて確認

# Git にコミット & push
git add .
git commit -m "v0.3.0: 初回リリース"
git branch -M main
git push -u origin main
```

---

## ステップ 5: GitHub Pages を有効化

1. GitHub のリポジトリページ → **Settings** タブ
2. 左メニュー → **Pages**
3. **Source** を **「GitHub Actions」** に変更
4. 保存

これで push のたびに自動ビルド・デプロイされます。

---

## ステップ 6: デプロイ確認

1. リポジトリの **Actions** タブで「Deploy to GitHub Pages」ワークフローが動いていることを確認
2. 緑チェックマーク ✅ が出たら完了
3. `https://YOUR_USERNAME.github.io/4d-gs-viewer/` にアクセス

---

## 今後の開発ワークフロー

### Claude.ai で開発 → GitHub に反映する手順

1. **Claude.ai** で機能追加・修正を行う
2. 生成された `.jsx` ファイルをダウンロード
3. ローカルの `src/App.jsx` を差し替え:
   ```bash
   # ダウンロードしたファイルで上書き
   cp ~/Downloads/4d-gaussian-seminar-viewer.jsx src/App.jsx
   ```
4. 動作確認:
   ```bash
   npm run dev
   ```
5. コミット & push:
   ```bash
   git add .
   git commit -m "v0.3.1: ○○機能追加"
   git push
   ```
6. GitHub Actions が自動デプロイ → 数分で公開 URL に反映

### バージョン番号のルール（推奨）

- **x.Y.z** — 機能追加時に Y を上げる（例: 0.3.0 → 0.4.0）
- **x.y.Z** — バグ修正時に Z を上げる（例: 0.3.0 → 0.3.1）
- **X.y.z** — 大幅なリニューアル時に X を上げる（例: 0.9.0 → 1.0.0）

package.json の `version` と CHANGELOG.md も合わせて更新してください。

---

## トラブルシューティング

### デプロイが失敗する

- Actions タブでエラーログを確認
- 多くの場合 `npm ci` の失敗 → `package-lock.json` が無い場合は `npm install` してから push

### 画面が白い / 404

- `vite.config.js` の `base` がリポジトリ名と一致しているか確認
- GitHub Pages の Source が「GitHub Actions」になっているか確認

### ローカルで動かない

```bash
# Node.js バージョン確認（18+ 必要）
node -v

# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install
npm run dev
```
