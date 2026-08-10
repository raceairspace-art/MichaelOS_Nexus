# MichaelOS Nexus

MichaelOS Nexus is a shared workspace where a person and AI work on the same object, with the same context, in the same moment.

V1 begins with **Digital Oliver**. The center canvas holds the shared object; the embedded Nexus panel receives the object state, current selection, and recent activity with every request. The AI can return a small, reviewable patch that the user applies directly to Oliver.

## Product principle

> The app provides the context. The AI collaborates.

No exporting, separate chat, or explaining the screen.

## Run locally

```bash
npm install
npm run dev
```

The workspace remains interactive without credentials and labels AI suggestions as **Demo mode**. To enable live generation, copy `.env.example` to `.env.local` and set `AI_GATEWAY_API_KEY`. Vercel deployments can also authenticate to AI Gateway with OIDC.

## V1 architecture

- Next.js App Router frontend
- One route handler at `/api/collaborate`
- Vercel AI SDK with structured output
- Vercel AI Gateway, defaulting to `openai/gpt-5.6-luna`
- No database, authentication, or heavy infrastructure yet

## Success criterion

If someone watches a user session and says, “It feels like the AI is sitting beside him,” V1 is doing its job.

