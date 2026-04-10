# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a "闲鱼购物助手" (Xianyu Shopping Assistant) workflow built using `@greaseclaw/workflow-sdk`. It automates the process of finding, comparing, and purchasing items on Xianyu (闲鱼), China's second-hand marketplace platform.

## Build Commands

```bash
pnpm build        # Build workflow files from src to dist
pnpm dev          # Run workflow in development mode (local testing)
pnpm zip          # Build and create distributable workflows.zip
```

## Development Workflow

Use `pnpm dev` for local testing. The dev script runs the workflow SDK's dev tool which executes workflow files directly. For VS Code debugging, use the provided launch configurations in `.vscode/launch.json`.

## Architecture

### Workflow Entry Point

`src/goofish_workflow.ts` is the main workflow entry. It uses YAML frontmatter metadata (between `/** */` comments) to define:
- Workflow name and description
- Trigger conditions (`use when`)
- Input parameters with validation requirements
- Output fields

The `execute(context: WorkflowContext)` function is the entry point exposed via `globalThis.execute`.

### State Machine Flow

The shopping workflow operates through stages defined in `src/models/types.ts`:

```
idle → auth_checking → auth_collecting → intent_collecting → 
searching → shortlisting → inquiring → waiting_payment_adjust → completed/failed
```

Session state is managed by `ShoppingSessionStore` in `src/libs/session-store.ts` with:
- TTL-based expiration (30 minutes)
- LRU eviction when max size (500) reached

### Key Modules

- **`src/api.ts`**: Auto-generated API client wrapping `agent.call()` for Goofish backend endpoints (login, search, inquire, payment, etc.)
- **`src/libs/shopping-flow.ts`**: Core orchestration - handles incoming messages, manages session transitions, coordinates API calls and polling
- **`src/libs/claude-prompts.ts`** and **`src/libs/claude-parser.ts`**: AI prompt templates and response parsers for intent extraction and price parsing
- **`src/libs/poller.ts`**: Generic polling utility with configurable retry times and intervals, supports abort signals

### API Endpoints

All APIs return `GoofishApiResponse` with structure:
```typescript
{
  success: boolean;
  error?: string;
  task?: { id, status, extract_data, metrics_tokens, metrics_time }
}
```

Key endpoints: `/v1/custom/login`, `/v1/custom/check_login`, `/v1/custom/search`, `/v1/custom/inquire`, `/v1/custom/payment`, `/v1/custom/get_message`

### Intent Model

Shopping intent consists of four required fields (defined in `src/models/types.ts`):
- `location`: Target city/area
- `shop`: Store name
- `product`: Product name
- `spec`: Specifications

Intent can be provided via `context.params` or extracted from user text using AI prompts.

## Workflow SDK Integration

This project depends on `@greaseclaw/workflow-sdk` (installed from GitHub). The SDK provides:
- `Agent` class for calling external APIs and sending messages/images
- `WorkflowContext` interface for workflow input
- Build tools in `bin/workflow-build.mjs` and `bin/workflow-dev.mjs`

Build process (via `build.mjs`):
1. Extracts frontmatter header from workflow files
2. Bundles TypeScript with esbuild (browser-compatible IIFE format)
3. Prepends header to compiled output

## File Naming Convention

Workflow files must end with `workflow.ts` suffix (e.g., `goofish_workflow.ts`) for the build script to recognize them.