# Native 儲存邊界

`credentials.ts` 使用 Expo SecureStore 保存單一目前帳號的 refresh token，key 包含 API 位址的 SHA-256，以隔離環境；切換帳號先登出並清除該 slot。iOS 使用 WHEN_UNLOCKED_THIS_DEVICE_ONLY。

access token、使用者資料與查詢快取只放記憶體。Web 預覽不保存憑證，登入停用。尚無 SQLite、持久化查詢或離線 outbox。

未來待送支出須另建帳號／環境隔離的 SQLite outbox，不能被清除查詢快取一併刪除。更多要求見 [後端契約](../../docs/BACKEND_CONTRACT.md)。
