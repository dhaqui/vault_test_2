# PayPal Return Payer (Vault) Demo — Sandbox (JA)

「購入時に PayPal を保存 → 次回以降の**戻り支払者**体験でボタンに保存済み手段を表示」する最小構成です。

## 重要ポイント
- JS SDK スクリプトに **`data-user-id-token` を付与**します（毎回新規発行）。
- `id_token` は **`/v1/oauth2/token` に `response_type=id_token` と `options[customer_id]`（既知の customer.id）** を付けて取得します。
- 初回の **capture** 応答 `payment_source.paypal.attributes.vault.customer.id` を保存して、次回の `id_token` 発行に利用します。
- Order 作成時は `payment_source.paypal.attributes.vault.store_in_vault = "ON_SUCCESS"` を必ず設定します。

## セットアップ
```bash
npm install
npm start
# http://localhost:3000
```
`.env` は `.env.example` を参照。

## Render デプロイ
- Start: `node server.js`
- Env: `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `BASE_URL=https://<your>.onrender.com`

## テスト手順
1) 初回購入で保存 → capture 応答の `vault.customer.id` を UI/LocalStorage に反映
2) ページを再読み込みすると、サーバーが `options[customer_id]=<保存済み>` で `id_token` を発行
3) JS SDK が保存済みの手段をボタンに表示（戻り支払者体験）
