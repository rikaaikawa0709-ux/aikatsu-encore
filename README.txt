アイカツアンコール カード管理アプリ（Firebase接続版）

このフォルダには、Firebaseプロジェクト aikatsuencore-b9ab8 のWeb設定を組み込んだ試作アプリが入っています。

できること
- Googleログイン（Firebase Authentication）
- ログインした本人のカード情報をFirestoreに保存
- カードの追加・編集・削除
- 所持／未所持、交換予定、欲しいカードを独立管理
- 所持枚数、検索、絞り込み、簡易ダッシュボード

注意
- カード一覧・公式カード画像はまだ取り込んでいません。最初は「カード追加」から手動登録できます。
- 公式サイトの画像・データを無断でコピー／再配布しないでください。
- このアプリは未デプロイの試作版です。GoogleログインにはHTTPSで配信する必要があります。
- Firebase Console > Authentication > Settings > Authorized domains に、公開先のドメインを追加してください（Firebase Hostingを使う場合は通常自動で登録されます）。
- Firestoreルールは firestore.rules の内容とFirebase Console上の公開済みルールが一致していることを確認してください。

公開する場合
1. PCまたはMacにNode.jsとFirebase CLIを用意します。
2. Firebase CLIでログインし、このプロジェクト aikatsuencore-b9ab8 を選択します。
3. このフォルダをFirebase Hostingにデプロイします。
4. 表示されたHTTPSのURLでGoogleログインをテストします。

iPhoneだけでFirebase HostingのCLIデプロイを行うのは難しいため、公開作業はPC/Macで行う方法をおすすめします。
