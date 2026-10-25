# SkyBlock networth tracker

Every hour, checks your friends' Hypixel SkyBlock networth and adds a row per player to a Google Sheet.

## Setup (about 15 minutes)

1. **Hypixel API key**: log in at https://developer.hypixel.net and create a key.
2. **Google Sheet**: make a new blank sheet and copy its ID from the URL (the long string between `/d/` and `/edit`).
3. **Google service account**:
   - In https://console.cloud.google.com create a project, then enable the **Google Sheets API**.
   - Go to IAM & Admin > Service Accounts > create one, then Keys > Add key > JSON. Download the file.
   - Open your Sheet, click Share, and add the service account's email (it ends in `iam.gserviceaccount.com`) as an **Editor**.
4. **GitHub**: create a private repo and push this folder to it. Then in the repo go to Settings > Secrets and variables > Actions:
   - Secrets: `HYPIXEL_API_KEY`, `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (paste the whole JSON file contents)
   - Variables tab: `PLAYERS` = comma-separated Minecraft usernames, e.g. `Steve,Alex,Notch`
5. Open the Actions tab, pick "Hourly networth check", and hit **Run workflow** to test it. After that it runs every hour on its own.

## Notes

- Friends need **Inventory, Collections, and Skills API** turned on in SkyBlock settings (Settings > Personal > API Settings), or their networth will come out low. Those rows get a note in the last column.
- It tracks each player's currently selected profile.
- Columns: timestamp (Eastern), player, profile, networth, non-cosmetic networth, unsoulbound networth, purse, bank, note.
- GitHub pauses scheduled workflows on repos with no activity for 60 days; re-enable it from the Actions tab if that happens.
- Add or remove players any time by editing the `PLAYERS` variable.
