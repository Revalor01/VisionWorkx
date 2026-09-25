# Note for Machine B — VisionWorkx Clients (read-only) in revalor-admin

**From:** Machine A (VisionWorkx) · A4 VisionWorkx core · 2026-09-25
**Unblocks:** Change Map Prompt 7 (VisionWorkx Clients)

## How to read it
VisionWorkx module data lives in a **dedicated Supabase project** ("visionworkx-modules"),
not in the main VisionWorkx project revalor-admin already uses. revalor-admin gets **no
database key** for it. Instead it calls one read-only endpoint:

```
GET https://vision-workx.vercel.app/api/internal/modules-directory
Authorization: Bearer <MODULES_DIRECTORY_SECRET>
```
(Once DNS is live, `https://modules.revalorllc.com/api/internal/modules-directory` works too.)

- Same machine-to-machine pattern revalor-admin already uses for `/api/internal/media-spend`.
- **Env var for revalor-admin (Vercel):** `VISIONWORKX_MODULES_DIRECTORY_SECRET` — the same value
  as `MODULES_DIRECTORY_SECRET` on the vision-workx project. The user sets both.
- Server-side only. Never call it from the browser or ship the secret in client code.

## Response shape
```json
{
  "generated_at": "2026-09-25T20:00:00.000Z",
  "workspaces": [
    {
      "id": "uuid",
      "name": "Harbor & Pine Co.",
      "slug": "harbor-pine",
      "domains": ["harborpine.com", "www.harborpine.com"],
      "plan": "free | starter | growth | pro",
      "time_zone": "America/New_York",
      "created_at": "…",
      "workspace_url": "https://modules.revalorllc.com/workspace/harbor-pine",
      "logins": { "owners": 1, "staff": 0 },
      "submissions_30d": 12,
      "last_submission_at": "… | null",
      "modules": [
        {
          "public_id": "m_0123456789abcdef01",
          "type": "lead_capture | booking | quote_calculator | intake_form",
          "name": "Lead capture form",
          "status": "draft | live | paused",
          "created_at": "…",
          "updated_at": "…",
          "install_snippet": "<script src=\"https://modules.revalorllc.com/embed.js\" data-module=\"m_…\" async></script>"
        }
      ]
    }
  ]
}
```

## What it deliberately does NOT include
- Customer submissions or any personal data (names, emails, phone numbers).
- Webhook URLs or secrets, member emails.
Counts only. If the admin ever needs more, ask Machine A (the user) — don't add a database key.

## Rules
- **Read-only.** There is no write endpoint for revalor-admin. Creating workspaces, inviting logins
  and switching modules live happens in VisionWorkx at `/admin/modules` (operator only).
- A6 will add email usage per workspace (for "usage vs plan"); it'll be a new field here.
