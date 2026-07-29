# Metrics

`product_events` の許可済みイベントを、匿名セッションと日付で集計します。

- `visited`: 製品を開いた
- `tournament_created`: 開催を作成した
- `registration_saved`: 参加札を受け取った
- `checked_in`: 当日受付を完了した
- `tournament_started`: 第1ラウンドを公開した
- `round_published`: 次ラウンドを公開した
- `result_confirmed`: 双方一致または主催裁定で結果が確定した
- `tournament_completed`: 最終ラウンドが完了した
- `returned`: 別の日に再訪した

`x-round-qa: 1` のイベントは保存時に `is_qa = 1` とし、実利用集計から除外します。
開催データは開始14日後、イベントは45日後に定期削除します。
