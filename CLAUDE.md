# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

P2P Bitcoin exchanges decentralized aggregator (https://p2p.band). A Create React App + TypeScript frontend that subscribes to Nostr relays and renders a unified order book of Bitcoin P2P offers from multiple platforms (Mostro, Robosats, LNP2PBot, Peach, HodlHodl).

## Commands

```bash
yarn start           # dev server on :3000
yarn build           # production build to ./build
yarn lint            # eslint src --ext .js,.jsx,.ts,.tsx
yarn format          # prettier write src
yarn test            # react-scripts test (Jest, watch mode)
yarn test -- --watchAll=false SomeTest      # run a single suite once
yarn deploy          # gh-pages publish from ./build (runs predeploy build)
```

Production deploy artifact is served by the included nginx Dockerfile / `docker-compose.yml` (binds 85→80, 449→443; expects `/etc/letsencrypt` and `./nginx/conf` mounts).

## Architecture

The app is a single-page Ant Design dark-themed dashboard. Three layers matter:

1. **`src/context/NostrEventsContext.tsx`** — the data backbone. `NostrEventsProvider` opens `SimplePool` subscriptions to a hardcoded set of relays (`relayPlatforms` map). Each relay is filtered by the platforms it carries via the `#y` tag, plus `kind: 38383` and `#s: pending`. A second subscription targeted at `mostroPubkeys` (no `#s` filter) listens for status replacements so cancelled/taken Mostro orders get removed. Events are stored in a `Map<dTag, Event>`; non-pending updates `delete` the dTag. Premium outside ±40 and testnet events are dropped at ingest. When a `pubkey` is set (NIP-07 login), the provider fetches kind 10002 outbox relays and a kind 3 follow list to populate `webOfTrustKeys`.
   - `allowedPubkeys` / `mostroPubkeys` are the authoritative authorship allowlists exported from this file. New platform instances must be added here.

2. **`src/components/NostrEventsTable.tsx`** — the main view. Consumes the context, filters by web-of-trust toggle, and renders the order table, depth chart, and create/my-orders flows.

3. **`src/functions/index.ts`** — pure helpers (formatting, average rates, event→row transforms) shared between the table and chart components. Imports from `components/` and `context/` rely on `baseUrl: "src"` (see `tsconfig.json`) — use bare imports like `'components/X'`, not relative paths from `src/`.

Other notable pieces: `NostrLogin.tsx` (NIP-07 window.nostr login), `CreateOrder.tsx` / `MyOrders.tsx` (publishing flows for logged-in users), `DepthChart.tsx` (nivo line chart), `DonationButton.tsx` (Lightning via webln + qrcode.react).

## Conventions

- TypeScript strict mode is on; target is `es5`, JSX is `react-jsx`.
- Prettier + ESLint (`react-app`, `react-app/jest`) are the source of truth for style — run `yarn lint` / `yarn format` before committing.
- Path aliases come from `baseUrl: "src"` only; there is no webpack alias config beyond CRA defaults.
- The `build/` directory is checked in (it's what gh-pages and the nginx image ship). Rebuild it before deploying, but treat day-to-day churn there as generated.
