# 維護手冊

本文件提供日常維護、依賴更新、姿勢校準、排行榜資料、故障排除、安全隱私、3D 模型與發布檢查。建置命令見 [BUILD.md](BUILD.md)，設定欄位見 [CONFIGURATION.md](CONFIGURATION.md)。

## 日常維護節奏

每次修改前：

```bash
git status
git remote -v
pnpm install --frozen-lockfile
```

- 先確認工作樹中哪些變更屬於自己，不要覆蓋其他人的未提交檔案。
- `origin` 應指向團隊自己的 GitHub 儲存庫。
- SystemAnimatorOnline 只是設計與行為參考，不是本專案的推送目標。若有人把它加成唯讀 `upstream` 可用於查看來源，但不要把本專案 push 到該儲存庫。
- 正常建置應使用鎖定檔。只有有意更新依賴時才讓 `pnpm install` 修改 `pnpm-lock.yaml`。

每次修改後：

```bash
pnpm typecheck
pnpm test
pnpm build
```

接著用 `pnpm preview` 做真人攝影機驗收。純 Node 測試不會執行 WebGL、攝影機、WASM 或瀏覽器權限。

## 依賴與模型更新

### 一般原則

查看可更新套件：

```bash
pnpm outdated
```

安全稽核需要連線到套件 registry：

```bash
pnpm audit
```

更新時：

1. 一次更新一個相關套件群組，不要同時大幅升級 MediaPipe、React、Vite、Three.js 與 TypeScript。
2. 閱讀目標版本的 release notes／migration guide。
3. 更新 `package.json` 與 `pnpm-lock.yaml`。
4. 執行型別、測試與建置。
5. 清除瀏覽器快取，以 Chrome、Edge 分別測試。
6. 驗證正式 `dist/`，不是只測 Vite HMR。
7. 更新 `THIRD_PARTY_NOTICES.md` 與文件中的版本需求。

不要手動編輯 `pnpm-lock.yaml`。

### 更新 MediaPipe

MediaPipe 是最需要成套更新的部分。目前 JavaScript 套件、本機 WASM loader／binary 與 `.task` 模型共同工作：

```text
package.json: @mediapipe/tasks-vision
public/mediapipe/wasm/*
public/models/pose_landmarker_full.task
public/models/hand_landmarker.task
public/models/face_landmarker.task
src/workers/pose.worker.ts
src/workers/avatar.worker.ts
```

安全更新流程：

1. 更新 `@mediapipe/tasks-vision`。
2. 從同一個已安裝版本複製完整 WASM 目錄，不要只換 `.wasm` 或單一 loader。

PowerShell：

```powershell
Copy-Item -Path "node_modules/@mediapipe/tasks-vision/wasm/*" -Destination "public/mediapipe/wasm" -Force
```

POSIX shell：

```bash
cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/
```

3. 確認目錄至少同時具有 module、SIMD 與 no-SIMD 的 JS／WASM 配對。
4. 保留 Worker 中的 module-aware 初始化：

```ts
FilesetResolver.forVisionTasks(config.wasmPath, true)
```

5. 若更換 `.task` 模型，記錄來源、版本與雜湊；不要假設任意 task 與任意 Tasks Vision 版本相容。
6. 執行完整自動測試與瀏覽器測試。
7. 在支援 SIMD 與不支援 SIMD 的目標裝置上至少各測一次；若沒有舊裝置，仍須確認 no-SIMD 檔案可被部署。
8. 檢查 Network 面板中 loader、WASM、task 都是 200，且沒有從未知 CDN 載入。

目前顯示追蹤模型的可重現基準：

| 檔案 | 固定版官方來源 | 位元組 | SHA-256 |
| --- | --- | ---: | --- |
| `hand_landmarker.task` | [Hand Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task) | 7,819,105 | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `face_landmarker.task` | [Face Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) | 3,758,596 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |

下載後在 PowerShell 驗證：

```powershell
Get-FileHash -Algorithm SHA256 public/models/hand_landmarker.task
Get-FileHash -Algorithm SHA256 public/models/face_landmarker.task
```

不要在建置或瀏覽器執行階段改用 `latest` URL；把固定版檔案納入版本控制，才能讓 Pages、離線校內環境與日後回溯使用同一內容。

Pose 模型輸出的關鍵點順序或 world coordinate 行為如果改變，既有姿勢校準值可能全部需要重測。Hand／Face 模型只影響 VRM 顯示；更新後要重測手指與表情，但不應為此修改瑜珈 constraint 或分數門檻。若分數跟著手／臉模型改變，代表 display-only 邊界發生回歸。

### 更新 Three.js 與 `@pixiv/three-vrm`

這兩個套件應視為同一組更新：

1. 確認目標 `@pixiv/three-vrm` 支援所選 Three.js 版本。
2. 建置後載入至少一個 VRM 1.0 模型；如仍支援舊素材，也測 VRM 0.x。
3. 檢查 Humanoid normalized bone API、`VRMUtils.rotateVRM0`、材質、陰影、模型 bounds 與 dispose 行為。
4. 以不對稱動作驗證左右：只舉左手、只彎右膝、單腳點地。
5. 使用 `?avatarDebug=1` 檢查左右手腕完整掌面旋轉、四指張合、拇指三節、五指骨、眨眼、張嘴 `aa` 與 `happy` preset；再用真人逐側完成正反向 180° 翻掌、張手、握拳、勝利手勢、拇指食指輕觸及其他嘴型驗證。
6. 切換 `avatar.mirrored`，確認只翻畫面、不讓骨骼跨過軀幹；它也不應改變 `handednessSwap`。
7. 檢查 GPU／記憶體：重整或重新進入時不應持續增加 WebGL context。

### 更新 React、Vite 或 TypeScript

- Vite 更新後確認 `new Worker(new URL(...), { type: "module" })` 的正式輸出。
- 確認 `server.host` 與 `preview.host` 仍為 `0.0.0.0`。
- React 更新後檢查 effect cleanup，避免重複開啟攝影機或 Worker。
- TypeScript 更新後不要用寬鬆 assertion 隱藏新錯誤。
- 建置後確認 `dist/` 仍完整複製 `public/` 大型資產。

## 姿勢規則維護與校準

每次換引導圖片、MediaPipe task、平滑參數、門檻、constraint 或攝影機取景，都應視為校準變更。

### 建議測試矩陣

至少涵蓋：

- 3–5 位不同身高、手腳比例與衣著的測試者。
- Chrome 與 Edge。
- 明亮、一般與稍暗但可接受的室內光線。
- 近、標準約兩公尺、稍遠三種距離。
- 正確姿勢、常見小錯誤、明顯錯誤。
- 左右版本（`allowMirrored: true` 時）。
- 前向、三分之四與側向姿勢。
- 短暫遮擋少於 500 ms、長遮擋超過 500 ms。
- 第二人經過鏡頭。

使用：

```text
http://localhost:5173/?poseDebug=1
```

記錄每位測試者：

| 欄位 | 用途 |
| --- | --- |
| pose id | 找到設定 |
| 總分 | 決定每關 `scoreThreshold` |
| 每條 constraint 分數 | 找出目標或容錯錯誤 |
| visibility／是否出框 | 分清評分與追蹤問題 |
| 距離、視角、光線 | 重現環境 |
| 正確／錯誤姿勢 | 避免只提高召回率而失去辨別力 |

調整順序：

1. 引導圖、文字與規則一致性。
2. landmark 名稱與左右。
3. `target`。
4. `tolerance`。
5. `weight`。
6. `minimumVisibility`。
7. 最後才是該關 `scoreThreshold`。

每次只改少量值，保留前後測試資料。若改一個姿勢，仍應快速跑過其他關，避免共用追蹤或平滑變更造成回歸。

### 何時新增自動測試

- 修正過的錯誤應建立最小合成骨架回歸測試。
- 新增 constraint 類型時，測滿分、tolerance 邊界、兩倍 tolerance、缺少關鍵點、鏡像與錯誤數值。
- 更改總分公式時，測不同 weight。
- 更改門檻解析時，測姿勢個別值與全域 fallback。
- 調整正式姿勢時，可像 `poseCalibration.integration.test.ts` 建立接近引導圖的合成骨架。

合成測試可防回歸，但不能取代真人校準。

## 排行榜與 `challengeId`

### 儲存方式

排行榜 key：

```text
magic-garden-yoga:leaderboard:<URL-encoded challengeId>
```

例如開發版：

```text
magic-garden-yoga:leaderboard:magic-garden-yoga-dev
```

資料包含暱稱、毫秒成績、challenge ID、完成 ISO 時間與隨機 entry ID。每個瀏覽器 profile、origin 與裝置各自獨立：

- `http://localhost:5173`
- `http://192.168.1.20:5173`
- `https://正式網域`

以上是三個不同 Local Storage，不會同步。

### 開發期策略

目前 `challengeId` 固定使用：

```json
"challengeId": "magic-garden-yoga-dev"
```

遊戲載入設定後會以 best-effort 清除所有同前綴但不屬於目前 challenge 的舊榜單，只保留目前 challenge。清理範圍嚴格限制在：

```text
magic-garden-yoga:leaderboard:
```

靜音設定 `magic-garden-yoga:muted` 與其他網站 Local Storage 不會被刪除。這項策略符合目前「仍在開發、不維護歷史榜單」的需求，也表示不要把 `challengeId` 當成保存多個活動榜單的機制；若未來真的要同時保留多個 challenge，必須先修改清理策略與測試。

要清除目前開發榜單，可在瀏覽器 DevTools Console 執行：

```js
localStorage.removeItem(
  "magic-garden-yoga:leaderboard:" +
    encodeURIComponent("magic-garden-yoga-dev"),
);
location.reload();
```

也可在 DevTools 的 Application／Storage 面板只刪除該 key。不要使用 `localStorage.clear()`，因為它會刪除同 origin 的其他設定。

### 正式發布策略

第一次正式公開前，把 ID 一次改成穩定值，例如：

```json
"challengeId": "magic-garden-yoga-v1"
```

並把正式 ID 納入 release notes。若未來評分規則、姿勢順序或計時公平性有重大不相容變更，可改成 `v2`；目前清理策略會刪掉非 active 的舊榜單。若只是文字、圖片細修或 bug fix，通常沿用同一正式 ID。

排行榜是活動便利功能，不是防作弊、稽核或永久紀錄：

- 使用者可在 DevTools 修改 Local Storage。
- 清除網站資料、換 origin、隱私模式結束或瀏覽器政策都可能移除成績。
- 沒有跨電腦同步、備份或復原。
- 不應用於正式競賽、個資紀錄或學習成效評量。

## 安全、隱私與授權

### 攝影機與個資

目前設計：

- `getUserMedia` 只要求 video，明確設定 `audio: false`。
- 每幀轉成 `ImageBitmap` 後在本機 Pose／Avatar Worker 處理。
- Worker 只回傳身體／手部關鍵點、供 overlay 使用的 normalized 臉部 landmarks、臉部 blendshape 係數與推論時間；不回傳影像或頭部 transformation matrix。
- 不錄影、不截圖、不上傳影像、不呼叫辨識後端。
- 暱稱與成績只寫入本機 Local Storage。

維護時不可在未經明確產品、隱私與家長／學校審查的情況下加入：

- 影像上傳、遠端記錄、分析 SDK 或第三方追蹤碼。
- 含兒童影像的 debug log、截圖或錯誤回報附件。
- 可識別學生身分的暱稱要求。

正式部署必須使用 HTTPS。Web 伺服器可設定適當的 Permissions Policy，例如只允許同源攝影機；若放在 iframe，父頁與 iframe 的 camera policy 都需正確。任何 Content Security Policy 都要實測 Worker 與 WASM；不要直接複製一份會阻擋 module worker 或 WebAssembly 的設定。

`game.json` 與前端 bundle 完全公開，不可放 API key、密碼或私人網址。此專案目前不需要 `.env`；`.env*` 已忽略，但仍不應把秘密打包到 `VITE_` 前綴變數，因為那會暴露給瀏覽器。

### `magic-garden-guide.vrm`

正式模型位置為：

```text
public/models/magic-garden-guide.vrm
```

這是作者 NHRI 製作的魔法花園 3D 引導角色，會納入版本控制、正式建置與 GitHub Pages 發布。

更換模型時，請同步記錄新檔名、作者、版本或雜湊，並更新 `game.json`、README、模型目錄說明與發布紀錄。

### 第三方專案與套件

- SystemAnimatorOnline / XR Animator 只作姿勢追蹤與 VRM 行為參考；保留來源連結與署名脈絡。
- 不要從其儲存庫複製未經確認的美術、音效或第三方模型。
- 每次更新第三方套件，重新檢查授權與 notice。
- 發行內容應保留 MediaPipe 與其他套件要求的授權通知。

完整現況見 [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。該文件是維護備忘，不是法律意見。

## GitHub Pages 維運

預計正式網站為
<https://root50643.github.io/magic-garden-yoga/>。Pages 專案網站位於子路徑 `/magic-garden-yoga/`；任何倉庫重新命名、帳號移轉或自訂網域，都可能改變 base path 與公開網址。

日常發布應由 GitHub Actions 從已提交的原始碼重新安裝、檢查、建置並部署，不要從開發者電腦手動上傳一份來源不明的 `dist/`。實際 workflow 與 `vite.config.ts` 是部署行為的來源；如果文件描述與它們不同，先停止發布並釐清，不要猜測哪一份正確。

以下變更後必須重新走完整 Pages 驗收：

- 倉庫名稱、GitHub 帳號、Pages 自訂網域或 Vite `base`。
- `game.json` 中任何模型、圖片、task 或 WASM 路徑。
- Actions workflow、Node／pnpm 版本、lockfile 或建置命令。
- VRM、MediaPipe task、WASM 檔案或其檔名。
- 攝影機、Worker、WebAssembly、CSP 或 Permissions Policy 相關程式。

操作與排錯請依 [GitHub Pages 部署手冊](GITHUB_PAGES.md)。Actions 顯示綠色只代表工作流程成功；仍需在全新瀏覽器工作階段檢查正式 URL、攝影機權限與所有大型資產。

## 故障排除

### `ModuleFactory not set.`

這通常不是姿勢設定錯誤，而是 MediaPipe ES module Worker 載入了錯誤、缺漏、不相容或被快取的 WASM loader。

目前程式的必要條件：

```ts
FilesetResolver.forVisionTasks(config.wasmPath, true)
```

`true` 指示 MediaPipe 使用 module-aware loader。排查：

1. 確認 `src/workers/pose.worker.ts` 與 `src/workers/avatar.worker.ts` 的 fileset 初始化仍保留第二個參數 `true`。
2. 在 DevTools Network 搜尋 `vision_wasm`，確認對應 JS 與 WASM 都是 HTTP 200，而不是 404、HTML 錯誤頁或被代理登入頁取代。
3. 確認 `public/mediapipe/wasm/` 的六個檔案來自與 `@mediapipe/tasks-vision` 相同版本。
4. 確認 `game.json` 的 `wasmPath` 是釘選同版套件的 WASM 目錄（公開版為 `https://unpkg.com/@mediapipe/tasks-vision@0.10.35/wasm`，離線版為 `/mediapipe/wasm`），不是某一個檔名。
5. 確認正式伺服器將 `.wasm` 以 `application/wasm` 回應，JS 使用正確 JavaScript MIME。
6. 停止 dev server、重新 `pnpm install --frozen-lockfile`、重啟，再在瀏覽器硬重新整理。
7. 清除該 origin 的快取；若部署環境有 CDN／service worker，也清除舊 loader。專案本身目前沒有 service worker。
8. 用 `pnpm build && pnpm preview` 測正式輸出，以區分 HMR 與部署問題。

Avatar Worker 會連續建立 Hand 與 Face task。MediaPipe 建立 task 後可能清除 `ModuleFactory`，所以程式替兩個 loader URL 加上 `?task=hands`／`?task=face` cache key。若只有第二個 tracker 報錯，確認這段隔離仍存在，不要把兩個 URL 合併回同一個已快取 module。

Worker 初始化錯誤會被應用程式捕捉並顯示在頁面，因此主頁 Console 可能沒有未捕捉例外。應同時檢查 Network，以及 DevTools Sources／Threads 中名為 `magic-garden-pose-tracker` 與 `magic-garden-avatar-motion` 的 Worker。Avatar Worker 錯誤只會顯示非致命提醒；若仍可做姿勢並累積進度，這是預期的故障隔離。

不要用全域 `<script>` 臨時載入 classic loader 來繞過問題；那會讓 dev 與 build 行為不一致。

### 攝影機無法使用

依序確認：

1. URL 是 `http://localhost...` 或有效 HTTPS。LAN IP 的一般 HTTP 通常不是 secure context。
2. Chrome／Edge 網址列的攝影機權限不是「封鎖」。
3. Windows「隱私權與安全性 → 相機」允許桌面應用程式與瀏覽器。
4. Teams、Zoom、OBS 或其他程式沒有獨占攝影機。
5. 瀏覽器能在其他可信網站使用同一攝影機。
6. 若有多個鏡頭，先在瀏覽器網站設定選正確裝置。
7. 按遊戲的「重試攝影機」，必要時完全關閉該分頁再開。
8. DevTools Console 檢查錯誤名稱：`NotAllowedError`、`NotFoundError`、`NotReadableError` 或 `OverconstrainedError`。

若頁面由 iframe 開啟，還需檢查 iframe `allow="camera"` 與伺服器 Permissions Policy。

### VRM 載入失敗或人物不動

- 確認 `public/models/magic-garden-guide.vrm` 存在，且建置後也出現在對應的 `dist/models/` 路徑。
- 在 Network 確認 VRM URL 200，內容不是 Git LFS pointer、HTML 或 0-byte 檔。
- 檢查檔名大小寫與部署根路徑。
- 確認是有效 VRM，且 Humanoid 中有必要的左右手腳骨骼。
- 模型太大／太小時調整 `avatar.scale`；裁切時調整 `cameraDistance`。
- 只測對稱 T pose 不容易辨別左右，請逐側舉手與彎膝。
- `avatar.mirrored` 只改觀看方向；不要拿它修正實際錯誤的 Humanoid bone mapping。
- DevTools 檢查 WebGL context、GPU blocklist 與記憶體問題。

VRM 未準備完成會阻止「開始」按鈕；攝影機仍可顯示並不代表模型成功。

### 手腕、手指或表情不同步

先區分「額外顯示追蹤失敗」與「VRM 不支援該動作」：

1. 在 Network 確認 `hand_landmarker.task`、`face_landmarker.task`、loader 與 WASM 全部回應 200，不是 HTML 錯誤頁。
2. 檢查準備畫面的非致命提醒，以及 portal 元素的 `data-hand-tracking`、`data-face-tracking`、`data-avatar-progress`；這些狀態不會出現在瑜珈分數。
3. 開啟 `?avatarDebug=1`。只要 VRM 載入成功，即使攝影機不可用也能按「開始冒險」，以檢查闖關頁主要 VRM、右下角小攝影機與 responsive 版面；合成資料會週期性翻動左右手腕、彎指、眨眼與張嘴。若手腕不動，先檢查 VRM `leftHand`／`rightHand` 與近端指骨，若 debug 正常、真人不正常，再查 MediaPipe、光線與 ROI。
4. 真人測試時保持全身入鏡，但讓手指輪廓朝向鏡頭、避免手掌貼在衣服或臉上。快速移動後停住半秒，排除正常節流和平滑。
5. 逐側翻掌、張手／握拳。若左手資料始終套到右手，先確認不是 `avatar.mirrored` 造成觀看錯覺；確定解剖學左右真的錯誤後，才切換 `avatarTracking.hands.handednessSwap`。
6. 手常被裁掉時稍微提高 `roiScale`；手在 ROI 內太小時稍微降低。每次改 0.1–0.2，並重測手放下、舉高、側伸與靠近臉。
7. 臉部要接近正面、均勻受光，眼睛與嘴巴不可被口罩、頭髮或手遮住。只有部分表情無反應時，檢查 VRM 是否有對應 preset。
8. 手腕抖動時先比較 Hand raw world landmarks、ROI 是否裁到完整手掌，以及 6／10／15 FPS 的結果；右下角 2D overlay 穩定不代表 world z 穩定。`avatarTracking.smoothing` 可調顯示平滑與延遲，但手腕沒有幅度 influence 或最終角度上限，不要重新加入限制來遮掩 basis 或 parent-local 轉換錯誤。
9. 追蹤消失後仍短暫維持是 `lostHoldMs` 的預期行為；手腕／手指回復太慢時降低 `relaxMs`，回復太突兀時提高。
10. 四指張合太弱／太強時先調 `fingerSpreadInfluence`，只有最大張指被截斷才調 `fingerSpreadMaxDegrees`。拇指跑到手背、掌內或手臂時沒有倍率可微調，應檢查 MediaPipe 1→2、2→3、3→4 的有號方向及逐節 parent-local 解算。完整順序見[設定檔手冊](CONFIGURATION.md#手腕與手指微調順序)。
11. 先確認 `avatarMotionStabilizer` 測試通過；穩定器的快慢分類必須依速度，21 點必須使用共用 alpha，且兩個 Hand frame 間應保持 local wrist target。不要只看 normalized 2D overlay 判斷 3D 解算品質。

手／臉 tracker 故障、被關閉或當下看不到都不應改變姿勢總分、保持光環或排行榜資格。若它們連帶使闖關停止，先執行：

```bash
pnpm test src/lib/avatarMotionIsolation.integration.test.ts
```

再檢查是否有人把 `AvatarMotionFrame` 接進 `evaluatePose`、`HoldTracker` 或 ready 條件。

`avatarDebug=1` 的無攝影機開始能力只供版面與 VRM 顯示驗收：它不會產生身體 `PoseFrame`，不會讓姿勢通過，也不能取代分數、保持計時、overlay 對位或攝影機效能測試。Pose Tracker 在此模式仍維持原邏輯；維護時應保留這項隔離，並在移除 query parameter 後完成真人驗收。

### 手腕跨越正負 180° 時仍翻轉

目前 runtime 不應逐幀呼叫無狀態的相容 wrapper。`VrmPreview` 必須為左右手各自保留 `WristSolverState`，並把 `updatedAtMs` 連同上一個 state 傳給 `solveContinuousWristLocalQuaternion()`：

- 手腕來源只使用 Hand raw world landmarks 建立完整 palm quaternion；不要以 ROI normalized z 或 2D overlay 代替。
- 完整 palm quaternion 會先校正模型 rest palm，再經目前 forearm parent world quaternion 解回 local target；solver 不拆受限 swing／twist，也沒有最終姿勢 angle cap 或 influence。
- 相同旋轉的 `q`／`-q` 表示會先對齊 hemisphere，target 也相對上一個 local quaternion 沿 SO(3) 最短路徑前進。
- runtime 以來源 timestamp 的時間差和 540°/s 速度 budget 平滑追上目標。這不是姿勢上限：單幀 180° 不會瞬間跳過去，但相同方向持續存在時必須在後續新 timestamp 完整到達。
- 較舊 timestamp 會被拒絕；同一個 10 FPS 手部 frame 在多個 render frame 間不得重複推進 solver。不要恢復「大角度一律拒絕，等第二候選確認」的邏輯，否則持續的大幅翻掌可能飢餓而永遠到不了。
- `VrmPreview` 只在 render 層以 frame-rate independent slerp 降低顯示噪音；不要再於來源層疊加 low-pass，否則完整翻掌會因多層延遲而看起來像被截斷。這項 render 平滑不應改變 persistent target 的最終方向。
- 狀態應在該手超過遺失維持時間並進入 relax 時重置，不能每個 render frame 或每次 React re-render 都重建。

先執行：

```bash
pnpm test src/lib/wristRetarget.test.ts src/lib/avatarMotion.test.ts
```

測試涵蓋完整世界旋轉、非交換順序的 forearm parent、持續 180° 完整到達、連續大旋轉不飢餓、單幀翻轉的速度平滑、正反向越過接縫、quaternion 正負等價、較舊 timestamp 與左右獨立 state。自動測試通過後，仍要真人逐側從掌心朝前緩慢翻到手背；若持續目標永久停住，應修 solver、basis 或 parent-local 轉換，不是新增角度限制。

### 握拳時拇指跑到手背、掌內或手腕

拇指顯示不應由「握拳程度」或指尖距離猜測。`VrmPreview` 與 [`../src/lib/thumbRetarget.ts`](../src/lib/thumbRetarget.ts) 的必要條件如下：

1. MediaPipe 點 1→2、2→3、3→4 必須分別對應 VRM `thumbMetacarpal`、`thumbProximal`、`thumbDistal`，不可只用點 4 到掌心的距離驅動整根拇指。
2. 每段要保留完整有號 3D 方向。先移除 tracked palm quaternion，取得 palm-local segment；只用無號三點夾角會遺失「往掌心或往手背」的方向。
3. 把 palm-local segment 轉到目前 VRM palm world 後，以掌面法線（必要時掌長方向）穩定 bone roll，再依掌骨→近端→末端順序解算。下一節必須使用同一 render frame 中上一節已實際套用並更新 matrix 後的 parent world quaternion；使用尚未畫出的預測父姿勢會在握拳過渡時暫時折到手背。
4. `solveBoneLocalDirection()` 只求讓 authored rest segment 指向量測方向的 minimum swing，保留模型 rest roll。不要加入 palm-center attraction、tip proximity closure、額外 opposition 或相對 rest angle cone。
5. 檢查 VRM 是否真的有標準三節拇指骨，且 normalized bone 的父子順序正確。只有單側錯誤時，再確認 handedness 與該側 rest axis；`avatar.mirrored` 只翻畫面，不能修骨鏈。

先執行：

```bash
pnpm test src/lib/thumbRetarget.test.ts src/lib/wristRetarget.test.ts
```

測試應固定三段 landmark 對應、有號 palm-local 方向、整手 3D 旋轉不重複套用、模型 rest roll，以及父骨已旋轉後的下一節 local solve。最後用真人左右手分別測試張掌、掌心朝前握拳、掌背朝前握拳、勝利手勢與緩慢翻掌；拇指應隨每節真實方向移動，且不穿到手背或手腕。

### 正確度分數偏低或進度不動

先使用 `?poseDebug=1`：

1. 確認 summary 顯示的本關門檻是否符合 `poses[].scoreThreshold`。
2. 看最低分 constraint 的目標是否與圖片一致。
3. 確認 `minimumVisibility`、全身入鏡或多人狀態沒有阻止 `passing`。
4. 手腳重疊或側身時，world depth 與 visibility 較容易抖動。
5. 檢查 `allowMirrored`；不要把 `avatar.mirrored` 誤當評分鏡像。
6. 確認光線在玩家前方，衣服與背景有對比，鏡頭能看到頭、手與腳。
7. 讓姿勢穩定半秒，排除 EMA 的正常反應延遲。
8. 若只有站遠／站近時分數改變，檢查是否使用未正規化的 z 或不適合的 3D 距離規則。
9. 若總分達標但光環不前進，檢查 body in frame、visibility、是否超過 500 ms 寬限，以及目前是否真的只有一人。

不要直接把所有 tolerance 放大或把門檻降到極低；這會使錯誤姿勢也通過。依[校準流程](#姿勢規則維護與校準)逐項處理。

### 身體、雙手或臉部 overlay 與影片錯位

小攝影機影片使用鏡像和 `object-fit: cover`；身體骨架、雙手 21 點與臉部輪廓 overlay 都會依來源 video 尺寸、容器比例、裁切 offset 與鏡像重新映射。若修改 camera CSS：

- 同步檢查 `mapNormalizedPointToCover`。
- 執行 `SkeletonOverlay.test.ts`。
- 測 16:9、4:3、窄螢幕與視窗縮放。
- 在高畫質確認手部連線／節點、臉部輪廓／密點；在低畫質確認手部連線與臉部輪廓仍存在，但省略密點。

手／臉 overlay 只讀取 `AvatarMotionFrame`，不進入瑜珈評分；身體 overlay 雖顯示 `PoseFrame`，canvas 本身也不寫回評分器。Overlay 錯位是顯示問題，不代表評分座標一定錯誤；先用規則分數與原始 landmark 判斷。

### 設定檔載入失敗

- 確認 JSON 沒有註解、尾端逗號或全形標點。
- 執行 `pnpm test` 取得欄位路徑與全部 validation issues。
- Network 確認 `/config/game.json` 不是 404 或舊快取。
- 正數欄位不能為 0；0–100 與 0–1 欄位則依文件範圍。
- pose `id` 必須唯一，landmark 名稱需完全匹配。
- 本機 Windows 成功但 Linux 404 時，通常是檔名大小寫。

### 效能不足、畫面卡頓

- 切換右上角為「節能光效」。
- 在作業系統啟用減少動態效果。
- 切換成「節能光效」，再把顯示專用的 `avatarTracking.lowQualityMaxInferenceFps` 從 6 降到 5 或 4；仍不足時關閉 `avatarTracking.face.enabled` 或 `avatarTracking.hands.enabled`。
- 身體評分仍不足時，再把 `poseDetection.maxInferenceFps` 從 20 逐步降到 15 或 12。
- 關閉其他使用 GPU／攝影機的分頁與程式。
- 確認瀏覽器啟用硬體加速。
- 降低 VRM 材質、貼圖與多邊形複雜度。
- 在 DevTools Performance 分開觀察主執行緒動畫與 Worker inference，不要只看整體 FPS。

### 排行榜沒有保存

- 跳過任一姿勢後，該局設計上不可提交。
- 隱私模式、儲存封鎖或 quota 錯誤可能阻止 Local Storage。
- 不同 origin、連接埠、瀏覽器與裝置不共享資料。
- 載入另一個 `challengeId` 會依目前開發清理策略移除非 active 榜單。
- 暱稱空白或只含控制字元會被拒絕。

排行榜不是後端資料，不要承諾永久保存。

## 發布檢查表

### 程式與設定

- [ ] `pnpm install --frozen-lockfile` 成功。
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm build` 全部通過。
- [ ] 正式 `challengeId`、標題、姿勢順序、每關門檻與保持秒數已確認。
- [ ] `game.json` 引用的每個圖片、task、WASM 目錄與 VRM 都存在。
- [ ] `?poseDebug=1` 已由多位真人完成正向與負向校準。
- [ ] `?avatarDebug=1` 已在無攝影機時進入闖關頁，驗證主要 VRM、小攝影機與 responsive 版面，以及左右手指骨與表情 preset；移除參數後也完成真人全身、手／臉追蹤與評分。
- [ ] 左右手緩慢正反向完成 180° 翻掌都能到達完整方向且沒有突然反轉；張指、掌心／掌背朝前握拳與勝利手勢時，拇指三節不跑到手背、掌內或手腕。
- [ ] 改變手指與臉部動作不會改變姿勢分數、保持進度或排行榜資格。
- [ ] 準備／闖關頁以主要 VRM 為動作回饋；桌機右下角及窄螢幕 responsive 小攝影機都未遮住姿勢卡、提示、保持光環或按鈕。
- [ ] 小攝影機顯示身體、雙手與臉部 overlay；切換高／低畫質後細節層級符合預期，且手／臉 overlay 不影響分數。
- [ ] Chrome、Edge 各完成一次從允許權限到五關完成與排行榜提交。
- [ ] 倒數與轉場不計時；跳過後不能寫榜。
- [ ] 多人、無人、遮擋與出框不累積進度。
- [ ] 高／低畫質、靜音與減少動態效果可用。

### 部署與安全

- [ ] 使用正式 HTTPS，不以 Vite dev／preview 對外服務。
- [ ] GitHub Pages 的 Source 已設為 GitHub Actions，最新部署 workflow 成功完成。
- [ ] 正式網址與 Vite／資產 base path 都對應目前的 owner 與 repository 名稱。
- [ ] 攝影機權限與 Permissions Policy 在正式 origin 驗證。
- [ ] loader、WASM、task、Worker、VRM、圖片全部回應 200 與正確 MIME。
- [ ] `index.html`／`game.json` 短快取，雜湊 JS/CSS 長快取；更新的大型資產已清 CDN。
- [ ] CSP／反向代理沒有阻擋 module Worker 或 WebAssembly。
- [ ] 沒有加入分析 SDK、影像上傳、秘密、私人 URL 或不必要的第三方請求。
- [ ] 錯誤頁不暴露本機路徑、學生資訊或敏感資料。

### 素材與 GitHub

- [ ] `git remote -v` 的 push 目標是團隊自己的儲存庫，不是 SystemAnimatorOnline。
- [ ] `public/models/magic-garden-guide.vrm` 已納入預期提交與建置內容，公開頁面能成功載入。
- [ ] 正式 VRM、姿勢圖片、MediaPipe task／WASM 與所有套件的檔名及版本已有記錄。
- [ ] Hand／Face task 的位元組大小與 SHA-256 符合固定版資產紀錄。
- [ ] `THIRD_PARTY_NOTICES.md` 已更新。
- [ ] 未提交 `.env`、憑證、私鑰、日誌、攝影機截圖或測試者個資。
- [ ] README 與 `docs/` 反映目前命令、欄位與限制。

### 發布後

- [ ] 從另一台未快取的電腦開啟正式 Pages URL。
- [ ] 重新授予攝影機權限並完成至少一關。
- [ ] 在正式 URL 逐側張手／握拳、眨眼與張嘴；遮住手或臉時身體闖關仍可繼續。
- [ ] 確認瀏覽器沒有 mixed content、WASM、Worker、WebGL 或 404 錯誤。
- [ ] 記錄發布 commit、日期、正式 `challengeId`、模型版本與回復方式。
- [ ] 保留上一個可部署的 commit 或 artifact，以便回滾。

## 文件維護

發生以下變更時同步更新文件：

| 變更 | 文件 |
| --- | --- |
| Node、pnpm、Vite port、host 或部署方式 | `BUILD.md` |
| 模組、資料流、狀態機、測試 | `DEVELOPMENT.md` |
| `GameConfig`、constraint、門檻、資產路徑 | `CONFIGURATION.md` |
| 依賴、校準、Local Storage、故障、發布流程 | `MAINTENANCE.md` |
| 第三方套件、參考來源或素材資訊 | `THIRD_PARTY_NOTICES.md` |

文件範例也要接受 code review。尤其不要在文件中放入真實學生姓名、攝影機截圖、內網秘密位址或憑證。
