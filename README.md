# P2P BAND

Decentralized P2P Bitcoin exchanges aggregator 

https://p2p.band

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- Yarn or npm

### Installation

1. Clone the repository
2. Install dependencies:

```bash
yarn install
# or
npm install
```

### Running the Application

To start the development server:

```bash
yarn start
# or
npm start
```

This will run the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### Building for Production

To build the app for production:

```bash
yarn build
# or
npm run build
```

This creates optimized files in the `build` folder, ready for deployment.

## Notes on Nostr Integration

This application uses the [nostr-tools](https://github.com/nbd-wtf/nostr-tools) library to connect to Nostr relays and fetch events. It connects to several relays for redundancy and better discovery of events.

Events are filtered to specifically show kind 38383 events, and any event with an "s" tag value of "pending" is excluded from the results.
