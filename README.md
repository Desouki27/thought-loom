<div align="center">

# Thought Loom

**An AI-woven personal knowledge graph.**

[![CI](https://github.com/Desouki27/thought-loom/actions/workflows/ci.yml/badge.svg)](https://github.com/Desouki27/thought-loom/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/Desouki27/thought-loom)](https://github.com/Desouki27/thought-loom/releases)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0D1117)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Write notes. Discover connections. Ask your knowledge questions and get answers
grounded in the ideas you already captured.

</div>

![Thought Loom graph view](docs/screenshots/graph-hero.png)

---

## The idea

Most note-taking tools preserve what you write but leave all organization to
you. Thought Loom treats a notebook as a living graph: notes become nodes,
meaningful relationships become edges, and emergent themes become visual
clusters.

| Action | What Thought Loom does |
| :--- | :--- |
| Save a note | Generates an embedding and searches for related ideas |
| Review a suggestion | Explains why two notes belong together before you accept the link |
| Re-weave | Re-clusters the notebook and names each emerging theme |
| Ask a question | Retrieves relevant notes and synthesizes a cited answer |
| Click a citation | Focuses the source note directly in the graph |

The result is not a folder hierarchy you have to maintain. It is a notebook
that reorganizes itself as your thinking evolves.

---

## Features

### Semantic auto-linking

Every saved note is embedded with OpenAI `text-embedding-3-small`. Thought Loom
uses pgvector similarity search to find candidates, then asks Claude to decide
whether each candidate is genuinely related—not merely sharing similar words.
Suggestions include a concise reason and confidence score and remain pending
until you accept or dismiss them.

### Emergent clustering

Re-weave normalizes note embeddings, groups them with k-means, and asks Claude
to give every group a short theme name and summary. The graph renders those
themes as colored cluster halos.

### Ask Loom

Ask questions in plain language. Thought Loom embeds the question, retrieves
the most relevant notes, and streams a Claude response grounded only in that
context. Inline citations retain the source note IDs, and selecting one returns
you to the evidence in the graph.

### Interactive graph

Notes are rendered as nodes and accepted relationships as edges on a
force-directed canvas. Select a node to edit it, review suggested links, or ask
questions without leaving the knowledge map.

### Private user workspaces

Supabase Auth identifies every request. All notebook tables use row-level
security tied to `auth.uid()`, and Edge Functions query through the caller's JWT
rather than a service-role key.

---

## Architecture

```text
Browser
  │
  ├── React 19 + TypeScript + Vite + Tailwind CSS
  │     ├── Markdown note editor
  │     ├── Force-directed knowledge graph
  │     ├── Link suggestion review
  │     └── Streaming Ask Loom panel
  │
  └── Supabase
        ├── Auth
        ├── Postgres + pgvector
        ├── Row-level security
        └── Edge Functions
              ├── OpenAI embeddings
              └── Anthropic reasoning and synthesis
```

```text
apps/web/
  src/components/       graph, editor, suggestions, chat, and auth UI
  src/context/          authenticated session state
  src/lib/              Supabase client, typed API calls, and shared types
  src/pages/            login, signup, and graph workspace

supabase/
  migrations/           schema, indexes, pgvector search, and RLS policies
  functions/
    embed-note/          embed a newly saved note
    suggest-links/       retrieve and reason about related notes
    cluster-notes/       cluster embeddings and label themes
    ask-notes/           retrieve context and stream a cited answer
    _shared/             JWT-forwarding client, CORS, and HTTP helpers
```

---

## How data flows

### Saving and linking a note

```text
Edit note
   ↓
Save to Postgres
   ↓
Generate OpenAI embedding
   ↓
Find nearby vectors with pgvector
   ↓
Ask Claude to validate each relationship
   ↓
Store pending suggestions for review
```

### Asking the loom

```text
Ask a question
   ↓
Embed the question
   ↓
Retrieve the six closest notes
   ↓
Stream a grounded Claude answer
   ↓
Persist the answer and cited note IDs
```

---

## Tech stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 19, TypeScript 6, Vite 8 |
| Styling | Tailwind CSS 4 |
| Graph | react-force-graph-2d |
| Editor | @uiw/react-md-editor |
| Authentication | Supabase Auth |
| Database | Supabase Postgres |
| Vector search | pgvector with HNSW indexing |
| Embeddings | OpenAI text-embedding-3-small |
| Reasoning | Anthropic Claude |
| Edge runtime | Supabase Edge Functions on Deno |
| Quality | Oxlint, Vitest, TypeScript, GitHub Actions |

---

## Local setup

### Prerequisites

- Node.js 22 or newer
- npm
- Supabase CLI
- A Supabase project
- OpenAI and Anthropic API keys

Using the AI workflows calls paid third-party APIs. Review the providers' current
pricing and set appropriate account limits before testing with substantial note
collections.

### 1. Clone the repository

```sh
git clone https://github.com/Desouki27/thought-loom.git
cd thought-loom
```

### 2. Configure Supabase

Link the checkout to your project:

```sh
supabase login
supabase link --project-ref <your-project-ref>
```

Apply the committed migrations in order:

```sh
supabase db push
```

The migrations enable pgvector, create the notebook schema and indexes, enable
RLS on every exposed table, add ownership policies, and install the vector
similarity function.

### 3. Configure server-side AI secrets

```sh
supabase secrets set OPENAI_API_KEY=<your-openai-key>
supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-key>
```

These values belong in Supabase Edge Function secrets. Never place them in the
frontend `.env` file or commit them to Git.

### 4. Deploy Edge Functions

```sh
supabase functions deploy embed-note
supabase functions deploy suggest-links
supabase functions deploy cluster-notes
supabase functions deploy ask-notes
```

### 5. Configure the frontend

```sh
cd apps/web
cp .env.example .env
```

Set the public client configuration in `apps/web/.env`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-or-anon-key>
```

The public/publishable client key is expected in a browser application; access
control comes from authenticated sessions and RLS. Never use a Supabase secret
or service-role key here.

Install and start the app:

```sh
npm ci
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`.

---

## Database model

| Table | Purpose |
| :--- | :--- |
| `profiles` | Minimal profile created when an Auth user signs up |
| `notes` | Markdown content and 1,536-dimension embeddings |
| `links` | Manual or AI-suggested relationships and review state |
| `clusters` | AI-generated theme labels and summaries |
| `note_clusters` | Many-to-many note-to-theme membership |
| `chat_messages` | Ask Loom history and cited note IDs |

Every table in the exposed `public` schema has RLS enabled. Policies scope rows
to the authenticated user, and the privileged signup trigger cannot be called
as a public RPC.

---

## Security model

- The browser receives only the Supabase URL and public/publishable client key.
- OpenAI and Anthropic keys exist only as Edge Function secrets.
- Edge Functions reject requests without an Authorization header.
- Each function validates the JWT with `supabase.auth.getUser()`.
- Database access runs as the calling user, allowing RLS to enforce ownership.
- SQL functions use pinned `search_path` values to prevent object-shadowing attacks.
- The `handle_new_user` security-definer function is revoked from public roles.

Thought Loom sends note content to OpenAI for embeddings and to Anthropic for
relationship analysis, theme labels, and grounded answers. Do not store content
you are not authorized to send to those providers.

---

## Development

Run the same checks enforced by CI:

```sh
cd apps/web
npm ci
npm run lint
npm test
npm run build
```

The production build is written to `apps/web/dist/`. The graph, Markdown editor,
and Ask Loom UI are loaded in separate chunks so the initial application bundle
does not include the heaviest interactive surfaces upfront.

Current unit coverage focuses on citation parsing and link filtering. Database,
RLS, Edge Function, and browser-level integration tests require a configured
Supabase environment and are not part of the local Vitest suite.

---

## Deployment

The frontend is a static Vite application and can be deployed to Vercel,
Netlify, Cloudflare Pages, or any static host. Configure
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment and
route unknown paths to `index.html` for React Router.

Deploy the database migrations and Edge Functions through Supabase separately.
No OpenAI, Anthropic, or Supabase service-role secrets should be configured on
the frontend host.

---

## License

[MIT](LICENSE)
