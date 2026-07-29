# ラウンド札

小中規模のトレーディングカードゲーム大会で、受付、スイスドローの組合せ、
双方の結果確認、順位までを一つの開催に閉じる道具です。

- 公開用ハンドル以外の参加者情報を集めません。
- アカウントは不要です。主催鍵と参加札を端末に保存します。
- 現在ラウンドを印刷でき、JSON / CSV の控えを保存できます。
- Cloudflare Workers、Hono JSX、Vite+、D1 で動作します。

## 開発

```powershell
npm install
npm run check
npm test
npm run build
```

詳しいデータ境界は `PRIVACY.md`、安全上の連絡先は `SECURITY.md` を参照してください。
