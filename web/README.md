# HarmonyVoice 網站（測試版）

撳一條連結就可以入房傾偈：每人用自己部機嘅咪講，AI 即時翻譯成對方嘅語言並讀出嚟，傾完可以將對話種入論點樹。

- 第一個入房嘅人做 **A**，第二個做 **B**，之後入嚟嘅係**觀眾**（可以揀自己聽嘅語言）。
- 房入面得你一個嗰陣，可以撳「A 講／B 講」自己輪流扮兩個人嚟測試。
- 支援廣東話同全球十大語言：英語、普通話、印地語、西班牙語、阿拉伯語、法語、孟加拉語、葡萄牙語、印尼語、烏爾都語。
- 瀏覽器：Chrome、Edge、Safari（電腦或手機）。Firefox 冇語音辨識，要打字。

## 架構

| 檔案 | 做咩 |
| --- | --- |
| `public/index.html` | 網站畫面（公仔、撳 Space 講嘢、翻譯、論點樹） |
| `src/worker.js` | Cloudflare Worker：`/api/translate` 翻譯；`/api/room/<房號>` 對話房（Durable Object，存對話同論點樹） |
| `wrangler.jsonc` | Cloudflare 設定 |

Gemini key 只放喺伺服器（secret `GEMINI_API_KEY`），用家唔使有任何 key。

## 部署（Cloudflare 免費版）

1. **攞 Gemini key**：去 Google AI Studio，撳「Get API key」開一個 key，複製低。
2. **開 Cloudflare 帳戶**：去 dash.cloudflare.com 免費註冊。
3. **連 GitHub 部署**：Cloudflare 控制台 → Workers & Pages → Create → 揀從 Git repository 匯入 → 連接 GitHub → 揀 `speech-translation-backend`。
   - 分支（branch）：`harmonyvoice-web`
   - 根目錄（root directory）：`web`
   - 部署指令保留預設 `npx wrangler deploy`
4. **加 key**：部署完之後，入呢個 Worker → Settings → Variables and Secrets → 新增 **Secret**，名叫 `GEMINI_API_KEY`，值貼你嘅 Gemini key → 儲存並重新部署。
5. **打開網站**：網址大概係 `https://harmonyvoice.<你嘅子網域>.workers.dev`。打開後撳「複製邀請連結」傳俾朋友就得。

Cloudflare 控制台嘅按鈕名稱間中會改，搵唔到嘅話用指令都得（要先裝 Node.js）：

```
cd web
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

## 本機測試

```
cd web
npm install
echo "GEMINI_API_KEY=你的key" > .dev.vars
npm run dev
```

然後喺 Chrome 開 `http://localhost:8787`。

## 要知嘅限制

- **Gemini 免費版每分鐘次數有限**；人多嘅時候會出「用得太密」提示。
- **Gemini 免費版嘅內容會用嚟改善 Google 產品**，暫時只適合朋友之間測試；公開俾陌生人用之前要轉付費版。
- Cloudflare 免費版每日 10 萬次請求。
- 讀出聲用嘅係裝置內置嘅聲音；部分裝置冇孟加拉語或烏爾都語嘅聲音，嗰陣只會顯示字幕。
- 任何人有房間連結就入得到，暫時冇登入同舉報功能。
