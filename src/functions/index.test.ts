import { Event } from 'nostr-tools/lib/types/core';
import {
  DEFAULT_FILTERS,
  FILTER_STORAGE_KEY,
  isMostroOrderValid,
  loadFilters,
  matchesSourceFilter,
  MostroValidation,
  processEvent,
  saveFilters,
} from 'functions';
import {
  MOSTRO_INSTANCES,
  MOSTRO_SOURCES,
  mostroAuthRelays,
  mostroPubkeys,
} from 'functions/mostroInstances';
import { isEventExpired, mergeEvent, MOSTRO_PENDING_MAX_AGE_S } from 'context/NostrEventsContext';

const MOSTRO_MAIN = '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390';
const NOSTRO_MOSTRO = '0000cc02101ec29eea9ce623258752b9d7da66c27845ed26846dd0b0fc736b40';
const ROBOSATS = '40d33962fdf26e0910805f36a3a96b239cf93b95d4a3e6dd779f1ea3ff9b0866';
const MOSTRO_BRASIL = '00037abd44e7a846689e230d5446abcd0d56a344fa81fff85c09d1929feda486';
const MOSTRO_AR = 'b3626fe91b602bdbca3673bec0855221f41dc8f6d0e4027e51eaa525d68d87f2';
const MOSTRO_MEXICO = '00003f6be51b51a1a0cf9c94232ab1bba1f5c1bfd5a0e8687e9647558536b791';

const validation = (validatedPubkeys: string[], dTags: string[]): MostroValidation => ({
  validatedPubkeys: new Set(validatedPubkeys),
  dTags: new Set(dTags),
});

describe('isMostroOrderValid', () => {
  it('keeps every order while the validation is still loading', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'order-1' };

    expect(isMostroOrderValid(order, null)).toBe(true);
  });

  // Regression: relay.mostro.network returning 502 used to produce an empty
  // (but non-null) validation set, which wiped every Mostro order off the book.
  it('keeps orders from an instance whose authoritative relay did not answer', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'order-1' };

    expect(isMostroOrderValid(order, validation([], []))).toBe(true);
  });

  it('keeps an order confirmed by its authoritative relay', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'order-1' };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], [`${MOSTRO_MAIN}:order-1`]))).toBe(
      true
    );
  });

  it('drops an orphaned order missing from its authoritative relay', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'gone' };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], [`${MOSTRO_MAIN}:order-1`]))).toBe(
      false
    );
  });

  it('never filters non-Mostro sources', () => {
    const order = { source: 'robosats', pubkey: 'whatever', dTag: 'gone' };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], [`${MOSTRO_MAIN}:order-1`]))).toBe(
      true
    );
  });

  it('does not let one instance validate another instance d-tag', () => {
    const order = { source: 'NostroMostro', pubkey: NOSTRO_MOSTRO, dTag: 'order-1' };

    expect(
      isMostroOrderValid(
        order,
        validation([MOSTRO_MAIN, NOSTRO_MOSTRO], [`${MOSTRO_MAIN}:order-1`])
      )
    ).toBe(false);
  });

  it('keeps orders that carry no d-tag', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: undefined };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], []))).toBe(true);
  });
});

describe('isEventExpired', () => {
  const NOW = 1_760_000_000;
  const HOUR = 60 * 60;

  const event = (
    pubkey: string,
    createdAt: number,
    expiration: number | null,
    dTag = 'order-1'
  ): Event =>
    ({
      id: 'id',
      pubkey,
      created_at: createdAt,
      kind: 38383,
      sig: 'sig',
      content: '',
      tags: [
        ['d', dTag],
        ['s', 'pending'],
        ...(expiration === null ? [] : [['expiration', String(expiration)]]),
      ],
    } as Event);

  it('drops a Mostro fossil whose long expiration has not been reached yet', () => {
    // Real case: c1fe7688 was published 4 months ago with a 180-day expiration.
    const fossil = event(MOSTRO_MAIN, NOW - 130 * 24 * HOUR, NOW + 50 * 24 * HOUR);

    expect(isEventExpired(fossil, NOW)).toBe(true);
  });

  it('keeps a live Mostro order', () => {
    const live = event(MOSTRO_MAIN, NOW - 2 * HOUR, NOW + 22 * HOUR);

    expect(isEventExpired(live, NOW)).toBe(false);
  });

  it('caps a Mostro order exactly at the freshness window', () => {
    const farExpiration = NOW + 365 * 24 * HOUR;

    expect(
      isEventExpired(event(MOSTRO_MAIN, NOW - MOSTRO_PENDING_MAX_AGE_S + 1, farExpiration), NOW)
    ).toBe(false);
    expect(
      isEventExpired(event(MOSTRO_MAIN, NOW - MOSTRO_PENDING_MAX_AGE_S - 1, farExpiration), NOW)
    ).toBe(true);
  });

  it('caps a Mostro order that carries no expiration tag', () => {
    expect(isEventExpired(event(MOSTRO_MAIN, NOW - HOUR, null), NOW)).toBe(false);
    expect(isEventExpired(event(MOSTRO_MAIN, NOW - 10 * 24 * HOUR, null), NOW)).toBe(true);
  });

  it('never caps a non-Mostro source', () => {
    // RoboSats and friends legitimately publish long-lived offers.
    const robosats = event(ROBOSATS, NOW - 130 * 24 * HOUR, NOW + 50 * 24 * HOUR);

    expect(isEventExpired(robosats, NOW)).toBe(false);
  });

  it('honours a NIP-40 expiration already in the past', () => {
    expect(isEventExpired(event(ROBOSATS, NOW - 2 * HOUR, NOW - HOUR), NOW)).toBe(true);
  });

  it('keeps a non-Mostro event with no expiration tag', () => {
    expect(isEventExpired(event(ROBOSATS, NOW - 130 * 24 * HOUR, null), NOW)).toBe(false);
  });
});

describe('mergeEvent', () => {
  const NOW = 1_760_000_000;
  const HOUR = 60 * 60;
  const KEY = `${MOSTRO_MAIN}:order-1`;

  const order = (createdAt: number, status: string, dTag = 'order-1'): Event =>
    ({
      id: 'id',
      pubkey: MOSTRO_MAIN,
      created_at: createdAt,
      kind: 38383,
      sig: 'sig',
      content: '',
      tags: [
        ['d', dTag],
        ['s', status],
        ['expiration', String(createdAt + 24 * HOUR)],
      ],
    } as Event);

  it('stores a pending order', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - HOUR, 'pending'), NOW, tombstones);

    expect(events.has(KEY)).toBe(true);
  });

  it('removes an order that is no longer pending', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - 2 * HOUR, 'pending'), NOW, tombstones);
    mergeEvent(events, order(NOW - HOUR, 'canceled'), NOW, tombstones);

    expect(events.has(KEY)).toBe(false);
  });

  // Regression: p2pMostroUpdates subscribes to several relays without an `#s`
  // filter, so a relay still holding an older pending copy used to resurrect an
  // order that a newer cancellation had already removed.
  it('does not let a stale pending copy resurrect a cancelled order', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - HOUR, 'canceled'), NOW, tombstones);
    mergeEvent(events, order(NOW - 3 * HOUR, 'pending'), NOW, tombstones);

    expect(events.has(KEY)).toBe(false);
  });

  it('replaces a stored order with a newer revision', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    const older = order(NOW - 3 * HOUR, 'pending');
    const newer = order(NOW - HOUR, 'pending');
    mergeEvent(events, older, NOW, tombstones);
    mergeEvent(events, newer, NOW, tombstones);

    expect(events.get(KEY)).toBe(newer);
  });

  it('does not store an already expired order', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - 130 * 24 * HOUR, 'pending'), NOW, tombstones);

    expect(events.has(KEY)).toBe(false);
  });

  it('ignores an event carrying no d-tag', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    const noDTag = { ...order(NOW - HOUR, 'pending'), tags: [['s', 'pending']] } as Event;
    mergeEvent(events, noDTag, NOW, tombstones);

    expect(events.size).toBe(0);
  });
});

describe('matchesSourceFilter', () => {
  const row = (source: string) => ({ source });

  it('is a no-op when nothing is selected', () => {
    expect(matchesSourceFilter(row('mostro'), [], 'only')).toBe(true);
    expect(matchesSourceFilter(row('mostro'), [], 'except')).toBe(true);
  });

  it('keeps only the selected sources in only mode', () => {
    expect(matchesSourceFilter(row('mostro'), ['mostro', 'peach'], 'only')).toBe(true);
    expect(matchesSourceFilter(row('robosats'), ['mostro', 'peach'], 'only')).toBe(false);
  });

  it('drops the selected sources in except mode', () => {
    expect(matchesSourceFilter(row('mostro'), ['mostro', 'peach'], 'except')).toBe(false);
    expect(matchesSourceFilter(row('robosats'), ['mostro', 'peach'], 'except')).toBe(true);
  });

  it('treats each Mostro instance as its own source', () => {
    // processEvent renames `mostro` per instance, so excluding one instance must
    // not take the others with it.
    expect(matchesSourceFilter(row('MostroColombia'), ['mostro'], 'except')).toBe(true);
    expect(matchesSourceFilter(row('mostro'), ['mostro'], 'except')).toBe(false);
  });
});

describe('filter persistence', () => {
  const stored = {
    sourceMode: 'except' as const,
    sources: ['mostro', 'peach'],
    type: 'BUY',
    currency: 'EUR',
    paymentMethod: 'SEPA',
  };

  beforeEach(() => window.localStorage.clear());

  it('defaults when nothing is stored', () => {
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });

  it('round-trips every filter', () => {
    saveFilters(stored);

    expect(loadFilters()).toEqual(stored);
  });

  it('falls back to the defaults on unusable stored data', () => {
    window.localStorage.setItem(FILTER_STORAGE_KEY, 'not json');
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);

    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify('a string'));
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);
  });

  // A corrupt field must not take the rest of the user's filters with it.
  it('sanitises each field independently', () => {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        sourceMode: 'nope',
        sources: [1, 'peach'],
        type: 'MAYBE',
        currency: 'EUR',
        paymentMethod: 42,
      })
    );

    expect(loadFilters()).toEqual({
      sourceMode: 'only',
      sources: [],
      type: null,
      currency: 'EUR',
      paymentMethod: '',
    });
  });

  it('survives localStorage being unavailable', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => saveFilters(stored)).not.toThrow();
    expect(loadFilters()).toEqual(DEFAULT_FILTERS);

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe('Mostro instance registry', () => {
  it('has no duplicate pubkeys', () => {
    const pubkeys = MOSTRO_INSTANCES.map(instance => instance.pubkey);

    expect(new Set(pubkeys).size).toBe(pubkeys.length);
  });

  it('has no duplicate names', () => {
    const names = MOSTRO_INSTANCES.map(instance => instance.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('derives every lookup from the same instance list', () => {
    expect(mostroPubkeys).toHaveLength(MOSTRO_INSTANCES.length);
    expect(MOSTRO_SOURCES).toHaveLength(MOSTRO_INSTANCES.length);
    expect(Object.keys(mostroAuthRelays)).toHaveLength(MOSTRO_INSTANCES.length);
  });

  it('registers Mostro Brasil and MostrAR', () => {
    expect(mostroPubkeys).toContain(MOSTRO_BRASIL);
    expect(mostroPubkeys).toContain(MOSTRO_AR);
    expect(MOSTRO_SOURCES).toEqual(expect.arrayContaining(['MostroBrasil', 'MostroAr']));
  });

  it('registers Mostro Mexico', () => {
    expect(mostroPubkeys).toContain(MOSTRO_MEXICO);
    expect(MOSTRO_SOURCES).toContain('MostroMexico');
  });
});

describe('processEvent instance naming', () => {
  const rates = { USD: 100_000 };

  const order = (pubkey: string): Event =>
    ({
      id: 'id',
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 38383,
      sig: 'sig',
      content: '',
      tags: [
        ['d', 'order-1'],
        ['s', 'pending'],
        ['k', 'sell'],
        ['f', 'USD'],
        ['fa', '100'],
        ['premium', '0'],
        ['y', 'mostro'],
        ['expiration', String(Math.floor(Date.now() / 1000) + 60 * 60)],
      ],
    } as Event);

  it('renames a Mostro Brasil order', () => {
    expect(processEvent(order(MOSTRO_BRASIL), rates)?.source).toBe('MostroBrasil');
  });

  it('renames a MostrAR order', () => {
    expect(processEvent(order(MOSTRO_AR), rates)?.source).toBe('MostroAr');
  });

  it('renames a Mostro Mexico order', () => {
    expect(processEvent(order(MOSTRO_MEXICO), rates)?.source).toBe('MostroMexico');
  });

  // The flagship instance is the one that keeps the bare `mostro` source tag.
  it('leaves the flagship instance untouched', () => {
    expect(processEvent(order(MOSTRO_MAIN), rates)?.source).toBe('mostro');
  });
});

describe('processEvent fixed-price orders', () => {
  const rates = { USD: 100_000 };

  // Locale-independent: the separator comes from the runtime's own formatting.
  const rate = (value: number, currency: string) =>
    `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}/BTC`;

  const order = (tags: string[][]): Event =>
    ({
      id: 'id',
      pubkey: MOSTRO_MAIN,
      created_at: Math.floor(Date.now() / 1000),
      kind: 38383,
      sig: 'sig',
      content: '',
      tags: [
        ['d', 'order-1'],
        ['s', 'pending'],
        ['k', 'sell'],
        ['y', 'mostro'],
        ['expiration', String(Math.floor(Date.now() / 1000) + 60 * 60)],
        ...tags,
      ],
    } as Event);

  // 100 USD for 0.0008 BTC is 125,000 USD/BTC, 25% over the 100,000 market rate,
  // even though the maker published the usual `premium` of 0.
  const fixed = order([
    ['f', 'USD'],
    ['fa', '100'],
    ['amt', '80000'],
    ['premium', '0'],
  ]);

  it('prices a fixed-price order from its sats amount, not from the market', () => {
    expect(processEvent(fixed, rates)?.price).toBe(rate(125000, 'USD'));
  });

  it('replaces the declared premium with the one the order actually carries', () => {
    const data = processEvent(fixed, rates);
    expect(parseFloat(data?.premium ?? '')).toBeCloseTo(25);
    expect(data?.fixedPrice).toBe(true);
  });

  // HodlHodl pins the sats but declares a premium that matches, so flagging it
  // as measured would mark most of the book for nothing.
  it('leaves the premium unflagged when it matches the declared one', () => {
    const data = processEvent(
      order([
        ['f', 'USD'],
        ['fa', '100'],
        ['amt', '99900'],
        ['premium', '0'],
      ]),
      rates
    );
    expect(parseFloat(data?.premium ?? '')).toBeCloseTo(0.1);
    expect(data?.fixedPrice).toBe(false);
  });

  // `amt` pairs with the top of the range, not the bottom.
  it('uses the top of a range to derive the rate', () => {
    const data = processEvent(
      order([
        ['f', 'USD'],
        ['fa', '50', '100'],
        ['amt', '80000'],
        ['premium', '0'],
      ]),
      rates
    );
    expect(data?.price).toBe(rate(125000, 'USD'));
  });

  it('shows no premium when the currency has no market rate', () => {
    const data = processEvent(
      order([
        ['f', 'VES'],
        ['fa', '100'],
        ['amt', '80000'],
        ['premium', '0'],
      ]),
      rates
    );
    expect(data?.premium).toBeNull();
    expect(data?.fixedPrice).toBe(false);
    expect(data?.price).toBe(rate(125000, 'VES'));
  });

  it('leaves market-price orders on the declared premium', () => {
    const data = processEvent(
      order([
        ['f', 'USD'],
        ['fa', '100'],
        ['amt', '0'],
        ['premium', '5'],
      ]),
      rates
    );
    expect(data?.premium).toBe('5');
    expect(data?.fixedPrice).toBeUndefined();
    expect(data?.price).toBe(rate(105000, 'USD'));
  });
});
