# パラノイアチャット

## 概要
- パラノイアTRPGで遊ぶためのチャットツール
- PLとGMの秘匿チャットができる

## 開発
```bash
$ sudo apt install npm
$ npm init
$ sudo npm install socket.io express
$ node server.js
```

### トラブルシューティング
- ubuntu18.04を使っている場合はのnodeのバージョンを変える必要がある
- 参考:https://github.com/nodesource/distributions
```bash
$ curl -fsSL https://deb.nodesource.com/setup_12.x | sudo -E bash -
& sudo apt-get install -y nodejs
```

## 環境変数
- PARANOIS_CHAT_TOKEN

## 次のタスク
- ダイスボット入れる

## バージョン
- npm 6.14.12
- node v12.22.1