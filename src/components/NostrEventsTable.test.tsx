import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Event } from 'nostr-tools/lib/types/core';
import { NostrEventsProvider } from 'context/NostrEventsContext';
import { FILTER_STORAGE_KEY } from 'functions';
import NostrEventsTable from './NostrEventsTable';

const ROBOSATS = '40d33962fdf26e0910805f36a3a96b239cf93b95d4a3e6dd779f1ea3ff9b0866';
const PEACH = 'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2';
const MOSTRO = '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390';

const now = Math.floor(Date.now() / 1000);

const order = (pubkey: string, source: string, dTag: string): Event =>
  ({
    id: dTag,
    pubkey,
    created_at: now - 60,
    kind: 38383,
    sig: 'sig',
    content: '',
    tags: [
      ['d', dTag],
      ['s', 'pending'],
      ['y', source],
      ['k', 'sell'],
      ['fa', '100'],
      ['f', 'EUR'],
      ['premium', '2'],
      ['pm', 'SEPA'],
      ['source', `https://example.com/${dTag}`],
      ['expiration', String(now + 3600)],
    ],
  } as Event);

const FIXTURES = [
  order(ROBOSATS, 'robosats', 'robosats-1'),
  order(PEACH, 'peach', 'peach-1'),
  order(MOSTRO, 'mostro', 'mostro-1'),
];

// Feed the fixtures through the real ingest path instead of stubbing the
// context, so the test covers processEvent and the filtering effect too.
jest.mock('nostr-tools', () => {
  const actual = jest.requireActual('nostr-tools');
  class SimplePoolStub {
    subscribe(
      _relays: string[],
      filter: { authors?: string[] },
      opts: { onevent?: (e: Event) => void; oneose?: () => void }
    ) {
      if (!filter.authors) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        (jest.requireMock('./fixtures') as { FIXTURES: Event[] }).FIXTURES.forEach(e =>
          opts.onevent?.(e)
        );
      }
      opts.oneose?.();
      return { close: jest.fn() };
    }
    querySync() {
      return Promise.resolve([]);
    }
    close = jest.fn();
  }
  return { ...actual, SimplePool: SimplePoolStub };
});

jest.mock('./fixtures', () => ({ FIXTURES: [] }), { virtual: true });

const renderTable = () =>
  render(
    <NostrEventsProvider>
      <NostrEventsTable />
    </NostrEventsProvider>
  );

const sourcesShown = async () => {
  const table = await screen.findByRole('table');
  return ['robosats', 'peach', 'mostro'].filter(
    s => within(table).queryAllByText(s, { selector: '.ant-tag' }).length > 0
  );
};

beforeEach(() => {
  window.localStorage.clear();
  jest.requireMock('./fixtures').FIXTURES = FIXTURES;
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  ) as unknown as typeof fetch;
});

test('excludes the selected platforms in Except mode', async () => {
  renderTable();

  expect(await sourcesShown()).toEqual(['robosats', 'peach', 'mostro']);

  await act(async () => {
    fireEvent.click(screen.getByText('Except'));
  });

  // The Source select is the only multi-select of the three; antd opens its
  // dropdown on mouseDown, not click.
  const sourceSelect = document.querySelector(
    '.ant-select-multiple .ant-select-selector'
  ) as HTMLElement;
  await act(async () => {
    fireEvent.mouseDown(sourceSelect);
  });
  const option = await screen.findByTitle('peach');
  await act(async () => {
    fireEvent.click(option);
  });

  expect(await sourcesShown()).toEqual(['robosats', 'mostro']);
  expect(JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) as string)).toMatchObject({
    sourceMode: 'except',
    sources: ['peach'],
  });
});

test('restores the stored filter on the next visit', async () => {
  window.localStorage.setItem(
    FILTER_STORAGE_KEY,
    JSON.stringify({
      sourceMode: 'except',
      sources: ['peach', 'mostro'],
      type: null,
      currency: null,
      paymentMethod: '',
    })
  );

  renderTable();

  expect(await sourcesShown()).toEqual(['robosats']);
});
