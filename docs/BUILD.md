# 建置與執行

本文件涵蓋第一次安裝、日常開發、區域網路測試、正式建置與靜態部署。命令預設從專案根目錄執行。

## 前置需求

| 項目 | 最低需求 | 建議 |
| --- | --- | --- |
| 作業系統 | Windows 10/11、macOS 或一般 Linux | Windows 11 |
| Node.js | 20.19 | 目前維護中的 Node.js LTS |
| pnpm | 專案指定 `pnpm@11.9.0` | 由 Corepack 管理 |
| 瀏覽器 | 支援 WebAssembly、module Web Worker、WebGL、`getUserMedia`、`createImageBitmap` 與 `OffscreenCanvas` | 最新桌面版 Chrome 或 Edge |
| 攝影機 | 瀏覽器可存取的單一攝影機 | 720p、可拍到玩家全身 |

確認版本：

```bash
node --version
pnpm --version
```

若已安裝 Node.js，但沒有 pnpm，可使用 Node.js 隨附的 Corepack：

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

在部分 Windows 安裝環境中，`corepack enable` 需要以系統管理員身分開啟 PowerShell。也可以依 pnpm 官方方式安裝，但不要同時混用 npm、Yarn 與 pnpm 修改鎖定檔。

## 第一次安裝

在 PowerShell、Windows Terminal 或一般 shell 中執行：

```bash
pnpm install
pnpm dev
```

成功時 Vite 會列出類似資訊：

```text
Local:   http://localhost:5173/
Network: http://192.168.1.20:5173/
```

在開發電腦開啟 <http://localhost:5173/>，允許攝影機權限。第一次啟動要載入約數十 MB 的 VRM、MediaPipe 模型與 WASM，速度取決於磁碟、網路與瀏覽器快取。

### 啟動前的必要資產

設定檔預設會引用：

```text
public/config/game.json
public/models/magic-garden-guide.vrm
public/models/pose_landmarker_full.task
public/models/hand_landmarker.task
public/models/face_landmarker.task
public/mediapipe/wasm/
public/assets/poses/*.png
```

`pnpm install` 只安裝套件，不會重新下載這些專案資產。若資產被移除，設定檔整合測試或瀏覽器載入會失敗。

Hand／Face Landmarker 分別約 7.46 MiB 與 3.58 MiB。兩者只負責 VRM 手指與表情顯示，可由 `avatarTracking` 關閉；Pose Landmarker 與瑜珈評分仍能獨立運作。模型的固定來源與 SHA-256 見 [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

GitHub Pages 首次造訪還需要下載 VRM、WASM 與多個 task；較慢的網路可能需要一分鐘以上。`avatarTracking.initializationTimeoutMs` 預設為 120000，避免把仍在下載或編譯的 Hand／Face 模型誤判為失敗。

程式以 `cache: "no-store"` 讀取 `game.json`，避免 Pages 部署後出現新 JavaScript 搭配舊設定快取；新增設定欄位時仍應提供合理的向下相容預設，確保 CDN 節點短暫不同步時不會中斷整個遊戲。

`public/models/magic-garden-guide.vrm` 是作者 NHRI 製作的 3D 引導角色，會隨公開 GitHub 專案與 GitHub Pages 網站發布，因此正常 clone 後可直接取得。

## 開發伺服器

執行：

```bash
pnpm dev
```

目前 [`../vite.config.ts`](../vite.config.ts) 的開發設定為：

```ts
server: {
  host: "0.0.0.0",
  port: 5173,
}
```

`0.0.0.0` 是「監聽所有本機網路介面」，不是瀏覽器應輸入的網址。在本機使用 `http://localhost:5173/`；其他電腦應輸入開發機的實際 IPv4 位址，例如 `http://192.168.1.20:5173/`。

若 5173 已被占用，Vite 可能自動改用其他連接埠。請以終端機實際顯示的 URL 為準。要找出占用程式，可在 PowerShell 執行：

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
```

停止開發伺服器請回到終端機按 `Ctrl+C`。

## 區域網路測試與 HTTPS

### 1. 找出開發機位址

Windows：

```powershell
ipconfig
```

尋找目前有連線的 Wi-Fi 或乙太網路介面，其 IPv4 位址通常是 `192.168.x.x`、`10.x.x.x` 或 `172.16.x.x` 至 `172.31.x.x`。

Linux 可使用：

```bash
ip addr
```

macOS 可使用：

```bash
ipconfig getifaddr en0
```

若 macOS 使用有線網路或不同介面，可用 `ifconfig` 找出目前介面的 IPv4 位址。

### 2. 確認網路可達

- 兩台電腦需位於可互通的同一 LAN／VLAN。
- 訪客 Wi-Fi 常啟用用戶端隔離，即使在同一 SSID 也無法互連。
- VPN、公司代理、防毒軟體或 Windows 防火牆可能阻擋 5173。
- 開發伺服器必須保持執行；電腦睡眠後會中斷。

如需在 Windows 防火牆建立暫時的 5173 TCP 輸入規則，可用「系統管理員 PowerShell」執行：

```powershell
New-NetFirewallRule -DisplayName "Magic Garden Yoga Vite 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
```

測試結束後移除該規則：

```powershell
Remove-NetFirewallRule -DisplayName "Magic Garden Yoga Vite 5173"
```

只應在受信任的私人網路使用這項規則，不要把開發伺服器直接暴露到公網。

### 3. 攝影機的安全來源限制

`http://localhost` 被瀏覽器視為特殊的可信來源，因此本機 HTTP 可以要求攝影機權限。另一台電腦開啟 `http://192.168.x.x:5173` 時，通常不屬於安全來源，頁面雖能顯示，`navigator.mediaDevices.getUserMedia` 仍可能不可用。

正式或一般測試的正確方式是使用 HTTPS：

- 由校內反向代理或 Web 伺服器終止 TLS，再代理到 Vite。
- 使用受測試電腦信任的開發憑證。
- 把正式建置部署到具有有效 HTTPS 憑證的靜態網站。

受控測試環境也可以由管理者把特定 HTTP origin 標記成安全來源，但這會降低瀏覽器原本的安全保護，只適合封閉、短期且明確知道風險的測試。不要要求一般使用者停用安全設定。

此外，瀏覽器權限是以完整 origin 保存：協定、主機與連接埠任一改變，都可能需要重新允許攝影機。

## 品質檢查

### 型別檢查

```bash
pnpm typecheck
```

此命令執行 TypeScript project references。任何錯誤都應在合併或發布前修正。

### 單元與整合測試

```bash
pnpm test
```

若要在不使用真人手部／臉部資料的情況下，目視檢查 VRM 是否有手指骨與表情 preset，可在 dev 或 preview URL 加上 `?avatarDebug=1`。例如：

```text
http://localhost:5173/?avatarDebug=1
```

此模式只合成顯示資料，不會停用 Pose Tracker，也不會繞過攝影機與遊戲 ready 條件；它不能取代 MediaPipe task、左右手、遮擋與效能的真人驗收。

持續開發時可使用監看模式：

```bash
pnpm test:watch
```

### 一次執行全部必要檢查

PowerShell：

```powershell
pnpm typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm build
```

一般 POSIX shell：

```bash
pnpm typecheck && pnpm test && pnpm build
```

將命令分行執行更容易看出是哪一階段失敗。

## 正式建置

執行：

```bash
pnpm build
```

腳本會先執行 `tsc -b`，成功後再由 Vite 產生 `dist/`。`dist/` 是衍生檔，已被 `.gitignore` 排除，不應手動修改或提交。

建置內容包含：

- 經雜湊命名的 JavaScript／CSS 應用程式資產。
- `public/` 下原樣複製的 `config`、姿勢圖片、VRM、MediaPipe task 與 WASM。
- 根目錄的 `index.html`。

請注意 VRM 與姿勢模型可能讓 `dist/` 很大；建置工具提示大 chunk 不一定代表錯誤，但正式伺服器應啟用壓縮與合理快取。

### 預覽建置結果

```bash
pnpm preview
```

目前預覽伺服器監聽 `0.0.0.0:4173`。本機網址為 <http://localhost:4173/>；LAN 與 HTTPS 注意事項與開發伺服器相同。

`vite preview` 是驗收工具，不具備正式伺服器的安全強化、程序監控、TLS、存取紀錄與維運能力，不應直接公開到網際網路。

## 靜態部署

本應用不需要 Node.js 後端；將 `dist/` 完整部署到支援 HTTPS 的靜態 Web 伺服器即可。部署時不可只上傳 `index.html` 與 JavaScript，還必須包含：

```text
dist/assets/
dist/config/game.json
dist/assets/poses/
dist/models/
dist/mediapipe/wasm/
```

建議：

- 以網域根目錄部署，例如 `https://yoga.example.edu.tw/`。
- `index.html` 與 `config/game.json` 使用短快取或 `no-cache`，避免更新後仍讀到舊設定。
- Vite 產生的雜湊 JS/CSS 可使用長快取。
- VRM、`.task` 與 WASM 沒有內容雜湊；更新時可更換檔名並同步設定，或清除 CDN 快取。
- `.wasm` 回應的 MIME 類型應為 `application/wasm`，JavaScript 應使用 JavaScript MIME。
- 啟用 HTTPS，並避免加入會阻擋 Worker、WASM 或 blob URL 的過嚴 Content Security Policy。

設定中的資產路徑目前以 `/` 開頭，代表網站根目錄。若必須部署到 `https://example.edu.tw/yoga/` 之類子路徑，需要一併規劃 Vite `base` 與所有設定資產 URL；不要只把 `dist/` 搬到子目錄後期待絕對路徑自動改變。

## GitHub Pages

預計專案網站位於：

```text
https://root50643.github.io/magic-garden-yoga/
```

GitHub Pages 的 project site 位於 `/magic-garden-yoga/` 子路徑，不是網域根目錄。因此必須同時處理 Vite `base` 與執行階段的設定／模型／圖片／WASM 路徑。部署採 GitHub Actions 自動執行安裝、檢查、建置與 Pages 發布；工作流程檔與 `vite.config.ts` 才是實際部署參數的來源，不要只依文件範例推測目前狀態。

完整的初次設定、Actions 權限、HTTPS 攝影機驗收、發布檢查與 404 排錯請見
[GitHub Pages 部署手冊](GITHUB_PAGES.md)。在 Actions 成功完成且 Pages 顯示正式網址以前，不應把預計網址標示為已上線。

## 建置常見問題

### `pnpm` 不是可辨識的命令

重新開啟終端機後再執行 Corepack 安裝步驟；確認 `node --version` 正常。公司電腦若限制全域工具，請由管理者安裝。

### Node.js 版本太舊

Vite 8 與相關工具需要新版 Node.js。升級到受支援的 LTS，刪除與重裝 `node_modules` 前先保留 `pnpm-lock.yaml`：

```bash
pnpm install --frozen-lockfile
```

若鎖定檔與 `package.json` 確實不同步，維護者才應執行一般 `pnpm install` 更新鎖定檔並完整測試。

### 建置成功但模型或圖片 404

檢查 `public/config/game.json` 的 URL、檔名大小寫與部署根路徑。Windows 檔案系統通常不區分大小寫，但 Linux Web 伺服器會區分。

### 頁面能開，但攝影機不存在

先確認網址是 `localhost` 或 HTTPS，再確認瀏覽器權限。完整排除流程請見[維護手冊](MAINTENANCE.md#攝影機無法使用)。
