# Nono 桌面陪伴軟糖與 Buffer 免費版工作台升級計畫

將 Nono 改造為真正純淨的「電腦桌面待機夥伴」：平時畫面上沒有任何外露視窗或工具列，只有毛茸茸／軟糖 Nono 在桌面上待機；滑鼠可以直接抓起 Nono 在桌面上拖曳擺放（鎖定 360 度旋轉、保留視線跟隨），每次點擊 Nono 會自動切換不同待機動作與溫柔貼心的叮嚀對話，並喚出對話框、Nono 筆記本、圖片／影片上傳與雲端讀取，以及符合 Buffer 免費版規範的貼文檢查器。

## User Review & Critical Decisions

> [!IMPORTANT]
> 以下為根據妳剛剛確認的偏好所整理的關鍵設計決策，確認無誤後即可點擊 **Proceed** 開始實作：

- **Confirmed Decision 1（純淨桌面與點選喚醒機制）**：預設進入畫面時「所有對話框、頂部列、底部列與側邊欄全部隱藏」，畫面上只有 Nono 在桌面上待機。點擊 Nono 時，除了切換待機動作與隨機日常叮嚀外，會在 Nono 身旁浮現精巧的環形／膠囊快捷氣泡，讓妳按需打開「跟 Nono 對話」、「Nono 筆記本」或「Buffer 預覽設定」，也能一鍵全部收起回到純桌面。
- **Confirmed Decision 2（鎖定 360 度旋轉 ＋ 滑鼠抓取拖曳 ＋ 視線跟隨）**：移除 `OrbitControls` 的 360 度任意旋轉，改為固定正面微俯視的桌面視角；支援用滑鼠左鍵直接「抓起 Nono」在桌面平面上任意拖曳擺放位置（被抓起時會有可愛的懸空晃動反應），且 Nono 的眼睛與頭向會自然跟隨滑鼠游標移動。
- **Confirmed Decision 3（稱呼「Ave」與溫柔貼心的自然叮嚀語氣）**：比照妳提供的截圖範例，Nono 會稱呼妳為「Ave」，語氣條理清晰、直接說明重點，同時在句尾帶有自然溫暖的關心與提醒（不裝腔作勢、也不冷冰冰）。
- **Confirmed Decision 4（支援電腦上傳圖片／影片 ＋ 雲端網址讀取）**：在筆記本與 Buffer 預覽器內建媒體素材區，支援直接從電腦拖曳或選取圖片（JPG/PNG/WebP/GIF）與影片（MP4/WebM/MOV）即時播放預覽，並可貼上雲端檔案網址直接讀取。
- **Confirmed Decision 5（Buffer 免費版防呆 ＋ API / Webhook 發送測試）**：
  - 啟用 **Buffer Free Plan 防呆規則**：最多綁定並勾選 **3 個社群頻道**、每個頻道排程佇列上限 **10 篇貼文**（顯示即時額度計數如 `2 / 10 篇`），並移除免費版不支援的付費欄位（如付費版專屬 First Comment 首則留言）。
  - 提供選填的 **Buffer Access Token / Webhook URL 測試發送面板**，檢查修改完貼文與影片／圖片後，可直接一鍵複製或發送測試。

---

## 1. Overview & Core Concept

- **What It Does**：平時是一隻住在 Ave 電腦桌面上的 3D 毛茸茸／軟糖小夥伴，可隨手用滑鼠抓到桌面任何角落陪伴創作；點擊它時會變換動作、說出貼心叮嚀，並展開所需的工作視窗（自然對話、唯一作為文案資料源的 Nono 筆記本、支援圖片與影片的 Buffer 免費版預覽器）。
- **Target Audience / Persona**：獨立創作者 Ave，需要一個不佔空間、不干擾畫圖與寫程式視線的桌面陪伴者，同時能根據筆記本真實紀錄產出不誇大的貼文草稿並先預覽修改。
- **Key Value**：解決「滿畫面視窗收不起來」、「3D 角色被誤轉向」、「免費版 Buffer 功能不符」與「缺圖片／影片上傳預覽」四大痛點。

---

## 2. User Experience & Visual Design

- **Key User Flows**：
  1. **純桌面待機與抓放互動**：開啟頁面時 100% 是乾淨桌面與 Nono。滑鼠移動時 Nono 視線跟著游標走；按住 Nono 拖曳可將它放到桌面左側、右側或角落。
  2. **點擊軟糖切換動作與對話**：輕點 Nono 一下，自動切換下一個待機動作（輕柔呼吸 → 開心Q彈 → 歪頭好奇 → 伸懶腰 → 打瞌睡瞇眼），頭頂氣泡更新一句溫暖貼心的日常叮嚀，並顯示「💬 聊天 / 📓 筆記本 / 📅 Buffer 預覽 / 🎨 外觀與模型」四顆迷你按鈕（再次點擊或按關閉即可完全收合）。
  3. **Grok 自然底蘊 × 貼心秘書對話與總結**：在彈出的對話小視窗中可切換 Gemini 模型聊天，並一鍵將剛剛跟 Gemini 討論的成果客觀總結進「Nono 筆記本」。
  4. **Nono 筆記本與媒體上傳**：僅抓取筆記本內的實際進度與個人寫作風格範例生成文案；可直接從電腦上傳今日的開發影片／圖片或貼入雲端連結。
  5. **Buffer 免費版檢查與發送**：檢查 50–100 字純文案、預覽圖片或影片播放器、確認免費版 3 頻道與 10 篇佇列額度，最後一鍵複製或透過 Webhook / Buffer API 發送。
- **Visual Identity & Theme**：
  - *Aesthetic Direction*：溫潤柔和的創作者桌面氛圍（Cozy Creator Desktop），揚棄生硬冰冷的科技儀表板。
  - *Color Palette & Mood*：柔和深紫夜色桌面背景（`#12101B`）、半透明暖灰浮動視窗（`#1B1828`）、柔紫粉高光（`#C084FC` / `#F472B6`）與清晰易讀的暖白字體（`#F8FAFC`）。
  - *Typography & Hierarchy*：`Plus Jakarta Sans` 搭配 `Noto Sans TC` 呈現自然親和的對話與筆記排版；數據與字數檢核採用 `JetBrains Mono`（`tabular-nums`）。

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1：鎖定攝影機旋轉、改用 3D 平面射線投影拖曳（Ray-Plane Intersection Dragging）**
  - *Chosen Approach*：完全停用攝影機 360 度環繞旋轉，改以固定視角搭配虛擬桌面平面射線檢測，讓滑鼠拖曳直接轉化為 Nono 在桌面上的 X/Y 位移與Q彈慣性傾斜。
  - *Why*：符合桌面寵物（Desktop Mascot）直覺，不會因為誤觸滑鼠就把 Nono 轉到背面或底部穿模，同時保留 3D 視線追蹤與光影立體感。
- **Decision 2：貼文生成 100% 綁定「Nono 筆記本」＋ 雙重真實性開關**
  - *Chosen Approach*：後端文案生成端點只接收筆記本內容、風格規則與圖片／影片資訊，完全隔離一般聊天室紀錄。
  - *Why*：確保產出的貼文完全符合 Ave 實際做的事與個人文風，不會把閒聊內容混入貼文中。

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**：

```
┌───────────────────────────────────────────────────────────────────────────┐
│                   Pure Desktop Canvas (100% Viewport)                     │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │               3D Nono Companion (Fixed Front Camera)                │  │
│  │  • Ray-Plane Grab & Drag Position    • Cursor Gaze Tracking         │  │
│  │  • Click -> Cycle Idle Pose + Warm Caring Speech Bubble             │  │
│  │  • 3D Fluffy Fur / Simple Gummy / Custom .GLB Model Loader          │  │
│  └──────────────────┬──────────────────────────────────────────────────┘  │
│                     │ (Appears ONLY when Nono is clicked)                 │
│                     ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │         Floating Quick Launcher Pill (All Panels Collapsible)       │  │
│  └───┬──────────────────────────┬──────────────────────────┬───────────┘  │
│      ▼                          ▼                          ▼              │
│ ┌────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐ │
│ │ 1. Chat Popover    │  │ 2. Nono Notebook     │  │ 3. Buffer Free Plan │ │
│ │ • Warm & Clear Tone│  │ • Actual Progress Log│  │    Preview & Send   │ │
│ │ • Model Switcher   │  │ • Style Mimic Toggle │  │ • Max 3 Channels    │ │
│ │ • Summarize to     │─►│ • Strict Fact Toggle │─►│ • 10-Post Queue Cap │ │
│ │   Notebook Button  │  │ • Local Image/Video  │  │ • Video/Image Player│ │
│ └─────────┬──────────┘  │   & Cloud URL Input  │  │ • Webhook/API Test  │ │
│           │             └──────────┬───────────┘  └──────────┬──────────┘ │
└───────────┼────────────────────────┼─────────────────────────┼────────────┘
            ▼                        ▼                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     Express + Gemini Server Proxy                         │
│  • POST /api/nono/chat               (Warm, natural Ave secretary tone)   │
│  • POST /api/nono/summarize          (Factual chat -> Notebook bullet log)│
│  • POST /api/nono/generate-from-notebook (Notebook-only post generator)   │
│  • POST /api/buffer/test-send        (Webhook / Buffer API dispatch proxy)│
└───────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**：
  - **純桌面折疊狀態（`isUiExpanded: boolean` & `activeWindow: 'none' | 'chat' | 'notebook' | 'buffer' | 'appearance'`）**：初始為 `false` 與 `'none'`，畫面零雜訊；點擊 Nono 角色時循環切換 `idleAction` 與暖心台詞，並展開小選單讓使用者開啟對應浮動視窗，點擊「全部收起」即瞬間回到純桌面。
  - **滑鼠抓取與動作切換（3D Pointer Handler）**：區分「短按點擊（Click < 5px）」與「長按拖曳（Drag ≥ 5px）」：短按時自動切換下一個待機動作與隨機溫柔台詞；拖曳時沿桌面平面平滑移動 Nono 座標並附加提起晃動動畫。
  - **本機圖片／影片與雲端網址管理（Media Attachment State）**：支援 `File` 物件轉 `URL.createObjectURL`（自動辨識 `image/*` 或 `video/*` 渲染 `<img>` 或 `<video controls>`）以及貼入雲端公開網址預覽。
  - **Buffer 免費版防呆檢查（Free Plan Guard）**：頻道選擇器限制最多勾選 3 個（超過時顯示溫馨提示），佇列清單顯示 `目前已排程 X / 10 篇（Buffer 免費版上限）`，並提供 Webhook / Buffer Access Token 測試發送功能。
