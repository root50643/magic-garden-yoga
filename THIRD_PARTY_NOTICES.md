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
| `@mediapipe/tasks-vision` | 本機姿勢關鍵點偵測 | Apache-2.0 |
| `@pixiv/three-vrm` | VRM 載入與 humanoid API | MIT |
| `three` | WebGL 3D 顯示 | MIT |
| `react`、`react-dom` | UI | MIT |
| `vite`、`typescript`、`vitest` | 建置與測試 | MIT / Apache-2.0（依個別套件） |

本專案包含供瀏覽器本機載入的 MediaPipe Pose Landmarker task 與其 WASM 執行檔；發布時應一併保留相應授權與通知。

## `magic-garden-guide.vrm`

`public/models/magic-garden-guide.vrm` 是本遊戲的公開 3D 引導角色：

- 作者：NHRI
- 用途：遊戲中的 3D 姿勢引導角色
- 發布位置：公開 GitHub 專案與 GitHub Pages 網站

## 姿勢卡與音效

- `public/assets/poses/*.png`：以內建 ImageGen 為本專案產生的五張原創引導插畫，沒有取用 SystemAnimatorOnline 素材。
- 互動聲音：由 `src/lib/audio.ts` 在瀏覽器即時合成，不包含外部音訊檔。
