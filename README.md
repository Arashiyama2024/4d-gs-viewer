# 4D Gaussian Splat ビューアー

4D Gaussian Splatting のブラウザベースビューアーです。撮影講座・セミナー配信・VFX合成に対応しています。

## 主な機能

- **4D Gaussian Splatting 表示** — .splat / .ply / .splatv 形式の読み込み対応
- **マルチカメラプリセット** — 6つのカメラアングル（正面・バスト・斜め・俯瞰・ローアングル等）をキー1〜6で即切替
- **シーン環境切替** — デフォルト / 3Dトラッキングスタジオ / クロマキー配信用
- **配信対応** — OBS / YouTube / Zoom / Twitch 向けの解像度プリセット
- **フリーズ機能** — 一時停止でポーズ固定、カメラだけ自由に操作（VFX合成素材撮影用）
- **フルスクリーン** — UI表示/非表示切替対応

## デモ

👤 プロシージャル生成の人型モデル（約4,200スプラット）がダンスアニメーションで表示されます。

## 技術スタック

- React 18 + Vite
- Canvas 2D（3Dルックアットカメラ + ソフトウェアレンダリング）
- GitHub Pages（自動デプロイ）

## セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/YOUR_USERNAME/4d-gs-viewer.git
cd 4d-gs-viewer

# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# ビルド結果プレビュー
npm run preview
```

## デプロイ

`main` ブランチに push すると GitHub Actions が自動でビルド・デプロイします。

**初回セットアップ:**
1. GitHub リポジトリの Settings → Pages → Source を「GitHub Actions」に変更
2. `main` に push すれば自動デプロイ開始

**公開URL:** `https://YOUR_USERNAME.github.io/4d-gs-viewer/`

## 開発ワークフロー

このプロジェクトは Claude.ai 上で開発を行い、GitHub でバージョン管理しています。

1. Claude.ai で機能開発・修正
2. 生成されたファイルをダウンロード
3. ローカルの `src/App.jsx` を差し替え
4. `git commit` → `git push` で自動デプロイ

## バージョン履歴

- **v0.3.0** — シーン環境切替（デフォルト/3Dトラッキング/クロマキー）、データ読み込みタブ
- **v0.2.0** — フリーズ機能、ローアングル対応、CSS全画面、orbit自動回転削除
- **v0.1.0** — 初版: マルチカメラプリセット、ディレクターパネル、配信設定

## 参考プロジェクト

- [hustvl/4DGaussians](https://github.com/hustvl/4DGaussians) — CVPR 2024
- [fudan-zvg/4d-gaussian-splatting](https://github.com/fudan-zvg/4d-gaussian-splatting) — ICLR 2024
- [antimatter15/splat](https://github.com/antimatter15/splat) — WebGL 3D Splat Viewer
- [huggingface/gsplat.js](https://github.com/huggingface/gsplat.js) — JS Gaussian Splatting Library

## ライセンス

MIT
