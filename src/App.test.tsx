import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// The provider opens relay subscriptions and the table fetches exchange rates on
// mount. Stub both so this smoke test never reaches the network — real calls
// would make the suite slow and dependent on relay and API uptime.
jest.mock('nostr-tools', () => {
  const actual = jest.requireActual('nostr-tools');
  class SimplePoolStub {
    subscribe() {
      return { close: jest.fn() };
    }
    querySync() {
      return Promise.resolve([]);
    }
    close = jest.fn();
  }
  return { ...actual, SimplePool: SimplePoolStub };
});

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  ) as unknown as typeof fetch;
});

test('renders the order book shell', async () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /p2p ₿and/i })).toBeInTheDocument();
  expect(screen.getByText(/P2P Bitcoin exchanges decentralized aggregator/i)).toBeInTheDocument();
  expect(await screen.findByRole('table')).toBeInTheDocument();
});
