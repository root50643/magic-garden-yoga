# 專案文件索引

本目錄是「魔法花園瑜珈闖關」的建置、開發、設定與長期維護文件。

## 依工作情境閱讀

| 我想要…… | 請閱讀 |
| --- | --- |
| 第一次在 Windows 啟動專案 | [BUILD.md：第一次安裝](BUILD.md#第一次安裝) |
| 讓同一區網的其他電腦連線 | [BUILD.md：區域網路測試與 HTTPS](BUILD.md#區域網路測試與-https) |
| 產生正式版本或部署 | [BUILD.md：正式建置](BUILD.md#正式建置) |
| 發布到 GitHub Pages | [GITHUB_PAGES.md：GitHub Pages 部署手冊](GITHUB_PAGES.md) |
| 了解攝影機到評分與 VRM 的資料流 | [DEVELOPMENT.md：架構與資料流](DEVELOPMENT.md#架構與資料流) |
| 修改程式並執行測試 | [DEVELOPMENT.md：開發工作流程](DEVELOPMENT.md#開發工作流程) |
| 調整某一關的通過分數 | [CONFIGURATION.md：每關設定](CONFIGURATION.md#每關姿勢欄位) |
| 更換姿勢圖片、VRM 或新增到十關 | [CONFIGURATION.md：內容擴充](CONFIGURATION.md#更換圖片模型與新增關卡) |
| 校正低分或不容易通過的姿勢 | [CONFIGURATION.md：姿勢校正](CONFIGURATION.md#姿勢校正與-posedebug) |
| 更新 MediaPipe、Three.js 或 VRM 套件 | [MAINTENANCE.md：更新依賴](MAINTENANCE.md#依賴與模型更新) |
| 清除開發中的排行榜 | [MAINTENANCE.md：排行榜](MAINTENANCE.md#排行榜與-challengeid) |
| 排除 `ModuleFactory not set.` | [MAINTENANCE.md：疑難排解](MAINTENANCE.md#modulefactory-not-set) |
| 公開網站或 GitHub 前檢查授權與隱私 | [MAINTENANCE.md：安全、隱私與授權](MAINTENANCE.md#安全隱私與授權) |

設定欄位的唯一執行階段來源是 [`../public/config/game.json`](../public/config/game.json)，型別契約位於 [`../src/types.ts`](../src/types.ts)，驗證規則位於 [`../src/lib/config.ts`](../src/lib/config.ts)。如果文件、範例與程式不一致，應先確認這三個檔案，再同步修正文件與測試。
