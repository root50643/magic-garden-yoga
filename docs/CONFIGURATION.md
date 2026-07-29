# `game.json` 設定檔手冊

遊戲內容與大部分活動參數位於 [`../public/config/game.json`](../public/config/game.json)。程式啟動時會 fetch、解析並完整驗證此檔案；修改後重新整理頁面即可載入新設定。

JSON 不支援註解、尾端逗號或 `NaN`。建議使用支援 JSON 語法檢查的編輯器，修改後務必執行：

```bash
pnpm test
pnpm build
```

## 設定優先順序

每一關可覆蓋兩個常用全域預設：

```text
實際通過分數 = poses[].scoreThreshold ?? poseDetection.scoreThreshold
實際保持秒數 = poses[].holdSeconds ?? timing.defaultHoldSeconds
```

`0` 是有效的分數門檻，所以程式使用 nullish fallback，而不是 truthy 判斷。即使門檻為 0，玩家仍須通過必要點可見度與全身入鏡檢查。

## 完整結構範例

以下範例保留一關來展示所有根層與姿勢欄位；實際檔案可放任意數量的姿勢：

```json
{
  "challengeId": "magic-garden-yoga-dev",
  "title": "魔法花園瑜珈闖關",
  "subtitle": "跟著花園精靈一起伸展！",
  "avatar": {
    "modelPath": "/models/magic-garden-guide.vrm",
    "scale": 1,
    "cameraDistance": 2.8,
    "mirrored": true
  },
  "timing": {
    "countdownSeconds": 3,
    "defaultHoldSeconds": 3,
    "trackingGraceMs": 500,
    "transitionMs": 1500
  },
  "poseDetection": {
    "modelPath": "/models/pose_landmarker_full.task",
    "wasmPath": "/mediapipe/wasm",
    "maxInferenceFps": 20,
    "scoreThreshold": 75,
    "minDetectionConfidence": 0.55,
    "minTrackingConfidence": 0.55,
    "minPosePresenceConfidence": 0.55
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
      "handednessSwap": false,
      "minDetectionConfidence": 0.5,
      "minPresenceConfidence": 0.5,
      "minTrackingConfidence": 0.5
    },
    "face": {
      "enabled": true,
      "modelPath": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      "minDetectionConfidence": 0.5,
      "minPresenceConfidence": 0.5,
      "minTrackingConfidence": 0.5
    }
  },
  "leaderboard": {
    "limit": 10,
    "nameMaxLength": 12
  },
  "effects": {
    "defaultQuality": "high",
    "audioEnabled": true
  },
  "poses": [
    {
      "id": "mountain",
      "name": "山式",
      "englishName": "Mountain Pose",
      "imagePath": "/assets/poses/mountain.png",
      "instruction": "雙腳站穩、背挺直，雙手自然放在身體兩旁。",
      "orientation": "front",
      "allowMirrored": true,
      "scoreThreshold": 75,
      "holdSeconds": 3,
      "minimumVisibility": 0.48,
      "constraints": [
        {
          "type": "angle",
          "points": ["leftShoulder", "leftElbow", "leftWrist"],
          "target": 175,
          "tolerance": 18,
          "weight": 1,
          "hint": "把手臂伸直一點。"
        }
      ]
    }
  ]
}
```

## 根層欄位

| 路徑 | 型別／範圍 | 必填 | 說明 |
| --- | --- | --- | --- |
| `challengeId` | 非空字串 | 是 | 本機排行榜分區。開發版使用 `magic-garden-yoga-dev`；正式發布時可改為穩定的正式 ID |
| `title` | 非空字串 | 是 | 遊戲標題；目前品牌列主要使用固定文案，但此欄仍是設定契約 |
| `subtitle` | 非空字串 | 是 | 準備頁副標題 |
| `avatar` | 物件 | 是 | VRM 顯示設定 |
| `timing` | 物件 | 是 | 倒數、保持、寬限與轉場時間 |
| `poseDetection` | 物件 | 是 | MediaPipe 模型、效能、信心值與全域分數預設 |
| `avatarTracking` | 物件 | 是 | 顯示專用的手指／表情追蹤；不參與姿勢分數 |
| `leaderboard` | 物件 | 是 | 本機排行榜規則 |
| `effects` | 物件 | 是 | 畫質與音效預設 |
| `poses` | 非空陣列 | 是 | 依陣列順序出現的關卡 |

## `avatar`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `modelPath` | 非空字串 | VRM URL；建議放在 `public/models/` 並使用 `/models/name.vrm` |
| `scale` | 有限數字，`> 0` | 載入後對整個 VRM scene 套用的比例 |
| `cameraDistance` | 有限數字，`> 0` | 取景的最低攝影機距離；程式仍會依模型 bounds 自動退後，避免裁切 |
| `mirrored` | boolean | `true` 水平翻轉 VRM canvas，讓操作感像照鏡子 |

`avatar.mirrored` 不會交換 MediaPipe 的左右點、VRM 的左右骨骼或姿勢規則。這是純顯示選項。若要讓「右腳抬起」與「左腳抬起」都可通過，應調整該姿勢的 `allowMirrored`。

## `timing`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `countdownSeconds` | 整數，`>= 0` | 按開始後的倒數；不計入排行榜時間 |
| `defaultHoldSeconds` | 有限數字，`> 0` | 未設定 `poses[].holdSeconds` 時的連續保持秒數 |
| `trackingGraceMs` | 有限數字，`>= 0` | 短暫低分、遮擋或追蹤遺失的寬限毫秒數 |
| `transitionMs` | 有限數字，`>= 0` | 一般動態模式的過關轉場時間；不計入排行榜時間 |

寬限期間的時間不會加入保持進度。若正確姿勢在寬限內恢復，從原進度繼續；超過才歸零。低畫質或減少動態效果時，程式可能使用較短的固定轉場，避免長動畫。

## `poseDetection`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `modelPath` | 非空字串 | MediaPipe Pose Landmarker `.task` URL |
| `wasmPath` | 非空字串 | 包含 MediaPipe loader 與 WASM 的目錄 URL，不含尾端檔名 |
| `maxInferenceFps` | 有限數字，`> 0` | 每秒最多送入 Worker 的影格數；通常 12–20 |
| `scoreThreshold` | 有限數字，0–100 | 姿勢未設定個別門檻時的全域 fallback |
| `minDetectionConfidence` | 有限數字，0–1 | MediaPipe 初次姿勢偵測信心門檻 |
| `minTrackingConfidence` | 有限數字，0–1 | MediaPipe 影片追蹤信心門檻 |
| `minPosePresenceConfidence` | 有限數字，0–1 | MediaPipe 判斷人物姿勢存在的信心門檻 |

三個 MediaPipe confidence 影響「模型是否產生／持續追蹤 pose」，不同於 `minimumVisibility`。把它們調低可能在暗處更常產生骨架，也可能增加錯誤骨架；把它們調高則可能讓骨架頻繁消失。一次只改一項並做真人測試。

`maxInferenceFps` 不是畫面 FPS。攝影機與動畫仍可維持較高更新率，只有姿勢推論被節流。低效能電腦可先試 12–15；太低會使動作回饋和 500 ms 寬限顯得不連續。

## `avatarTracking`

這一組 MediaPipe Hand／Face Landmarker 只產生 `AvatarMotionFrame`，交給 VRM 顯示手指彎曲、眨眼、嘴型、微笑與驚訝表情。評分器、`HoldTracker` 與排行榜只接收 `PoseFrame`；因此更改本節參數、偵測不到手／臉，或模型載入失敗，都不會提高、降低或阻止瑜珈分數。

### 共用欄位

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `enabled` | boolean | 手部與臉部顯示同步的總開關；`false` 時不啟動額外 Worker 推論 |
| `maxInferenceFps` | 有限數字，`> 0` | 額外手／臉推論的最高 FPS；預設 10，與 `poseDetection.maxInferenceFps` 分開 |
| `lowQualityMaxInferenceFps` | 有限數字，`> 0` 且不高於 `maxInferenceFps` | 切換成「節能光效」時的額外手／臉推論上限；預設 6 |
| `initializationTimeoutMs` | 有限數字，`>= 1000` | Hand／Face 模型初始化逾時；預設 120000（2 分鐘），包含首次公開網站下載與 WASM 編譯時間；舊設定省略時也會採用此值 |
| `smoothing` | 有限數字，`> 0` 且 `<= 1` | VRM 手指與表情的插值速度；較小較平滑但延遲較明顯，較大回應較快 |
| `lostHoldMs` | 有限數字，`>= 0` | 短暫漏掉手或臉時，維持上一個顯示值的時間 |
| `relaxMs` | 有限數字，`> 0` | 超過 `lostHoldMs` 後，手指回到模型休息姿勢的平滑時間；臉部表情會依內建表情平滑值回到 0 |

即使 `enabled` 為 `false`，目前設定驗證仍要求 `hands`、`face` 與其他欄位完整存在；這讓重新開啟功能時不會使用未驗證的隱含預設值。

### `avatarTracking.hands`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `enabled` | boolean | 是否載入 Hand Landmarker 並驅動 VRM 標準手指骨 |
| `modelPath` | 非空字串 | MediaPipe Hand Landmarker `.task` URL |
| `roiScale` | 有限數字，`> 0` | 以 Pose 肩寬為基準的手腕裁切範圍；預設 1.6 |
| `handednessSwap` | boolean | 只在手指明顯套到另一側 VRM 手時交換左右；不應用來實作鏡像畫面 |
| `minDetectionConfidence` | 有限數字，0–1 | 初次手部偵測信心門檻 |
| `minPresenceConfidence` | 有限數字，0–1 | 手部存在信心門檻 |
| `minTrackingConfidence` | 有限數字，0–1 | 影片手部追蹤信心門檻 |

玩家要全身入鏡時，原始畫面中的手通常很小。額外 Worker 先利用 Pose Landmarker 的左右手腕、拇指、食指與小指附近點，分別裁出左右手 ROI，再把兩個區域放大到固定的 320 × 320 面板後交給 Hand Landmarker。這只改善人物顯示，不會把 21 個手部點送進瑜珈評分器。

調整 `roiScale` 時請注意：

- 較大會包含更多手腕周圍範圍，比較不怕 Pose 手腕點偏移，但手在面板內會較小、背景也更多。
- 較小會讓手在面板內更大，但快速揮手或張開手指時比較容易被裁掉。
- 一次只改 0.1–0.2，實測雙臂垂下、舉高、向兩側伸直及手靠近臉的情況。

`handednessSwap` 與 `avatar.mirrored` 是不同問題：前者交換追蹤資料送到哪一隻 VRM 手；後者只是把最終 canvas 水平翻轉。一般情況維持 `false`，只在逐側握拳驗證證明左右相反時才設為 `true`。

### `avatarTracking.face`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `enabled` | boolean | 是否載入 Face Landmarker 並驅動 VRM 表情 |
| `modelPath` | 非空字串 | MediaPipe Face Landmarker `.task` URL |
| `minDetectionConfidence` | 有限數字，0–1 | 初次臉部偵測信心門檻 |
| `minPresenceConfidence` | 有限數字，0–1 | 臉部存在信心門檻 |
| `minTrackingConfidence` | 有限數字，0–1 | 影片臉部追蹤信心門檻 |

Face Landmarker 只要求一張臉，輸出 blendshape 係數；目前不輸出臉部網格或頭部 transformation matrix。程式會把相關係數映射到 VRM 的 `blinkLeft`／`blinkRight`（缺少時使用共用 `blink`）、`aa`、`ih`、`ou`、`ee`、`oh`、`happy` 與 `surprised` preset。模型沒有某個 expression preset 時會直接略過，不是致命錯誤。

公開版預設使用 Google 官方固定版模型網址，避免 GitHub Pages 對大型 `.task` 下載過慢。若環境需要完全離線或禁止外部靜態資產，把 Hand／Face 的 `modelPath` 分別改成 `/models/hand_landmarker.task` 與 `/models/face_landmarker.task`；兩份相同雜湊的模型已包含在 `public/models/`。

### 效能與故障隔離

- 額外追蹤只有在 Pose Landmarker 確認畫面中恰好一人時才送出影格；沒有人或多人時不保留新的手／臉資料。
- 手／臉使用與身體追蹤不同的 Worker、節流上限與可序列化資料契約。手或臉其中一個模型失敗時，另一個仍可啟動。
- 初始化或推論失敗會在準備畫面顯示非致命提醒；身體追蹤、分數、保持進度與「開始」條件不依賴此功能。
- 低效能裝置先把 `avatarTracking.lowQualityMaxInferenceFps` 從 6 降到 5 或 4，並切換成「節能光效」；仍不足時個別把 `hands.enabled` 或 `face.enabled` 設為 `false`。不要先降低瑜珈的 `poseDetection.maxInferenceFps`。

## `leaderboard`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `limit` | 整數，`>= 1` | 每個 `challengeId` 最多保留的名次 |
| `nameMaxLength` | 整數，`>= 1` | 暱稱最大 Unicode 字元數 |

暱稱會做 Unicode NFKC 正規化、移除不可見控制字元、合併空白並截斷。同名比較不分大小寫，只保留最快成績。資料只在同一瀏覽器、同一 origin 的 Local Storage。

## `effects`

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `defaultQuality` | `"high"` 或 `"low"` | 初次載入的粒子／動畫畫質 |
| `audioEnabled` | boolean | 是否建立可播放的 Web Audio 音效 |

使用者仍可由右上角切換畫質與靜音。靜音偏好會寫入 `magic-garden-yoga:muted`；畫質目前只保存在當次 React 狀態。作業系統 `prefers-reduced-motion: reduce` 會進一步降低動態效果。

## 每關姿勢欄位

| 欄位 | 型別／範圍 | 必填 | 說明 |
| --- | --- | --- | --- |
| `id` | 非空且唯一字串 | 是 | 穩定的姿勢識別；比較重複時會 trim 且不分大小寫 |
| `name` | 非空字串 | 是 | 繁體中文名稱 |
| `englishName` | 非空字串 | 是 | 英文名稱／副標 |
| `imagePath` | 非空字串 | 是 | 引導圖片 URL |
| `instruction` | 非空字串 | 是 | 給兒童的一句動作說明 |
| `orientation` | `front`、`threeQuarter`、`side` | 是 | 內容／校準註記；目前不會自動改變評分數學 |
| `allowMirrored` | boolean | 是 | 是否評估左右互換版本並取較高分 |
| `scoreThreshold` | 有限數字，0–100 | 否 | 這一關的通過分數；省略時使用全域 `poseDetection.scoreThreshold` |
| `holdSeconds` | 有限數字，`> 0` | 否 | 這一關的保持秒數；省略時使用 `timing.defaultHoldSeconds` |
| `minimumVisibility` | 有限數字，0–1 | 是 | 規則所需點與必要身體點的最低 visibility／presence |
| `constraints` | 非空陣列 | 是 | 此關的評分規則；支援三種類型 |

### 獨立調整每關門檻

例如讓樹式較寬鬆、星星式維持原門檻：

```json
{
  "poses": [
    {
      "id": "tree",
      "scoreThreshold": 68
    },
    {
      "id": "star",
      "scoreThreshold": 75
    }
  ]
}
```

這仍是節錄範例；每個姿勢都必須保留其他必填欄位。

建議合理校準範圍通常在 65–85，但沒有所有姿勢共用的最佳值。門檻太低會讓錯誤姿勢過關，太高會讓模型抖動或體型差異造成挫折。先調整不合理的 constraint 目標與 tolerance，再調總門檻。

## MediaPipe 33 個關鍵點

設定檔只能使用以下名稱，名稱與大小寫必須完全相同：

| 索引 | 名稱 | 索引 | 名稱 | 索引 | 名稱 |
| ---: | --- | ---: | --- | ---: | --- |
| 0 | `nose` | 11 | `leftShoulder` | 22 | `rightThumb` |
| 1 | `leftEyeInner` | 12 | `rightShoulder` | 23 | `leftHip` |
| 2 | `leftEye` | 13 | `leftElbow` | 24 | `rightHip` |
| 3 | `leftEyeOuter` | 14 | `rightElbow` | 25 | `leftKnee` |
| 4 | `rightEyeInner` | 15 | `leftWrist` | 26 | `rightKnee` |
| 5 | `rightEye` | 16 | `rightWrist` | 27 | `leftAnkle` |
| 6 | `rightEyeOuter` | 17 | `leftPinky` | 28 | `rightAnkle` |
| 7 | `leftEar` | 18 | `rightPinky` | 29 | `leftHeel` |
| 8 | `rightEar` | 19 | `leftIndex` | 30 | `rightHeel` |
| 9 | `mouthLeft` | 20 | `rightIndex` | 31 | `leftFootIndex` |
| 10 | `mouthRight` | 21 | `leftThumb` | 32 | `rightFootIndex` |

`left` 與 `right` 指被拍攝者自己的解剖學左右，不是觀看螢幕者看到的左右。鏡像只發生在顯示或評分的替代版本。

## Constraint 共通欄位

每一種 constraint 都需要：

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `type` | 指定字串 | `angle`、`relativePosition` 或 `distanceRatio` |
| `weight` | 有限數字，`> 0` | 此規則對總分的相對權重 |
| `hint` | 非空字串 | 此規則是最低分時顯示的友善修正提示 |

權重不是百分比，不必加總為 1。例如權重 `2` 的規則對總分影響是權重 `1` 的兩倍。

## `angle`：關節角度

```json
{
  "type": "angle",
  "points": ["leftShoulder", "leftElbow", "leftWrist"],
  "target": 175,
  "tolerance": 18,
  "weight": 1,
  "hint": "把左手臂伸直一點。"
}
```

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `points` | 正好三個 landmark | A、頂點 B、C；上例計算肩—肘—腕在肘部的角度 |
| `target` | 0–180 | 目標角度，單位為度 |
| `tolerance` | `> 0` 且 `<= 180` | 分數曲線的容錯尺度，單位為度 |

角度優先使用 MediaPipe world landmarks，因此較不受攝影機距離與透視影響。若 world landmarks 缺失，會使用 normalized x/y 並把 z 壓成 0 的 2D fallback；側身姿勢的 2D fallback 可靠度較低。

## `relativePosition`：相對位置

```json
{
  "type": "relativePosition",
  "a": "leftWrist",
  "b": "leftShoulder",
  "axis": "y",
  "relation": "less",
  "margin": 0.35,
  "tolerance": 0.18,
  "weight": 1.2,
  "hint": "把左手再舉高一點。"
}
```

| 欄位 | 值 | 說明 |
| --- | --- | --- |
| `a`、`b` | landmark | 比較 `a - b` |
| `axis` | `x`、`y`、`z` | 比較軸 |
| `relation` | `less` | 滿分條件是 `a - b <= -margin` |
| `relation` | `greater` | 滿分條件是 `a - b >= margin` |
| `relation` | `near` | 滿分條件是 `abs(a - b) <= margin` |
| `margin` | 有限數字，`>= 0` | 不扣分區域／要求的最小分隔 |
| `tolerance` | 有限數字，`> 0` | 超出滿分區後的容錯尺度 |

`x`、`y` 使用 normalized image landmark，差值會再除以「肩膀中點到髖部中點」的 2D 軀幹高度。因此 margin 與 tolerance 的單位是軀幹高度，較不受玩家身高、畫面解析度與站立距離影響。

MediaPipe normalized `y` 往畫面下方增加，所以「手腕高於肩膀」要使用 `axis: "y"`、`relation: "less"`。`x` 是未鏡像來源影像的座標；不要根據 CSS 鏡像後的畫面手動反轉規則。

`z` 優先使用 world landmark；缺失時會退回 normalized z。不同模型與取景的 z 尺度較難直觀校準，能以角度或 x/y 表達時優先使用那些規則。

## `distanceRatio`：距離比例

```json
{
  "type": "distanceRatio",
  "a": "leftAnkle",
  "b": "rightAnkle",
  "referenceA": "leftShoulder",
  "referenceB": "rightShoulder",
  "target": 1.9,
  "tolerance": 0.5,
  "weight": 1,
  "hint": "雙腳再打開一些。"
}
```

計算：

```text
ratio = distance(a, b) / distance(referenceA, referenceB)
```

| 欄位 | 型別／範圍 | 說明 |
| --- | --- | --- |
| `a`、`b` | landmark | 要量測的距離 |
| `referenceA`、`referenceB` | landmark | 用作尺度的參考距離 |
| `target` | 有限數字，`> 0` | 目標比例 |
| `tolerance` | 有限數字，`> 0` | 比例偏差的容錯尺度 |

優先使用 3D world landmarks；缺失時使用 z=0 的 normalized 2D fallback。參考距離不可為 0。肩寬常適合當作手腳張開程度的參考，但在三分之四或側身視角會受透視影響，需真人校準。

## 評分計算

對 `angle` 與 `distanceRatio`：

```text
deviation = abs(measured - target)
```

對 `relativePosition`，先算超出滿分條件的 violation。接著令：

```text
r = deviation_or_violation / tolerance
```

單條規則分數：

```text
r <= 1       score = 100 - 25 × r
1 < r < 2    score = 75 × (2 - r)
r >= 2       score = 0
```

因此：

| 偏差 | 單條分數 |
| --- | ---: |
| 0 | 100 |
| `0.5 × tolerance` | 87.5 |
| `1 × tolerance` | 75 |
| `1.5 × tolerance` | 37.5 |
| `2 × tolerance` 或以上 | 0 |

總分是加權平均：

```text
total = Σ(constraintScore × weight) / Σ(weight)
```

姿勢真正通過需要同時成立：

```text
total >= 本關 scoreThreshold
AND 所有必要點 visibility／presence >= minimumVisibility
AND 所有必要點 x、y 位於 0..1
```

若 `allowMirrored` 為真，程式把每個 `left...` landmark 名稱換成對應 `right...` 再計算一次，取兩種方向的較高總分。`mirrored` 不會把座標 x 乘以 -1。

## 姿勢校正與 `poseDebug`

使用開發網址：

```text
http://localhost:5173/?poseDebug=1
```

推薦校正流程：

1. 先確認引導圖與文字描述的是同一個姿勢方向。
2. 確認測試者全身入鏡、前方光線充足、畫面只有一人。
3. 讓至少 3–5 位不同身高與肢體比例的測試者各做數次。
4. 展開「姿勢判定細節」，記錄本關實際門檻、總分與每條分數。
5. 先找出與示範圖衝突的 `target`，不要先降低總門檻。
6. 目標合理但人體自然差異大的規則，逐步增加 `tolerance`。
7. 不應主導通過結果的輔助規則，降低 `weight`。
8. 因側身遮擋而無法保持時，小幅調低該關 `minimumVisibility`；同時確認不是手腳真的出框。
9. 規則整體合理後，才設定該關 `scoreThreshold`。
10. 以明顯錯誤的負向姿勢再次測試，確認不會過關。
11. 執行測試與正式建置，再以 Chrome、Edge 各驗收一次。

判讀注意：

- 面板中單條規則低於本關門檻會被標示，但總分是加權平均；單條黃色不等於整體一定失敗。
- 畫面正確度高但進度不動時，檢查 visibility、body in frame 與是否偵測多人。
- 提示取當前最低分規則。若常顯示不重要的提示，可能要調整該規則目標、容錯或提示文字，而不是只改權重。
- EMA 平滑會造成短暫延遲；每次姿勢先穩定約半秒再記錄。
- 不要只用一張靜態圖片反推人體 3D 深度。最終標準必須以真人攝影機資料校準。

## 更換圖片、模型與新增關卡

### 更換姿勢圖片

1. 把新圖放入 `public/assets/poses/`。
2. 建議使用 WebP、PNG 或 JPEG，人物全身完整、背景與肢體有對比。
3. 更新該姿勢 `imagePath`：

```json
"imagePath": "/assets/poses/new-tree.webp"
```

4. 同步修改 `instruction`、`orientation` 與 `constraints`。只換圖但保留舊規則，會讓玩家模仿正確圖片卻得到低分。
5. 注意 Linux 部署會區分檔名大小寫。

圖片本身不會被程式分析或自動變成評分模板；判定標準完全來自 `constraints`。

### 更換 VRM

1. 把模型放入 `public/models/`，例如 `public/models/garden-guide.vrm`。
2. 修改：

```json
"avatar": {
  "modelPath": "/models/garden-guide.vrm",
  "scale": 1,
  "cameraDistance": 2.8,
  "mirrored": true
}
```

3. 在準備頁測試模型高度、取景、面向、左右手腳、腳掌、每根手指與表情。
4. 視需要調整 `scale` 與 `cameraDistance`。

模型需要有效的 VRM Humanoid 骨架。身體同步使用 normalized 軀幹與四肢骨；手部同步另外使用 VRM 標準拇指、食指、中指、無名指與小指骨。缺少某個標準骨時，該段會維持模型原姿勢。臉部同步只會寫入模型實際提供的 VRM expression preset；模型沒有眨眼或母音表情時，對應動作不會顯示。

可先用 `?avatarDebug=1` 讓程式合成彎指、眨眼、張嘴與微笑訊號，確認新 VRM 的骨架及對應 preset；接著仍要關閉 debug，以真人攝影機逐側握拳、張手、眨眼、不同嘴型與微笑，確認追蹤及左右方向。

預設模型是 `public/models/magic-garden-guide.vrm`，作者為 NHRI。模型會隨公開 GitHub 專案與 GitHub Pages 網站發布。

GitHub Pages 專案網站位於 `/magic-garden-yoga/` 子路徑。設定檔中的資產 URL 是否要寫成根路徑、相對路徑或經程式解析的 base 路徑，必須與實際 `vite.config.ts` 和載入程式一致；不要只在 JSON 前面手動補上倉庫名稱。部署方式與驗證步驟見 [GitHub Pages 部署手冊](GITHUB_PAGES.md)。

### 新增到十關或更多

關卡數完全由 `poses` 陣列長度決定。新增流程：

1. 準備新引導圖。
2. 複製一個結構接近的完整 pose 物件。
3. 設定不重複的 `id`、名稱、說明、圖片與視角。
4. 依新姿勢重建 constraints，不要照抄不相符的目標。
5. 設定獨立 `scoreThreshold`、需要時設定 `holdSeconds`。
6. 把物件放到想要的關卡順序。
7. 重複到十個物件；不需要修改 React 畫面或狀態機。
8. 執行：

```bash
pnpm typecheck
pnpm test
pnpm build
```

9. 以 `?poseDebug=1` 完成每一關真人校準。
10. 檢查小螢幕上十個關卡圓點與整體版面是否仍可讀。

## 設定錯誤處理

[`../src/lib/config.ts`](../src/lib/config.ts) 會一次收集多個問題，例如：

- 欄位缺少或型別錯誤
- 數字超出範圍
- `orientation`、`axis`、`relation` 使用未知值
- landmark 名稱拼錯
- constraints 空陣列
- pose `id` 重複

若頁面顯示設定載入錯誤：

1. 在編輯器確認 JSON 語法。
2. 查看錯誤頁列出的所有路徑。
3. 執行 `pnpm test`，正式設定整合測試也會確認本機資產存在。
4. 修正後硬重新整理，避免舊 `game.json` 快取。

設定驗證只確認路徑是非空字串；實際檔案 404 會在 MediaPipe、圖片或 VRM 載入時才出現。
