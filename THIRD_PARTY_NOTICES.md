# 第三方授權與素材說明

本文件是開發交付備忘，不是法律意見。正式公開、散布或商用前，請由權利負責人重新確認每一項授權。

## SystemAnimatorOnline / XR Animator

- 專案：<https://github.com/ButzYung/SystemAnimatorOnline>
- 作者：Butz Yung / Anime Theme
- 上游 README 標示一般授權為 Creative Commons Attribution-NonCommercial-ShareAlike 4.0。
- 本遊戲只把該專案作為「單一攝影機全身追蹤帶動 VRM」的行為與可行性參考；新應用採獨立架構實作，沒有納入上游原始碼、第三方美術或音效。
- 為保留來源脈絡，本專案仍明確列出上述署名與連結。

## 執行階段套件

實際完整授權文字以 `node_modules` 中各套件發行檔與官方儲存庫為準。

| 套件 | 用途 | 套件標示授權 |
| --- | --- | --- |
| `@mediapipe/tasks-vision` | 本機身體、手部與臉部追蹤 | Apache-2.0 |
| `@pixiv/three-vrm` | VRM 載入與 humanoid API | MIT |
| `three` | WebGL 3D 顯示 | MIT |
| `react`、`react-dom` | UI | MIT |
| `vite`、`typescript`、`vitest` | 建置與測試 | MIT / Apache-2.0（依個別套件） |

本專案包含供瀏覽器本機載入的 MediaPipe Pose／Hand／Face Landmarker task 與其 WASM 執行檔；發布時應一併保留相應授權與通知。所有推論都在使用者瀏覽器本機執行。

### 顯示用 Hand／Face Landmarker 模型

下列模型只用來帶動 VRM 手指與表情，不納入瑜珈姿勢評分。專案保存固定版檔案，不在執行階段向 Google 下載：

| 專案檔案 | 官方固定版來源 | 位元組 | SHA-256 |
| --- | --- | ---: | --- |
| `public/models/hand_landmarker.task` | [MediaPipe Hand Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task) | 7,819,105 | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `public/models/face_landmarker.task` | [MediaPipe Face Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) | 3,758,596 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |

功能與輸出格式可參考 Google AI Edge 的 [Hand Landmarker Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) 與 [Face Landmarker Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)。若更新模型，應重新確認官方來源、授權、模型相容性、檔案大小與 SHA-256，並同步修改本表及維護文件。

## `magic-garden-guide.vrm`

`public/models/magic-garden-guide.vrm` 是本遊戲的公開 3D 引導角色：

- 作者：NHRI
- 用途：遊戲中的 3D 姿勢引導角色
- 發布位置：公開 GitHub 專案與 GitHub Pages 網站

## 姿勢卡與音效

- `public/assets/poses/*.png`：以內建 ImageGen 為本專案產生的五張原創引導插畫，沒有取用 SystemAnimatorOnline 素材。
- 互動聲音：由 `src/lib/audio.ts` 在瀏覽器即時合成，不包含外部音訊檔。
