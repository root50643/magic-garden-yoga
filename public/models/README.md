# VRM 模型

本遊戲的正式引導角色位於：

```text
public/models/magic-garden-guide.vrm
```

作者為 NHRI。模型會隨公開 GitHub 專案與 GitHub Pages 網站發布。

若要更換模型：

1. 將新模型放入本目錄，使用能描述角色用途且適合 URL 的檔名。
2. 更新 `public/config/game.json` 的 `avatar.modelPath`。
3. 執行測試與正式建置，確認模型能從實際部署子路徑載入。
4. 更新 `THIRD_PARTY_NOTICES.md` 中的模型名稱與作者資訊。
