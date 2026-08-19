import { Event } from 'nostr-tools/lib/types/core';
import { isMostroOrderValid, MostroValidation } from 'functions';
import { isEventExpired, mergeEvent, MOSTRO_PENDING_MAX_AGE_S } from 'context/NostrEventsContext';

const MOSTRO_MAIN = '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390';
const NOSTRO_MOSTRO = '0000cc02101ec29eea9ce623258752b9d7da66c27845ed26846dd0b0fc736b40';
const ROBOSATS = '40d33962fdf26e0910805f36a3a96b239cf93b95d4a3e6dd779f1ea3ff9b0866';

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

    expect(events.has('order-1')).toBe(true);
  });

  it('removes an order that is no longer pending', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - 2 * HOUR, 'pending'), NOW, tombstones);
    mergeEvent(events, order(NOW - HOUR, 'canceled'), NOW, tombstones);

    expect(events.has('order-1')).toBe(false);
  });

  // Regression: p2pMostroUpdates subscribes to several relays without an `#s`
  // filter, so a relay still holding an older pending copy used to resurrect an
  // order that a newer cancellation had already removed.
  it('does not let a stale pending copy resurrect a cancelled order', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - HOUR, 'canceled'), NOW, tombstones);
    mergeEvent(events, order(NOW - 3 * HOUR, 'pending'), NOW, tombstones);

    expect(events.has('order-1')).toBe(false);
  });

  it('replaces a stored order with a newer revision', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    const older = order(NOW - 3 * HOUR, 'pending');
    const newer = order(NOW - HOUR, 'pending');
    mergeEvent(events, older, NOW, tombstones);
    mergeEvent(events, newer, NOW, tombstones);

    expect(events.get('order-1')).toBe(newer);
  });

  it('does not store an already expired order', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    mergeEvent(events, order(NOW - 130 * 24 * HOUR, 'pending'), NOW, tombstones);

    expect(events.has('order-1')).toBe(false);
  });

  it('ignores an event carrying no d-tag', () => {
    const events = new Map<string, Event | null>();
    const tombstones = new Map<string, number>();
    const noDTag = { ...order(NOW - HOUR, 'pending'), tags: [['s', 'pending']] } as Event;
    mergeEvent(events, noDTag, NOW, tombstones);

    expect(events.size).toBe(0);
  });
});
