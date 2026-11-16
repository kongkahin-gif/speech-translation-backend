# HarmonyVoice 網站（測試版）

撳一條連結就可以入嚟：每人用自己部機嘅咪講自己嘅語言，AI 即時翻譯成對方嘅語言並讀出嚟，傾完可以將對話種入論點樹。

## 有咩功能

- **開場同載入畫面**：每次都會見到一句關於和平同聆聽嘅說話，嚟自唔同宗教、哲學同文化（共 31 句，附出處）。
- **整角色**：第一次入嚟揀你嚟自邊度（31 個地方，或者「世界公民」），會得到一隻代表動物同一套傳統服裝。論點樹上面永遠唔會顯示呢項。
- **衣櫃同解鎖**：同其他文化嘅人傾滿 3 句，就會收到對方文化嘅服裝；另外有 4 套靠傾偈次數解鎖。
- **揀興趣同推薦**：整角色時揀你想傾嘅題目類別。大堂嘅房同題目按「等緊對手、語言或文化同你唔同、你嘅興趣、未試過嘅類別、好友喺度、搭橋分」排序，並寫明原因。唔計人氣同激烈程度。
- **今日熱話**：伺服器每日由維基百科「新聞動態」攞當日大事，交 AI 寫成每類一條中性問題。有人等緊同一題就直接帶你入去。
- **對話總結同搭橋**：撳「總結今場對話」，AI 用各人自己嘅語言列出「我哋同意」同「仍然睇法唔同」。之後可以送個讚俾對方，再剔「我聽明咗對方」同「我學到新嘢」；雙方都剔同一項先算搭到橋，條題目會被推薦多啲。
- **返嚟嘅理由**：大堂顯示「你去過嘅樹」，有新生長會標示；角色頁顯示你嘅貢獻。
- **大堂**：見到幾多人在線、邊啲房開緊、邊間等緊對手；可以按題目類別篩選、隨機配對、旁聽，或者自己開房（可以揀公開或者只限連結）。
- **對話房**：第一個人做 **A**，第二個做 **B**，之後係**觀眾**（聽自己嘅語言）。撳住 Space 講、放手送出；或者撳一下開始、再撳一下送出。錄音時只顯示雲同「...」動畫。
- **主題背景**：背景跟題目轉（AI、教育、環境、城市、家庭、健康、經濟、飲食、文化、科學、運動、社會）。自訂題目由 AI 分類。
- **即時反應**：任何人（包括觀眾）都可以送 👍 ❤️ 👏 🤔 🙏 🌱。
- **Google 登入同好友**（可選）：登入後角色同服裝會跟住帳戶，可以加好友、睇好友喺邊間房。唔登入都可以照玩。
- 支援廣東話同全球十大語言：英語、普通話、印地語、西班牙語、阿拉伯語、法語、孟加拉語、葡萄牙語、印尼語、烏爾都語。
- 瀏覽器：Chrome、Edge、Safari（電腦或手機）。Firefox 冇語音辨識，要打字。

## 架構

| 檔案 | 做咩 |
| --- | --- |
| `public/index.html` | 畫面同樣式 |
| `public/js/app.js` | 網站邏輯（角色、大堂、對話、撳掣講嘢、論點樹、登入、好友） |
| `public/js/data.js` | 內容：語言、文化同動物、服裝、題目、名言 |
| `public/js/avatar.js`、`public/js/scenes.js` | 畫公仔同主題背景 |
| `src/worker.js` | Cloudflare Worker：翻譯、對話房、大堂、帳戶（三種 Durable Object） |
| `wrangler.jsonc` | Cloudflare 設定 |

Gemini key 只放喺伺服器，用家唔使有任何 key。

## 部署（Cloudflare 免費版）

1. **攞 Gemini key**：去 Google AI Studio，撳「Get API key」開一個 key，複製低。
2. **開 Cloudflare 帳戶**：去 dash.cloudflare.com 免費註冊。
3. **連 GitHub 部署**：Cloudflare 控制台 → Workers & Pages → Create → 揀從 Git repository 匯入 → 連接 GitHub → 揀 `speech-translation-backend`。
   - 分支（branch）：`harmonyvoice-web`
   - 根目錄（root directory）：`web`
   - 部署指令保留預設 `npx wrangler deploy`
4. **加 key**：部署完之後，入呢個 Worker → Settings → Variables and Secrets → 新增 **Secret**，名叫 `GEMINI_API_KEY`，值貼你嘅 Gemini key → 儲存並重新部署。
5. **打開網站**：網址大概係 `https://harmonyvoice.<你嘅子網域>.workers.dev`。

Cloudflare 控制台嘅按鈕名稱間中會改，搵唔到嘅話用指令都得（要先裝 Node.js）：

```
cd web
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

### 開啟 Google 登入（可選）

未做呢步之前，網站一樣用得，只係冇登入同好友功能。

1. 去 Google Cloud Console（console.cloud.google.com）開一個 project。
2. 入「APIs & Services」→「OAuth consent screen」，填 app 名同你嘅電郵，揀 External。
3. 入「Credentials」→「Create credentials」→「OAuth client ID」→ 類型揀 **Web application**。
4. 喺「Authorized JavaScript origins」加你個網站網址（例如 `https://harmonyvoice.<你嘅子網域>.workers.dev`，唔好加尾嘅斜線）。
5. 複製個 **Client ID**（`xxxx.apps.googleusercontent.com`）。
6. 返 Cloudflare，同 Gemini key 一樣加多一個 **Secret**，名叫 `GOOGLE_CLIENT_ID`，值貼個 Client ID，然後重新部署。

網站只會用 Google 帳戶嘅編號計出一個好友碼，唔會儲存電郵地址。

## 本機測試

```
cd web
npm install
echo "GEMINI_API_KEY=你的key" > .dev.vars
npm run dev
```

然後喺 Chrome 開 `http://localhost:8787`。

## 要知嘅限制

- **Gemini 免費版每分鐘次數有限**；人多嘅時候會出「用得太密」提示。主模型忙或者超額時，翻譯會自動改用較輕嘅模型頂住。
- **Gemini 免費版嘅內容會用嚟改善 Google 產品**，暫時只適合朋友之間測試；公開俾陌生人用之前要轉付費版。
- Cloudflare 免費版每日 10 萬次請求。
- 讀出聲用嘅係裝置內置嘅聲音；部分裝置冇孟加拉語或烏爾都語嘅聲音，嗰陣只會顯示字幕。
- 介面文字暫時只有廣東話（對話總結內容會用各人自己嘅語言）。
- 今日熱話每日用多一次 Gemini；攞唔到新聞或者 AI 失敗，當日就唔顯示。熱話由 AI 寫，措辭未必次次理想。
- 「你去過嘅樹」記喺瀏覽器，換裝置唔會跟住。
- 服裝解鎖進度由瀏覽器記錄再同步去帳戶，暫時冇防作弊。
- 公開房任何人都入得；暫時未有舉報同封鎖功能。
