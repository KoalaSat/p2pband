import { Event } from 'nostr-tools/lib/types/core';
import { processEvent } from 'functions';
import { mergeEvent, orderKey } from './NostrEventsContext';

const AUTHOR = '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390';
const ATTACKER = 'attacker';
const NOW = 1_760_000_000;
const HOUR = 60 * 60;
const KEY = orderKey(AUTHOR, 'order-1');

const order = (createdAt: number, status: string, pubkey = AUTHOR): Event =>
  ({
    id: 'id',
    pubkey,
    created_at: createdAt,
    kind: 38383,
    sig: 'sig',
    content: '',
    tags: [
      ['d', 'order-1'],
      ['s', status],
      ['expiration', String(createdAt + 24 * HOUR)],
    ],
  } as Event);

describe('mergeEvent order identity', () => {
  let events: Map<string, Event | null>;
  let tombstones: Map<string, number>;

  beforeEach(() => {
    events = new Map();
    tombstones = new Map();
  });

  it('does not let another author replace an order through its d-tag', () => {
    const original = order(NOW - 2 * HOUR, 'pending');
    mergeEvent(events, original, NOW, tombstones);
    mergeEvent(events, order(NOW - HOUR, 'pending', ATTACKER), NOW, tombstones);

    expect(events.get(KEY)).toBe(original);
  });

  it('does not let another author cancel an order through its d-tag', () => {
    const original = order(NOW - 2 * HOUR, 'pending');
    mergeEvent(events, original, NOW, tombstones);
    mergeEvent(events, order(NOW - HOUR, 'canceled', ATTACKER), NOW, tombstones);

    expect(events.get(KEY)).toBe(original);
  });

  it('ignores an event dated far in the future, so it cannot block real updates', () => {
    const genuine = order(NOW - HOUR, 'pending');
    mergeEvent(events, order(NOW + 24 * HOUR, 'canceled'), NOW, tombstones);
    mergeEvent(events, genuine, NOW, tombstones);

    expect(events.get(KEY)).toBe(genuine);
  });

  it('accepts an event a few minutes ahead, to tolerate clock skew', () => {
    const ahead = order(NOW + 60, 'pending');
    mergeEvent(events, ahead, NOW, tombstones);

    expect(events.get(KEY)).toBe(ahead);
  });
});

describe('processEvent order identity', () => {
  it('exposes the bare d-tag, which Mostro validation depends on', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(processEvent(order(now - HOUR, 'pending'), {})?.dTag).toBe('order-1');
  });
});
