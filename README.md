# TextFlow

**Your entire digital life, one text away.**

TextFlow is an SMS-native personal AI agent. Text it like a friend, and it handles your digital life — sending emails, managing calendars, setting reminders, controlling smart home devices, and more — all through plain text messages powered by Claude, Twilio, and Zapier.

## Architecture Overview

```
User (SMS) → Twilio → Node.js/Express → Claude API → Zapier → 7,000+ Apps
                                ↕                        ↕
                           PostgreSQL               User's Apps
                             Redis                (Gmail, Calendar,
                             BullMQ               Slack, Notion, etc.)
```

## Tech Stack

| Layer          | Technology        |
|----------------|-------------------|
| SMS            | Twilio            |
| AI             | Claude API        |
| Integrations   | Zapier            |
| Backend        | Node.js / Express |
| Database       | PostgreSQL        |
| Cache          | Redis             |
| Job Queue      | BullMQ            |
| Web Dashboard  | Next.js           |

## Setup

```bash
# 1. Clone the repo
git clone <repo-url> && cd Wingman

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Start PostgreSQL and Redis
# (ensure both are running locally or update DATABASE_URL / REDIS_URL)

# 5. Run development servers
npm run dev
```

## Project Structure

```
textflow/
├── package.json          # Root workspace config
├── .env.example          # Environment variable template
├── docs/
│   └── architecture.md   # Detailed architecture documentation
├── server/               # Express API + SMS handling + Claude + Zapier
│   ├── src/
│   │   ├── routes/       # Express route handlers
│   │   ├── services/     # Claude, Twilio, Zapier service modules
│   │   ├── models/       # Database models
│   │   ├── jobs/         # BullMQ job processors
│   │   └── utils/        # Shared utilities
│   └── package.json
└── web/                  # Next.js dashboard for Zapier connect + settings
    ├── src/
    │   ├── app/          # Next.js app router pages
    │   └── components/   # React components
    └── package.json
```

## MVP Phases

1. **Phase 1 — SMS Echo + Claude**: Accept SMS via Twilio, respond with Claude. Basic conversation memory in PostgreSQL.
2. **Phase 2 — Zapier Integration**: Connect user accounts via Zapier embed. Claude uses tool-calling to trigger Zapier actions (send email, create calendar event, etc.).
3. **Phase 3 — Proactive Agent**: Scheduled reminders, daily briefings, and background jobs via BullMQ. Users manage preferences through SMS commands.
4. **Phase 4 — Dashboard + Polish**: Next.js web dashboard for Zapier account connection, conversation history, and settings management.

## Documentation

See [docs/architecture.md](docs/architecture.md) for detailed architecture and design decisions.
