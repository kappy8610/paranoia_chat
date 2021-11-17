const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const crypto = require("crypto");
const { emit } = require("process");
const PORT = process.env.PORT || 5000

// HTMLやJSなどを配置するディレクトリ
const DOCUMENT_ROOT = __dirname + "/public";

// トークンを作成する際の秘密鍵
const SECRET_TOKEN = process.env.PARANOIS_CHAT_TOKEN

// ルーム一覧
const ROOMS = {};
// トークン一覧
const TOKENS = {};
// こんな感じの部屋を作る
// ROOMS["お部屋"] = {password: "パスワード", users: [{name: "名前", token: "トークン", role: "GM"}]};
ROOMS["roomA"] = { password: "", users: [] };
ROOMS["roomB"] = { password: "pass", users: [] };

// "/"にアクセスがあったらindex.htmlを返却
app.get("/", (req, res) => {
  res.sendFile(DOCUMENT_ROOT + "/index.html");
});
app.get("/:file", (req, res) => {
  res.sendFile(DOCUMENT_ROOT + "/" + req.params.file);
});

/**
 * [イベント] ユーザーが接続
 */
io.on("connection", (socket) => {
  // トークンを作成
  const token = makeToken(socket.id);
  TOKENS[token] = socket.id
  // 本人にトークンを送付
  io.to(socket.id).emit("token", { token: token });

  // ルーム一覧を送信
  io.to(socket.id).emit("rooms-index", { rooms: getRoomNames() });

  /**
   * [イベント]ルーム追加
   */
  socket.on("add-room-post", (data) => {
    // 既に同じ名前の部屋が無ければ作成
    if(!getRoomNames().includes(data.room)){
      ROOMS[data.room] = { password: data.password, users: [] };
      socket.broadcast.emit("add-room", {room: data.room})
    }
  })

  /**
   * [イベント] 入室する
   */
  socket.on("join-post", (data) => {
    console.log(data.password == ROOMS[data.room].password)
    // パスワードがない、もしくは正しければ入室
    if(data.password == ROOMS[data.room].password){
      console.log("入室成功")
      // 入室
      io.to(data.room).emit("add-member", {
        name: data.name,
        token:data.token
      });
      socket.join(data.room);
      ROOMS[data.room].users.push({
        name: data.name,
        token: data.token,
        role: "PL"
      });
      io.to(socket.id).emit("join-result", {
        status: true,
        room: data.room,
        users: getUsers(ROOMS[data.room]),
      });
      io.to(TOKENS[serachGM(data.room).token]).emit("add-PL",{
        user: data
      });
      console.log(`${data.room}に入室${data.name}がしました`);
      console.log(`ユーザー一覧:${getUserNames(ROOMS[data.room])}`);
    }else{
      io.to(socket.id).emit("join-result", {status: false});
    }
  });

  /**
   * [イベント]退出する
   */
  socket.on("quit", (data) => {
    // トークンが正しければ
    if (authToken(socket.id, data.token)) {
      // ルームから削除
      deleteUser(token);
      socket.leave(data.room)
      // 本人を退出させる(表示切替)
      io.to(socket.id).emit("quit-result", {status: true});
      // ルームメンバー一覧から削除
      io.to(data.room).emit("quit-member", {token: data.token,name: data.name});
    } else {
      // 退出失敗の通知
      io.to(socket.id).emit("quit-result", { status: false });
    }
  })

  // 切断されたときユーザーを削除する
  socket.on("disconnect", ()=>{
    // まだ、ユーザー情報が残っていたら削除する
    const user = searchUser(socket.id)
    if (!!user){
      // ルームメンバー一覧から削除
      io.to(user.room).emit("quit-member", {token:user.token, name:user.name});

      // ユーザーを削除する
      deleteUser(makeToken(socket.id))
      socket.leave(user.room)
    }
  })

  // ロールの変更
  socket.on("change-role-post", (data)=>{
    user = searchUser(socket.id)
    // PLがGMになりたいとき、既にGMがいたら弾く
    if (!ROOMS[user.room].users.map(value => value.role).includes("GM") || data.role == "PL"){
      ROOMS[user.room].users.find(value => value.token == makeToken(socket.id)).role = data.role
      console.log(ROOMS[user.room])
      // 本人に結果通知
      io.to(socket.id).emit("change-role-result", {role: data.role, users: getUsers(ROOMS[user.room])})
    } else {
      // 本人に失敗の通知
      io.to(socket.id).emit("change-role-result", {role: false})
    }
  })

  // チャットの送信
  socket.on("chat-post", (data)=>{
    // トークンが正しければ
    if (authToken(socket.id, data.token)) {
      console.log(data)
      // 全体なら
      if(data.tab == "main"){
        io.to(data.room).emit("add-chat-text", {user:data.user, text:data.text, tab: data.tab})
      }
      // PLからの秘匿なら
      else if (data.tab == "hiding"){
        io.to(TOKENS[serachGM(data.room).token]).emit("add-chat-text", {user:data.user, text:data.text, tab: data.user})
        io.to(socket.id).emit("add-chat-text", {user:data.user, text:data.text, tab: "hiding"})
      }
      // GMからの秘匿なら
      else{
        io.to(TOKENS[data.destination]).emit("add-chat-text", {user:data.user, text:data.text, tab: "hiding"})
        io.to(socket.id).emit("add-chat-text", {user:data.user, text:data.text, tab: data.tab})
      }
    }
  })
})


/**
 * 3000番でサーバを起動する
 */
http.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});

// トークンを作成する
const makeToken = (id) => {
  const str = SECRET_TOKEN + id;
  return crypto.createHash("sha1").update(str).digest("hex");
};

// ユーザーが正しいかトークンから認証する
const authToken = (socketId, token) => {
  for (const room of Object.entries(ROOMS)) {
    for (const user of room[1].users) {
      if (user.token == token && user.token == makeToken(socketId)) {
        return true;
      }
    }
  }
  return false;
};

// ルームの名前一覧を取得
const getRoomNames = () => {
  const list = [];
  for (let name in ROOMS) {
    list.push(name);
  }
  return list;
};

// 各ルームのユーザーの名前一覧を取得
const getUserNames = (ROOM) => {
  const list = [];
  for (const user of ROOM.users) {
    list.push(user.name);
  }
  return list;
};

// 各ルームのユーザーの名前一覧を取得
const getUsers = (ROOM) => {
  const list = [];
  for (const user of ROOM.users) {
    list.push({name: user.name, token: user.token, role: user.role});
  }
  return list;
};

// トークンからユーザーを検索して削除
const deleteUser = (token) => {
  for (const room of Object.entries(ROOMS)) {
    let count = 0;
    for (const user of room[1].users) {
      if (user.token == token) {
        ROOMS[room[0]].users.splice(count, 1);
      }
      count++;
    }
  }
};

// トークンからユーザーを検索
const searchUser = (token) => {
  for (const room in ROOMS){
    for (const user of getUsers(ROOMS[room])){
      if(user.token == makeToken(token)){
        return {name: user.name, token: user.token,role: user.role, room:room}
      }
    }
  }
  return false
}

// ルームからGMを検索
const serachGM = (room) => {
  for (const user of getUsers(ROOMS[room])){
    if(user.role == "GM"){
      return user
    }
  }
  return false
}

