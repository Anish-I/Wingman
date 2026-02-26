# TextFlow Architecture

## Core Design: Zapier as Invisible Infrastructure

TextFlow treats Zapier as invisible middleware. Users never see or interact with Zapier directly — they just text. Behind the scenes, Claude decides which actions to take and Zapier executes them across 7,000+ apps.

The key insight: users get a single SMS interface to their entire digital life, while Zapier handles the complexity of connecting to every third-party service.

## Per-User Shadow Zapier Account Model

Each TextFlow user gets a "shadow" Zapier connection:

1. **Onboarding**: User texts TextFlow for the first time. We create a user record and send them a one-time link to the Next.js connect page.
2. **Zapier Embed**: On the connect page, users authenticate their apps (Gmail, Google Calendar, Slack, etc.) through Zapier's embedded UI. Tokens are stored on Zapier's side.
3. **Action Execution**: When Claude decides to take an action, we call Zapier's API with the user's access token. Zapier handles OAuth, rate limits, and API changes for every connected service.
4. **No Zaps Required**: We use Zapier's AI Actions / NLA (Natural Language Actions) API — no traditional Zap setup needed.

## Claude Tool Use → Zapier Action Mapping

When Claude processes a user's message, it selects from registered tools. Each tool maps to a Zapier action:

| Claude Tool            | Zapier Action              | Example Trigger                          |
|------------------------|----------------------------|------------------------------------------|
| `send_email`           | Gmail: Send Email          | "Email John the meeting notes"           |
| `create_calendar_event`| Google Calendar: Create Event | "Schedule lunch with Sarah tomorrow at noon" |
| `send_slack_message`   | Slack: Send Message        | "Tell the team standup is cancelled"     |
| `create_reminder`      | Internal (BullMQ)          | "Remind me to call mom at 5pm"           |
| `create_note`          | Notion: Create Page        | "Save this recipe idea to my notes"      |
| `check_calendar`       | Google Calendar: Find Event | "What do I have going on tomorrow?"      |
| `search_email`         | Gmail: Find Email          | "Did I get a reply from the contractor?" |

Claude sees these as standard tool definitions. It decides when and how to call them based on the conversation context.

## Message Flow

```
1. User sends SMS
       │
       ▼
2. Twilio receives SMS, POSTs to /api/webhooks/twilio
       │
       ▼
3. Express middleware:
   - Validates Twilio signature
   - Looks up or creates user by phone number
   - Loads conversation history from PostgreSQL
       │
       ▼
4. Claude API call:
   - System prompt with user context + available tools
   - Conversation history as messages
   - Tool definitions for all connected Zapier actions
       │
       ▼
5. Claude responds (may include tool_use blocks):
   - If tool_use → execute via Zapier API → return tool_result → Claude continues
   - If text only → send as SMS reply
       │
       ▼
6. Response sent via Twilio SMS
       │
       ▼
7. Conversation stored in PostgreSQL
```

## Data Model Overview

### users
- `id` (UUID, PK)
- `phone_number` (unique, E.164 format)
- `zapier_access_token` (encrypted)
- `timezone`
- `preferences` (JSONB)
- `created_at`, `updated_at`

### conversations
- `id` (UUID, PK)
- `user_id` (FK → users)
- `created_at`

### messages
- `id` (UUID, PK)
- `conversation_id` (FK → conversations)
- `role` (enum: user, assistant, tool)
- `content` (text)
- `tool_calls` (JSONB, nullable)
- `tool_results` (JSONB, nullable)
- `created_at`

### connected_apps
- `id` (UUID, PK)
- `user_id` (FK → users)
- `app_name` (e.g. "gmail", "google_calendar")
- `zapier_action_id`
- `connected_at`

### reminders
- `id` (UUID, PK)
- `user_id` (FK → users)
- `message` (text)
- `scheduled_at` (timestamptz)
- `sent` (boolean)
- `created_at`
