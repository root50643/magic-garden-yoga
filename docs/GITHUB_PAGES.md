# GitHub Pages 部署手冊

本文件說明如何把「魔法花園瑜珈闖關」以 GitHub Actions 自動建置並部署到 GitHub Pages，以及發布後如何驗證攝影機、VRM、MediaPipe 與子路徑資產。

## 部署目標

規劃中的公開儲存庫與網站：

```text
Repository: https://github.com/root50643/magic-garden-yoga
Pages:      https://root50643.github.io/magic-garden-yoga/
Base path:  /magic-garden-yoga/
```

這是 GitHub Pages 的 project site，因此網站位於 repository 名稱對應的子路徑，不是 `root50643.github.io` 網域根目錄。只有在儲存庫建立、程式推送、Pages 設定完成且部署 workflow 成功後，Pages URL 才算正式上線。

## 已納入專案的部署設計

實際設定請以以下檔案為準：

- `.github/workflows/deploy-pages.yml`：自動檢查、建置與發布。
- `vite.config.ts`：讀取 `VITE_BASE_PATH` 作為 Vite `base`。
- `src/lib/publicAsset.ts`：替從 JSON 讀取的模型、圖片、MediaPipe task、WASM 與設定檔路徑補上部署 base。
- `public/config/game.json`：保留可讀的 public 資產路徑，不需要手動寫死 GitHub 帳號或 repository 名稱。

本機開發未設定 `VITE_BASE_PATH` 時使用 `/`，所以仍可從
<http://localhost:5173/> 開啟。Pages workflow 在正式建置時設定：

```text
VITE_BASE_PATH=/magic-garden-yoga/
```

Vite 會調整 `index.html`、JavaScript 與 CSS 的建置 URL；`resolvePublicAssetPath()` 則處理 Vite 無法自動改寫的 JSON 字串路徑。兩者缺一都可能造成部分資產 404。

## 自動部署流程

目前 workflow 會在以下情況啟動：

- push 到 `main`。
- 從 GitHub 的 Actions 頁面手動執行 `workflow_dispatch`。

build job 依序：

1. checkout repository。
2. 安裝 pnpm 11.9.0。
3. 使用 Node.js 22 並啟用 pnpm cache。
4. 執行 `pnpm install --frozen-lockfile`。
5. 執行 `pnpm typecheck`。
6. 執行 `pnpm test`。
7. 設定 GitHub Pages build metadata。
8. 以 `/magic-garden-yoga/` 為 base 執行 `pnpm build`。
9. 將 `dist/` 上傳為 Pages artifact。

只有 build job 全部成功，deploy job 才會把 artifact 發布到
`github-pages` environment。workflow 使用 GitHub 提供的
`GITHUB_TOKEN` 權限，不需要把個人 access token、密碼或其他秘密寫進 repository。

目前 workflow 使用的 Actions major 版本如下：

| Action | 版本 |
| --- | --- |
| `actions/checkout` | `v7` |
| `pnpm/action-setup` | `v6` |
| `actions/setup-node` | `v7` |
| `actions/configure-pages` | `v6` |
| `actions/upload-pages-artifact` | `v5` |
| `actions/deploy-pages` | `v5` |

更新 workflow 時應同步本表；實際執行版本仍以
`.github/workflows/deploy-pages.yml` 為準。

## 第一次啟用 Pages

程式推送到公開 repository 後，以有管理權限的 GitHub 帳號操作：

1. 開啟 repository 的 **Settings**。
2. 在 **Code and automation** 區域選擇 **Pages**。
3. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
4. 開啟 **Actions**，找到 **Deploy to GitHub Pages**。
5. 若 push 到 `main` 尚未觸發，可使用 **Run workflow** 手動執行一次。
6. 等待 build 與 deploy jobs 都成功。
7. 從 deploy job 的 environment URL 或 Settings → Pages 開啟正式網址。
8. 確認 **Enforce HTTPS** 已啟用；`github.io` 網址一般會自動提供 HTTPS。

不要選擇「Deploy from a branch」或把 `docs/` 當靜態發布來源；本專案需要 Vite build，正式成品是 workflow 產生的 `dist/` artifact。

## 在本機模擬 Pages 建置

一般檢查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

若要在 PowerShell 模擬 Pages 使用的 base：

```powershell
$env:VITE_BASE_PATH = "/magic-garden-yoga/"
pnpm build
pnpm preview
```

開啟：

```text
http://localhost:4173/magic-garden-yoga/
```

完成後移除該 shell 的暫時環境變數：

```powershell
Remove-Item Env:VITE_BASE_PATH
```

POSIX shell：

```bash
VITE_BASE_PATH=/magic-garden-yoga/ pnpm build
VITE_BASE_PATH=/magic-garden-yoga/ pnpm preview
```

本機 preview 只能驗證正式 build 的路徑與執行結果；它不會模擬 GitHub Pages 的 environment、權限、憑證與 CDN 快取。

## HTTPS 與攝影機

瀏覽器的 `getUserMedia()` 一般需要 secure context。正式
`https://root50643.github.io/magic-garden-yoga/` 使用 HTTPS，因此桌面版 Chrome／Edge 可以要求攝影機權限。

首次驗收：

1. 確認網址列是 `https://`，沒有憑證或 mixed-content 警告。
2. 在網站要求權限時選擇允許攝影機。
3. 若曾封鎖，從網址列的網站權限清除或改為允許，再重新載入。
4. 確認畫面顯示鏡像攝影機、骨架與 VRM，而不是只顯示其中一項。
5. 完成至少一個姿勢，確認 Worker 推論、分數與保持計時均正常。
6. 在 Chrome 與 Edge 各驗證一次；再用一台未快取過網站的電腦進行完整五關測試。

GitHub Pages 網址與 localhost 是不同 origin，攝影機權限不會沿用。若未來把網站放進另一個頁面的 iframe，父頁還必須允許 camera，且 Permissions Policy 不可阻擋。

## 發布前檢查

- [ ] repository owner 與名稱仍為 `root50643/magic-garden-yoga`。
- [ ] workflow 中的 `VITE_BASE_PATH` 仍與 `/magic-garden-yoga/` 一致。
- [ ] `public/config/game.json` 的模型、圖片、task 與 WASM 路徑全部存在。
- [ ] `public/models/magic-garden-guide.vrm` 已納入提交，檔名大小寫完全一致。
- [ ] `pnpm install --frozen-lockfile`、typecheck、test、build 全部通過。
- [ ] repository 未包含憑證、token、`.env`、攝影機截圖或學生個資。
- [ ] 模型、姿勢圖片與 `THIRD_PARTY_NOTICES.md` 的檔名及作者資訊一致。
- [ ] Settings → Pages 的 Source 是 GitHub Actions。

## 發布後檢查

在 DevTools 的 Network 開啟 **Disable cache** 後重新載入，確認：

- [ ] 頁面 URL 位於 `/magic-garden-yoga/`。
- [ ] HTML、JS、CSS、`config/game.json` 都回應 200。
- [ ] `magic-garden-guide.vrm`、五張姿勢圖與
  `pose_landmarker_full.task` 回應 200。
- [ ] MediaPipe WASM loader 與 `.wasm` 回應 200；`.wasm` 使用合理 MIME。
- [ ] Console 沒有 404、mixed content、Worker、WebAssembly 或 WebGL 錯誤。
- [ ] 攝影機權限、單人／多人提示、全身入鏡與分數都正常。
- [ ] VRM 左右手腳、鏡像顯示與每關門檻符合設定。
- [ ] 重新載入頁面後遊戲仍能初始化。

建議記錄成功部署的 commit SHA、日期、Pages URL、`challengeId` 與模型版本。這能在日後更新造成問題時快速比對或回滾。

## 常見問題

### 首頁或 JavaScript／CSS 404

- 確認開啟的是含尾端 `/` 的
  `https://root50643.github.io/magic-garden-yoga/`。
- 檢查 workflow build job 的 `VITE_BASE_PATH`。
- 檢查 build log 是否真的在該環境變數下執行 `pnpm build`。
- 若 repository 曾改名，必須同步更新 base、預計 URL 與文件，再重新建置。
- 不要把本機以 `/` 建出的 `dist/` 手動上傳來取代 workflow artifact。

### 頁面可開，但 VRM、姿勢圖、設定或 WASM 404

這通常表示 Vite bundle base 正確，但執行階段 public 資產路徑沒有經過
`resolvePublicAssetPath()`：

1. 在 Network 記下失敗 URL；若它從網域根目錄 `/models/...` 或
   `/config/...` 開始而缺少 `/magic-garden-yoga/`，優先檢查路徑解析。
2. 確認載入設定、VRM、姿勢圖、task 與 WASM 的程式都使用共用 resolver。
3. 確認 `dist/` 中存在對應檔案，並檢查 Linux runner 對大小寫敏感的檔名。
4. 不要直接把 JSON 每個路徑硬編碼成 repository 名稱；那會破壞 localhost 與未來自訂網域。

### 顯示 `ModuleFactory not set.`

- 先在 Network 檢查 MediaPipe loader 與 WASM 是否 200，而不是 404 回傳的 HTML。
- 確認 task／WASM 路徑含 Pages base，且 JS、WASM 的內容與套件版本相容。
- 清除網站資料或使用無痕視窗排除舊 loader 快取。
- 比對本機 Pages-base preview；若本機也失敗，先修正 build／路徑，不要反覆重新部署。

更多 MediaPipe 排錯見 [維護手冊](MAINTENANCE.md#modulefactory-not-set)。

### Actions 安裝或測試失敗

- `pnpm install --frozen-lockfile` 失敗時，確認 `package.json` 與
  `pnpm-lock.yaml` 已一起提交。
- typecheck 或 test 失敗就先在本機重現；不要略過檢查直接部署。
- Windows 本機正常、Linux runner 404 時，優先檢查檔名大小寫與路徑分隔符。
- 如果 workflow action 版本日後需要更新，依官方 release／文件升級並重新跑完整驗收，不要只改版本號後直接假設相容。

### build 成功但 deploy 失敗

- 確認 Settings → Pages 的 Source 是 **GitHub Actions**。
- 確認 workflow 有 `contents: read`、`pages: write` 與
  `id-token: write`。
- 確認 deploy job 使用 `github-pages` environment，且沒有等待尚未核准的保護規則。
- 確認 build job 已成功上傳 Pages artifact，deploy job 也正確依賴 build。
- 從 Actions 的失敗 job 展開實際錯誤，不要只看 repository 首頁的紅色狀態。

### 網站仍顯示舊版本

- 確認最新 main commit 對應的 workflow 已完成 deploy，不是只有 build 成功。
- 以無痕視窗或停用快取重新測試。
- 檢查是否在舊的 repository URL、自訂網域或另一個 origin。
- 大型 public 資產沒有 Vite 雜湊；若同檔名內容更新後仍被快取，可改用新的語意化版本檔名並同步設定。

### 攝影機被拒絕或不存在

- 必須使用正式 `https://` URL；不要把 Pages URL 改成 `http://`。
- 檢查瀏覽器網站權限、Windows 相機隱私設定及其他程式是否占用鏡頭。
- 確認網站不是被不允許 camera 的 iframe 包住。
- 詳細順序見 [維護手冊](MAINTENANCE.md#攝影機無法使用)。

## Repository 改名、自訂網域與回滾

若 repository 改名，至少同步修改：

1. workflow 的 `VITE_BASE_PATH`。
2. README 與本文件的 repository／Pages URL。
3. 本機 Pages-base 驗收命令。
4. GitHub Settings → Pages 顯示的正式 URL。

若改用自訂網域，Vite base 通常會回到 `/`，但仍應以實際 URL 結構為準。自訂網域必須在 GitHub Pages 設定中配置；只提交 `CNAME` 或只改 DNS 都不足以完成所有設定。切換後重新驗證 HTTPS 憑證、mixed content、資產 URL 與攝影機權限。

需要回滾時，將 `main` 還原到已知正常內容（建議建立 revert commit），讓同一 workflow 重新建置與部署；不要把開發電腦殘留的舊 `dist/` 手動覆蓋上去。回滾後仍須執行發布後檢查。

## 官方參考

- [Vite：Deploying a Static Site](https://vite.dev/guide/static-deploy.html)
- [Vite：Public Base Path](https://vite.dev/guide/build.html#public-base-path)
- [GitHub：Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub：Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub：Securing your GitHub Pages site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
