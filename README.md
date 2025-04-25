# Nostr Events Viewer

A React application that connects to Nostr relays and displays events of kind 38383 in a paginated table.

## Features

- Connects to multiple Nostr relays, including the specified `wss://nostr.satstralia.com`
- Fetches and displays all available events of kind 38383
- Filters out events with an "s" tag equal to "pending"
- Displays event data in a table with the following columns:
  - Source (value of "y" tag)
  - Is (value of "k" tag)
  - Amount (value of "amt" tag)
  - Link (value of "source" tag)
- Paginates the events table (20 items per page)
- Sorts events by creation time (newest first)

## Technologies Used

- React with TypeScript
- nostr-tools for Nostr protocol communication
- Ant Design for UI components

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

## Project Structure

- `src/components/NostrEventsTable.tsx`: Main component that handles connecting to relays and displaying events
- `src/App.tsx`: App component that integrates the NostrEventsTable
- `src/App.css`: Custom styles for the application
- `public/index.html`: HTML entry point

## Notes on Nostr Integration

This application uses the [nostr-tools](https://github.com/nbd-wtf/nostr-tools) library to connect to Nostr relays and fetch events. It connects to several relays for redundancy and better discovery of events.

Events are filtered to specifically show kind 38383 events, and any event with an "s" tag value of "pending" is excluded from the results.
