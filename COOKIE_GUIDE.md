# 如何匯出 Facebook/Instagram Cookies

為了讓程式能模擬真人登入並抓取高解析度圖片，我們需要您提供瀏覽器的 Cookies。請依照以下步驟操作：

## 步驟 1：安裝瀏覽器擴充功能
我們推薦使用 **EditThisCookie**，這是一個安全且方便的 Cookie 管理工具。

*   **Chrome / Edge 使用者**：[前往 Chrome 線上應用程式商店下載](https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg)

## 步驟 2：登入 Facebook
1.  開啟瀏覽器，前往 [Facebook](https://www.facebook.com)。
2.  確認您已經**登入**您的帳號。
    *   建議使用您平常使用的帳號，以確保能看到公開或好友的貼文。

## 步驟 3：匯出 Cookies
1.  在瀏覽器右上角，點擊 **EditThisCookie** 的餅乾圖示 ![icon](https://lh3.googleusercontent.com/e5j8Yk8l8k8l8k8l8k8l8k8l8k8l8k8l=s60)。
2.  在跳出的選單中，找到**「匯出」 (Export)** 按鈕（圖示為一個門加上向出的箭頭 ➜🚪）。
    *   點擊後，Cookies 的內容（JSON 格式）會自動複製到您的剪貼簿。
    *   畫面可能會顯示「Cookies copied to clipboard」的提示。

## 步驟 4：貼上至專案
1.  回到您的程式碼編輯器 (VS Code)。
2.  開啟專案根目錄下的 `cookies.json` 檔案。
3.  將原本的內容全選並刪除。
4.  **貼上 (Ctrl+V)** 您剛剛複製的 JSON 內容。
5.  存檔 (`Ctrl+S`)。

## 常見問題
*   **格式錯誤？** 確保您貼上的是 `[` 開頭，`]` 結尾的 JSON 陣列。
*   **安全性？** `cookies.json` 包含您的登入憑證，請勿分享給他人。我們已將此檔案加入 `.gitignore`，因此不會被上傳到 GitHub。
*   **失效了？** Cookies 可能會過期（通常幾個月），若程式無法抓取圖片，請重新執行此流程更新 `cookies.json`。
