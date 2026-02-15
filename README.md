# Spectarr

A self-hosted web application that identifies physical media from photographs of your shelves. Snap a photo (or upload one) of a shelf full of DVDs, Blu-rays, TV show box sets, vinyl records, or video games, and Spectarr will use an LLM to identify each item, enrich it with metadata from TMDB and TVDB, and optionally cross-reference everything against your Plex library.

## Features

- **AI-powered identification** -- Upload or capture a photo and an LLM vision model identifies every item on the shelf.
- **Multi-model support** -- Choose between Claude Sonnet 4, GPT-4o, or Gemini 2.0 Flash via OpenRouter.
- **Rich metadata enrichment** -- Each identified item is automatically enriched with posters, ratings, genres, cast, and more from TMDB and TVDB.
- **Plex library cross-reference** -- See at a glance which items are already in your Plex library.
- **Scan history** -- Browse, search, and revisit past scans.
- **Re-scan and re-enrich** -- Re-run LLM analysis or metadata enrichment on any previous scan.
- **Inline editing** -- Correct any misidentified item and re-enrich with a single click.
- **CSV and JSON export** -- Export scan results for use in spreadsheets or other tools.
- **Cost tracking** -- Monitor per-model LLM spend with a built-in usage dashboard.
- **Light and dark mode** -- Automatic theme detection with manual toggle.
- **Fully self-hosted** -- All data stays on your machine in a local SQLite database.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State | TanStack React Query v5 |
| Real-time | Server-Sent Events (SSE) |
| LLM | OpenRouter API |
| Metadata | TMDB, TVDB |
| Media Server | Plex (optional) |

## Getting Started

### Prerequisites

- Node.js 20+
- An [OpenRouter](https://openrouter.ai/keys) API key
- A [TMDB](https://www.themoviedb.org/settings/api) API Read Access Token

### Installation

```bash
git clone https://github.com/HMilbradt/spectarr.git
cd spectarr
npm install
```

### Configuration

Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env.local
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key for LLM image analysis via OpenRouter |
| `TMDB_API_KEY` | TMDB API Read Access Token (the long form, not the short API key) |

**Optional variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `TVDB_API_KEY` | TVDB API key for cross-referencing TVDB IDs | -- |
| `PLEX_URL` | Plex server URL (e.g. `http://192.168.1.100:32400`) | -- |
| `PLEX_TOKEN` | Plex authentication token ([how to find](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)) | -- |
| `LOG_LEVEL` | Server log verbosity: `debug`, `info`, `warn`, `error`, `silent` | `silent` |
| `DATABASE_PATH` | Override the SQLite database file location | `./data/spectarr.db` |
| `OPENROUTER_BASE_URL` | Override the OpenRouter API base URL | `https://openrouter.ai/api/v1` |
| `OPENROUTER_REFERER` | Override the HTTP-Referer header sent to OpenRouter | `http://localhost:3000` |

### Running

```bash
# Development (with Turbopack)
npm run dev

# Production
npm run build
npm run start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Docker

The easiest way to self-host Spectarr is with Docker.

### Quick Start

```bash
docker run -d \
  --name spectarr \
  -p 3000:3000 \
  -v spectarr-data:/app/data \
  -e OPENROUTER_API_KEY=your_key_here \
  -e TMDB_API_KEY=your_key_here \
  hmilbradt/spectarr:latest
```

### Docker Compose

```yaml
services:
  spectarr:
    image: hmilbradt/spectarr:latest
    container_name: spectarr
    ports:
      - "3000:3000"
    volumes:
      - spectarr-data:/app/data
    environment:
      - OPENROUTER_API_KEY=your_key_here
      - TMDB_API_KEY=your_key_here
      # Optional
      # - TVDB_API_KEY=your_key_here
      # - PLEX_URL=http://192.168.1.100:32400
      # - PLEX_TOKEN=your_plex_token
      # - LOG_LEVEL=info
    restart: unless-stopped

volumes:
  spectarr-data:
```

### Persistent Data

The SQLite database is stored at `/app/data` inside the container. Mount a volume to this path to persist your scan history and settings across container restarts:

```bash
-v spectarr-data:/app/data
```

## Database

Spectarr uses SQLite with WAL mode for fast concurrent reads. The database is automatically created and migrated on first run. No external database server is required.

Available Drizzle Kit commands for development:

```bash
npm run db:push      # Push schema changes to the database
npm run db:generate  # Generate migration files
npm run db:migrate   # Run pending migrations
npm run db:studio    # Open Drizzle Studio (DB browser)
```

## Docker Hub

Pre-built multi-platform images (amd64 + arm64) are published to [Docker Hub](https://hub.docker.com/r/hmilbradt/spectarr) on every release:

```bash
docker pull hmilbradt/spectarr:latest
```

You can pin to a specific version:

```bash
docker pull hmilbradt/spectarr:1.2.3   # exact version
docker pull hmilbradt/spectarr:1.2     # latest patch in 1.2.x
docker pull hmilbradt/spectarr:1       # latest minor in 1.x.x
```

## Contributing

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by [commitlint](https://commitlint.js.org/) and [husky](https://typicode.github.io/husky/). Every commit message must follow this format:

```
type(scope): subject
```

Where `type` is one of:

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | A new feature | Minor (0.1.0 -> 0.2.0) |
| `fix` | A bug fix | Patch (0.1.0 -> 0.1.1) |
| `docs` | Documentation only | None |
| `style` | Formatting, missing semicolons, etc. | None |
| `refactor` | Code change that neither fixes a bug nor adds a feature | None |
| `perf` | Performance improvement | Patch |
| `test` | Adding or fixing tests | None |
| `build` | Changes to build system or dependencies | None |
| `ci` | Changes to CI configuration | None |
| `chore` | Other changes that don't modify src or test files | None |
| `revert` | Reverts a previous commit | Patch |

The `scope` is optional. Examples:

```bash
git commit -m "feat: add barcode scanning support"
git commit -m "fix(plex): handle missing library sections"
git commit -m "docs: update API configuration guide"
```

For breaking changes, add a `!` after the type/scope or include `BREAKING CHANGE:` in the commit footer. This triggers a major version bump:

```bash
git commit -m "feat!: redesign scan API response format"
```

The commit-msg hook will reject commits that don't follow this convention. After cloning, run `npm install` to set up the hooks automatically.

### Automated Releases

Releases are fully automated via [semantic-release](https://semantic-release.gitbook.io/) and GitHub Actions. When commits are pushed to `main`:

1. **semantic-release** analyzes commit messages to determine the version bump (patch/minor/major)
2. A new git tag (e.g. `v1.2.3`) and GitHub Release are created with auto-generated release notes
3. The tag push triggers a Docker build that publishes multi-platform images to Docker Hub

There is no manual versioning. The commit messages drive everything.

### Setting Up the Release Pipeline

If you're forking this project and want the automated releases to work, you need to configure two secrets in your GitHub repository settings (Settings -> Secrets and variables -> Actions):

| Name | Type | Description |
|------|------|-------------|
| `DOCKERHUB_USERNAME` | Variable | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Secret | A Docker Hub [access token](https://hub.docker.com/settings/security) |

The `GITHUB_TOKEN` is provided automatically by GitHub Actions -- no additional setup is needed for creating releases and tags.

## License

MIT
