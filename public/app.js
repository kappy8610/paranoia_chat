//自分自身の情報を入れる
const IAM = {
  token: null,  // トークン
  name: document.cookie,    // 名前
  is_join: false,  // 入室中？
  room:null,         // 部屋名
  role:"PL"
};

// cookieを読み取って、名前を表示
document.querySelector("#txt-name").value = IAM.name;

//-------------------------------------
// Socket.ioサーバへ接続
//-------------------------------------
const socket = io();

// トークンを発行されたら登録
socket.on("token", (data)=>{
  IAM.token = data.token;
});

// ルーム一覧を表示
socket.on("rooms-index", (data)=>{
  const ul = document.querySelector('#rooms-index')
  data.rooms.forEach((name) => {
    ul.insertAdjacentHTML('beforeend', `
    <tr>
      <td>${name}</td>
      <form id="${name}">
        <td>
          <input type="text" id="password-${name}">
        </td>
        <td>
          <button onclick='join_room("${name}")'>入室</button>
        </td>
      </form>
    </tr>
    `)
  });
});

const add_room = () =>{
  const name = window.prompt("ルーム名を入力してください\n同じ名前の部屋が既にあると失敗します");
  if(!name.match(/\S/g)){
    window.alert("名前を入力して下さい");
  }else if(name){
    const password = window.prompt("パスワードを入力してください\n未入力の場合、パスワードが無いルームが作成されます");
    socket.emit("add-room-post",{
      room: name,
      password: password
    })
  }
}

socket.on("add-room", (data)=>{
  const ul = document.querySelector('#rooms-index')
  ul.insertAdjacentHTML('beforeend', `
  <tr>
    <td>${data.room}</td>
    <form id="${data.room}">
      <td>
        <input type="text" id="password-${data.room}">
      </td>
      <td>
        <button onclick='join_room("${data.room}")'>入室</button>
      </td>
    </form>
  </tr>
  `)
})

// ルームへ参加申請
const join_room = (name) => {
  const password = document.querySelector(`#password-${name}`).value
  // cookieの値を読み書きする要素
  const name_form = document.querySelector("#txt-name");

  // cookie書き込み
  document.cookie = name_form.value;

  IAM.name = name_form.value;

  socket.emit("join-post",{
    token:IAM.token,
    name:IAM.name,
    room:name,
    password:password
  })
}

/**
 * [イベント] 入室結果が返ってきた(本人)
 */
socket.on("join-result", (data)=>{
  // 入室成功の場合
  if(data.status){
    // 入室フラグを立てる
    IAM.is_join = true;
    IAM.room = data.room;

    // 表示を切り替える
    document.querySelector("#init").style.display = "none";   // 初期設定を非表示
    document.querySelector("#quit-button").style.display = "block";    // 「退室」を表示
    document.querySelector("#main").style.display = "block";         // メインを表示

    // ルーム名を表示
    document.querySelector("#room-name").textContent = data.room;

    // メンバー一覧を表示(自分以外)
    const ul = document.querySelector('#member-index')
    data.users.forEach((user) => {
      ul.insertAdjacentHTML('beforeend', `<li id="${user.name}-${user.token}">${user.name}</li>`)
    })
  }
  // 入室失敗の場合
  else{
    alert("入室できませんでした。\nパスワードが違います。")
  }

})

// 部屋に追加メンバーが来た
socket.on("add-member", (data)=>{
  // メンバー一覧に追加表示
  const ul = document.querySelector('#member-index')
  ul.insertAdjacentHTML('beforeend', `<li id="${data.name}-${data.token}">${data.name}</li>`)
})

// 追加PLが来たときGM側に通知
socket.on("add-PL", (data) => {
  const div = document.querySelector('.member-chats')
  console.log(data.user)
  addChatTab(div, data.user)
})

// 本人の退出処理
socket.on("quit-result", (data)=>{
  if (data.status){
    // 一覧から削除
    const members = document.querySelector('#member-index')
    while (members.firstChild) {
      members.removeChild(members.firstChild)
    }
    // チャットタブを削除
    const tabs = document.querySelector('.member-chats')
    while (tabs.children.length > 2){
      tabs.removeChild(tabs.lastChild)
    }

    // 表示を切り替える
    document.querySelector("#init").style.display = "block";   // 初期設定を表示
    document.querySelector("#quit-button").style.display = "none";    // 「退室」を非表示
    document.querySelector("#main").style.display = "none";         // メインを非表示
  }
})

// メンバーの退出処理
socket.on("quit-member", (data)=>{
  const id = `#${data.name}-${data.token}`
  document.querySelector('#member-index').removeChild(document.querySelector(id));
})

// ロールの変更
const change_role = (role) => {
  socket.emit("change-role-post",{
    role: role
  })
}

socket.on("change-role-result", (data)=>{
  // 変更に成功したら
  if(!!data.role){
    const role = `${(data.role == "GM") ? "PL" : "GM"}`
    IAM.role = data.role
    document.querySelector("#role-change").textContent = `${role}化`
    document.querySelector("#role-change").setAttribute("onclick", `change_role('${role}')`)

    // 対PLチャットを表示
    if(IAM.role == "GM"){
      const div = document.querySelector('.member-chats')
      // 過去のログの削除
      while (div.childElementCount >= 3) {
        div.removeChild(div.children[2])
      }

      data.users.forEach((user) => {
        if(user.token != IAM.token){
          addChatTab(div,user)

          // チャット送信処理を読み込む
          while(true){
            if(document.querySelector(`#chat-post-${user.token}`)){
              document.querySelector(`#chat-post-${user.token}`).addEventListener("submit", (e)=>{
                // 規定の送信処理をキャンセル(画面遷移しないなど)
                e.preventDefault()
              })
              break;
            }
          }
        }
      })
    }
  }
  // 変更し失敗したら
  else{
    alert("変更に失敗しました。\n既にGMが存在します")
  }
})

/**
 * [イベント] 退室ボタンが押された
 */
document.querySelector("#form-quit").addEventListener("submit", (e)=>{
  // 規定の送信処理をキャンセル(画面遷移しないなど)
  e.preventDefault()

  if( confirm("本当に退室しますか？") ){
    // Socket.ioサーバへ送信
    socket.emit("quit", {token: IAM.token, name: IAM.name, room: IAM.room})
  }
})

// メインチャット送信処理を読み込む
document.querySelector("#main-chat-post").addEventListener("submit", (e)=>{
  // 規定の送信処理をキャンセル(画面遷移しないなど)
  e.preventDefault()
})

// 秘匿チャット送信処理を読み込む
document.querySelector("#hiding-chat-post").addEventListener("submit", (e)=>{
  // 規定の送信処理をキャンセル(画面遷移しないなど)
  e.preventDefault()
})

// チャットを送信する
const submit_chat = (tab) => {
  const input = document.querySelector(`#${tab}-tab`).querySelector(".chat-text")
  const text = input.value
  const destination = input.parentElement.id.replace(/chat-post-/,"")
  input.value = ""
  socket.emit("chat-post", {text: text, token: IAM.token, user:IAM.name, room:IAM.room, tab: tab, destination: destination})
}

// チャットを受信する
socket.on("add-chat-text", (data)=>{
  console.log(data)
  const ul = document.querySelector(`#${data.tab}-chat`)
  ul.insertAdjacentHTML('beforeend', `<li><span>${data.user}：</span>${data.text}</li>`)
})

const addChatTab = (tabs,user) => {
  tabs.insertAdjacentHTML('beforeend', `
  <div id="${user.name}-tab">
    <h3>${user.name}タブ</h3>
    <div class="chat-tab">
      <ul id="${user.name}-chat">
      </ul>
      <form class="form-chat" id='chat-post-${user.token}'>
        <input type="text" class="chat-text">
        <button onclick="submit_chat('${user.name}')">送信</button>
      </form>
    </div>
  </div>
`)
}