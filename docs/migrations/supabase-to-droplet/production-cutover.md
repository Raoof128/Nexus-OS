# Nexus production cutover

Production switched to standalone PostgreSQL 17.12 and Better Auth on 17 November 2026. Cloudflare Pages serves deployment `d9c729cf` from application release `f2dabf1`. The standalone API runs behind the existing Worker and Nginx. PostgreSQL and Better Auth are accessible on the Nexus Docker network.

The transfer included 475 records across the 12 Nexus tables and the account that owns those records. The owner’s UUID, existing password hash, and data encryption key were preserved. A second account without Nexus records was excluded at the operator’s direction. The scoped encrypted backups are stored off the droplet. The final snapshot taken during the write freeze matched the staged restore.

## Verification

- Staging delivered both verification and recovery emails to the canary mailbox. The reset link worked once, revoked the old session, and set a working replacement password. A bcrypt fixture verified legacy password compatibility.
- Production health, secure-cookie sign-in, Media Vault, persisted theme and wallpaper, Notes, chat sessions, and the cached Inbox passed. A live Chromium session with a controlled Sydney clock saw one reminder across two open tabs. Four concurrent task completions produced one successor with the scheduled due time.
- Gemini rejected the existing production API key. Replacing the credential is required for generated chat replies. Gmail and Outlook provider OAuth were disabled in the existing production configuration.

## Operations

- Keep using the current Cloudflare Pages project and `codex/bootstrap` Pages production branch. Set `VITE_NEXUS_AUTH=standalone` for manual builds. GitHub uses the `NEXUS_AUTH_MODE` repository variable for this setting.
- Backend restarts use `/opt/nexus/standalone-release/api.env` and the `nexus-standalone` network. The existing source credentials and API image belong to the stopped rollback container. Deploying the old environment would switch Nexus back to Supabase.
- The historical source is shared with other apps. Retain it and the encrypted transfer snapshots. The previous Pages release `397ff81c` and the stopped Nexus API are available for rollback. Reconcile writes accepted by the standalone database before directing production traffic back to the old source.
