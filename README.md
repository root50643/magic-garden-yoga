# 魔法花園瑜珈闖關

面向國小學童的繁體中文網頁體感遊戲。玩家在攝影機前模仿引導卡上的瑜珈姿勢；姿勢分數達到該關門檻並連續保持指定時間後，即可進入下一關。完成全部關卡後，可把成績寫入這台瀏覽器的本機排行榜。

攝影機影像、MediaPipe 身體／手部／臉部追蹤結果與姿勢分數只在目前的瀏覽器分頁內處理：不錄影、不上傳、不需要帳號，也沒有後端服務。

本專案是獨立的 Vite + React + TypeScript 應用程式。姿勢追蹤與 VRM 互動概念參考 [SystemAnimatorOnline / XR Animator](https://github.com/ButzYung/SystemAnimatorOnline)，沒有複製其介面、美術、音效或原始碼。

## 目前功能

- MediaPipe Pose Landmarker 在 Web Worker 中執行，最多辨識兩人並阻止多人狀態累積進度。
- 額外的 MediaPipe Hand／Face Landmarker 在獨立 Worker 中帶動 VRM 手指、眨眼與嘴型；這些資料只供人物顯示，完全不參與瑜珈分數或保持計時。
- `@pixiv/three-vrm` 載入 VRM，準備畫面會即時帶動人物的軀幹、手臂、腿、腳掌、手指與模型已提供的表情。
- 內建山式、樹式、戰士二式、椅子式、星星式；關卡數量由 `game.json` 決定。
- 每關可以獨立設定通過分數與保持秒數；未設定時使用全域預設值。
- 3D 關節角度、相對位置、距離比例、左右鏡像、EMA 平滑與 500 ms 追蹤寬限。
- 倒數、有效時間計時、進度光環、提示、跳過、音效、粒子與轉場動畫。
- 本機前十名排行榜；同名只保留最快成績，跳過任何一關則該局不列入排行榜。
- 攝影機拒絕、模型載入失敗、多人、全身未入鏡與關鍵點遮擋提示。
- 高／低畫質、靜音與作業系統「減少動態效果」支援。

## 快速開始

需要 Node.js 20.19 以上版本（建議使用目前維護中的 Node.js LTS）與 pnpm 11。

```bash
pnpm install
pnpm dev
```

在開發電腦開啟 <http://localhost:5173/>。Vite 已設定監聽 `0.0.0.0`，同一區域網路的其他電腦可使用開發機的 IPv4 位址連線，例如 `http://192.168.1.20:5173/`。遠端電腦的攝影機通常仍需要 HTTPS 或受控瀏覽器測試設定，詳見[建置與執行](docs/BUILD.md#區域網路測試與-https)。

修改程式後的基本檢查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

預覽正式建置：

```bash
pnpm preview
```

預覽伺服器監聽 `0.0.0.0:4173`。`vite preview` 只用來驗收建置結果，不應當作正式對外伺服器。

## 文件

| 文件 | 內容 |
| --- | --- |
| [文件索引](docs/README.md) | 依工作情境選擇文件 |
| [建置與執行](docs/BUILD.md) | Windows、Node.js、pnpm、`0.0.0.0`、LAN、HTTPS、正式建置與部署 |
| [GitHub Pages 部署](docs/GITHUB_PAGES.md) | 公開網址、Actions 自動部署、子路徑、攝影機權限與發布檢查 |
| [開發指南](docs/DEVELOPMENT.md) | 架構、身體／手／臉資料流、狀態機、測試、`poseDebug` 與 `avatarDebug` |
| [設定檔手冊](docs/CONFIGURATION.md) | `game.json` 完整欄位、每關門檻、顯示追蹤、評分規則、換圖／模型與新增關卡 |
| [維護手冊](docs/MAINTENANCE.md) | 依賴與模型更新、姿勢校準、排行榜、隱私、手／臉排錯與發行檢查表 |
| [第三方授權](THIRD_PARTY_NOTICES.md) | 套件、參考專案、原創 VRM 與美術素材說明 |

## 最常修改的設定

所有遊戲參數集中在 [`public/config/game.json`](public/config/game.json)。例如：

```json
{
  "challengeId": "magic-garden-yoga-dev",
  "avatar": {
    "modelPath": "/models/magic-garden-guide.vrm",
    "scale": 1,
    "cameraDistance": 2.8,
    "mirrored": true
  },
  "timing": {
    "defaultHoldSeconds": 3,
    "trackingGraceMs": 500
  },
  "poseDetection": {
    "scoreThreshold": 75
  },
  "avatarTracking": {
    "enabled": true,
    "maxInferenceFps": 10,
    "lowQualityMaxInferenceFps": 6,
    "initializationTimeoutMs": 120000,
    "smoothing": 0.38,
    "lostHoldMs": 250,
    "relaxMs": 300,
    "hands": {
      "enabled": true,
      "modelPath": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      "roiScale": 1.6,
      "handednessSwap": false
    },
    "face": {
      "enabled": true,
      "modelPath": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    }
  },
  "poses": [
    {
      "id": "mountain",
      "scoreThreshold": 75,
      "holdSeconds": 3
    }
  ]
}
```

上例只摘錄相關欄位，不能直接取代完整設定檔。

- `poses[].scoreThreshold` 是該關專用門檻，範圍為 0–100。
- 省略 `poses[].scoreThreshold` 時，才使用 `poseDetection.scoreThreshold`。
- `poses[].holdSeconds` 會覆蓋 `timing.defaultHoldSeconds`。
- `avatar.mirrored` 只水平翻轉 VRM 畫面，不交換骨骼或改變評分。
- `avatarTracking` 是選用的顯示同步功能；可整體關閉，或只關閉 `hands`／`face`。載入或推論失敗只會顯示提醒，不會阻止身體姿勢闖關。
- 公開版預設從 Google 的固定版網址下載 Hand／Face 模型，以避開 GitHub Pages 大檔速度限制；只有靜態模型被下載，攝影機影像與 landmark 不會送出瀏覽器。校內或離線環境可把兩個 `modelPath` 改回 `/models/hand_landmarker.task` 與 `/models/face_landmarker.task`。
- `poses[].allowMirrored` 才決定評分器是否接受左右相反的做法。
- `challengeId` 是本機排行榜的儲存分區。目前開發版沿用 `magic-garden-yoga-dev`；啟動時只保留目前 ID 的榜單，並刪除同遊戲前綴的其他舊榜單。要重置目前榜單時直接刪除對應 Local Storage，不需要為每次調整建立新 ID。

校正姿勢時使用：

```text
http://localhost:5173/?poseDebug=1
```

畫面會顯示本關通過門檻與每條規則的即時分數。如何判讀分數與調整容錯值，請見[設定檔手冊](docs/CONFIGURATION.md#姿勢校正與-posedebug)。

只驗收 VRM 手指與表情、但不依賴真人手／臉追蹤資料時，可開啟：

```text
http://localhost:5173/?avatarDebug=1
```

此模式會合成循環的彎指、眨眼、張嘴與微笑資料；它不會改變 Pose Landmarker、分數或排行榜。正式真人驗收仍須關閉此參數，實際測試雙手、臉部光線及追蹤效能。

## 支援範圍

- 桌面版最新版 Chrome 與 Edge。
- 單一玩家、全身清楚入鏡、鏡頭距離約兩公尺。
- 手指同步需要雙手在畫面內、手指輪廓清楚；臉部同步需要正面或接近正面的臉與足夠光線。
- VRM 缺少標準手指骨或對應表情預設時，只會略過該動畫，身體動作與闖關仍可使用。
- 以 `localhost` 或 HTTPS 執行；請勿直接雙擊 `index.html`。
- 這是活動遊戲，不是醫療、復健、運動處方或安全診斷工具。

## 3D 引導模型

`public/models/magic-garden-guide.vrm` 是魔法花園的 3D 引導角色，作者為 NHRI。模型會隨公開 GitHub 專案及 GitHub Pages 網站一併發布。

預計公開網站為
<https://root50643.github.io/magic-garden-yoga/>。部署前請依照
[GitHub Pages 部署手冊](docs/GITHUB_PAGES.md) 完成 Actions、Pages 與攝影機驗收；在工作流程實際執行成功前，該網址不代表已上線。
