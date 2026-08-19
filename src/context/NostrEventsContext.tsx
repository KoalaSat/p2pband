import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SimplePool } from 'nostr-tools';
import { Event } from 'nostr-tools/lib/types/core';
import { Filter } from 'nostr-tools/lib/types/filter';

// Define the context type
interface NostrEventsContextType {
  pubkey: string | null;
  setPubkey: (pubkey: string | null) => void;
  removeEvent: (dTag: string) => void;
  webOfTrust: boolean;
  setWebOfTrust: (webOfTrust: boolean) => void;
  events: Map<string, Event | null>;
  relays: string[];
  webOfTrustKeys: string[] | null;
  outboxRelays: string[];
  eventsLoading: boolean;
  webOfTrustCount: number;
  eventsCount: number;
  error: string | null;
  refreshEvents: () => void;
}

// Create the context with a default value
const NostrEventsContext = createContext<NostrEventsContextType | undefined>(undefined);

// Define props for the provider component
interface NostrEventsProviderProps {
  children: ReactNode;
}

export const mostroPubkeys = [
  '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390', // Mostro
  '0000cc02101ec29eea9ce623258752b9d7da66c27845ed26846dd0b0fc736b40', // Mostro: NostroMostro (España)
  '00000235a3e904cfe1213a8a54d6f1ec1bef7cc6bfaabd6193e82931ccf1366a', // Mostro: Kmbalache (Cuba)
  '00000978acc594c506976c655b6decbf2d4af25ffdaa6680f2a9568b0a88441b', // Mostro: MostroColombia (Colombia)
  '00007cb3305fb972f5cc83f83a8fbca1e64e93c9d1369880a9fd62ef95d23f91', // Mostro: MostroBolivia (Bolivia)
  '000009ee1e4b1dc7add19ab30e4ef854d7b562e208b62686fd9002b50b24dabb', // Mostro: MostroVenezuela (Venezuela)
];

export const allowedPubkeys = [
  '40d33962fdf26e0910805f36a3a96b239cf93b95d4a3e6dd779f1ea3ff9b0866', // Robosats: Alice
  'ded3dc02a1a9b61ce59d11f496539cb3fd15f00326a16f47e5f8d76baba24bdb', // Robosats: FreedomSats
  '95521a33ba34f5924464f425e81b896b1aa9069796a778368ed053e3612c509b', // Robosats: LibreBazaar
  '7af6f7cfc3bfdf8aa65df2465aa7841096fa8ee6b2d4d14fc43d974e5db9ab96', // Robosats: Over the moon
  'f2d4855df39a7db6196666e8469a07a131cddc08dcaa744a344343ffcf54a10c', // Robosats: TheBigLake
  '74001620297035daa61475c069f90b6950087fea0d0134b795fac758c34e7191', // Robosats: Temple of Sats
  'fcc2a0bd8f5803f6dd8b201a1ddb67a4b6e268371fe7353d41d2b6684af7a61e', // LNP2PBot
  'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2', // Peach
  ...mostroPubkeys,
  '273e7880d38d39a7fb238efcf8957a1b5b27e819127a8483e975416a0a90f8d2', // HodlHodl
];

// mostrod marks any Pending order Expired once expiration_hours (default 24h)
// have passed, but when the daemon is down that replacement is never published
// and the pending event lingers on the relay until its own NIP-40 expiration,
// which older instances set 30 to 180 days out. Cap it so those fossils drop.
export const MOSTRO_PENDING_MAX_AGE_S = 48 * 60 * 60;

// Effective expiration of an event: its NIP-40 expiration tag, capped for Mostro
// orders at created_at + MOSTRO_PENDING_MAX_AGE_S. Null when the event carries no
// usable expiration tag and no cap applies.
export const effectiveExpiration = (event: Event): number | null => {
  const exp = event.tags.find(tag => tag[0] === 'expiration')?.[1];
  const ts = exp ? parseInt(exp, 10) : NaN;
  const tagExpiration = isNaN(ts) ? null : ts;

  if (!mostroPubkeys.includes(event.pubkey)) return tagExpiration;

  const cap = event.created_at + MOSTRO_PENDING_MAX_AGE_S;
  return tagExpiration === null ? cap : Math.min(tagExpiration, cap);
};

export const isEventExpired = (
  event: Event,
  nowS: number = Math.floor(Date.now() / 1000)
): boolean => {
  const expiration = effectiveExpiration(event);
  return expiration !== null && expiration < nowS;
};

// created_at of the revision that removed each d-tag. A removal deletes the Map
// entry, so without this there is nothing left to compare a late arrival
// against. Tombstones older than the window are pruned to bound growth.
const TOMBSTONE_TTL_S = 7 * 24 * 60 * 60;
const removedAt = new Map<string, number>();

const rememberRemoval = (
  tombstones: Map<string, number>,
  dTag: string,
  createdAt: number,
  nowS: number
) => {
  tombstones.set(dTag, createdAt);
  tombstones.forEach((ts, key) => {
    if (ts < nowS - TOMBSTONE_TTL_S) tombstones.delete(key);
  });
};

// Single writer for the event Map. Kind 38383 is addressable, so several relays
// can serve different revisions of the same d-tag; without a created_at guard a
// stale `pending` copy arriving late re-inserts an order that was already
// cancelled or expired.
export const mergeEvent = (
  events: Map<string, Event | null>,
  event: Event,
  nowS: number = Math.floor(Date.now() / 1000),
  tombstones: Map<string, number> = removedAt
): void => {
  const dTag = event.tags.find(tag => tag[0] === 'd')?.[1] ?? '';
  if (!dTag) return;

  const current = events.get(dTag);
  const knownAt = current ? current.created_at : tombstones.get(dTag);
  if (knownAt !== undefined && knownAt > event.created_at) return;

  const status = event.tags.find(tag => tag[0] === 's')?.[1];
  if (status !== 'pending' || isEventExpired(event, nowS)) {
    events.delete(dTag);
    rememberRemoval(tombstones, dTag, event.created_at, nowS);
  } else {
    events.set(dTag, event);
    tombstones.delete(dTag);
  }
};

// Create the provider component
export const NostrEventsProvider: React.FC<NostrEventsProviderProps> = ({ children }) => {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [webOfTrustKeys, setWebOfTrustKeys] = useState<string[] | null>(null);
  const [webOfTrustCount, setWebOfTrustCount] = useState<number>(0);
  const [webOfTrust, setWebOfTrust] = useState<boolean>(false);
  const [events, setEvents] = useState<Map<string, Event | null>>(new Map<string, Event | null>());
  const [relayPlatforms] = useState<Record<string, string[]>>({
    'wss://nostr.robosats.org': ['robosats', 'nostr'],
    'wss://freelay.sovbit.host': ['robosats', 'peach', 'nostr'],
    'wss://relay.damus.io': ['lnp2pbot', 'peach', 'nostr'],
    'wss://relay.snort.social': ['hodlhodl', 'lnp2pbot', 'nostr'],
    'wss://relay.mostro.network': ['mostro', 'nostr'],
    'wss://relay.kilombino.com': ['mostro', 'nostr'],
    'wss://relay.primal.net': ['peach', 'hodlhodl', 'nostr'],
    'wss://nos.lol': ['lnp2pbot', 'mostro', 'nostr'],
  });
  const relays = Object.keys(relayPlatforms);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [outboxRelays, setOutboxRelays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mostroRelays = Object.keys(relayPlatforms).filter(r =>
    relayPlatforms[r].includes('mostro')
  );

  const handleMostroEvent = (event: Event) => {
    setEvents(events => {
      mergeEvent(events, event);
      setEventsCount(events.size);
      return events;
    });
  };

  // Function to load events from Nostr relays
  const loadEvents = () => {
    setEventsLoading(true);
    setError(null);

    Object.keys(relayPlatforms).forEach(relay => {
      try {
        const pool = new SimplePool();

        const filter: Filter = {
          kinds: [38383],
          '#s': ['pending'],
          '#y': relayPlatforms[relay],
        };

        // Subscribe to events
        pool.subscribe([relay], filter, {
          id: 'p2pBandOrders',
          onevent(event: Event) {
            const networkTag = event.tags.find(tag => tag[0] === 'network');
            const expirationTag = event.tags.find(tag => tag[0] === 'expiration');
            const premiumTag = event.tags.find(tag => tag[0] === 'premium') ?? [];
            const premium = premiumTag[1] ? parseInt(premiumTag[1], 10) : 100;

            if (premium > 40 || premium < -40 || !expirationTag || networkTag?.[1] === 'testnet') {
              return;
            }

            setEvents(events => {
              mergeEvent(events, event);
              setEventsCount(events.size);
              return events;
            });
          },
          oneose() {
            setEventsLoading(false);
          },
        });
      } catch (error) {
        console.error('Error fetching events:', error);
        setError('Failed to fetch events. Please check your connection and try again.');
        setEventsLoading(false);
      }
    });

    // Secondary subscription for Mostro pubkeys without #s filter so we receive
    // cancellations and status updates that replace pending events on the relay.
    try {
      const pool = new SimplePool();
      pool.subscribe(
        mostroRelays,
        { kinds: [38383], authors: mostroPubkeys },
        {
          id: 'p2pMostroUpdates',
          onevent: handleMostroEvent,
        }
      );
    } catch (error) {
      console.error('Error subscribing to Mostro updates:', error);
    }
  };

  const removeEvent = (dTag: string) => {
    setEvents(m => {
      m.delete(dTag);
      setEventsCount(m.size);
      return m;
    });
  };

  const buildWebOfTrust = (outbox: string[]) => {
    setWebOfTrustKeys([pubkey ?? '']);

    const publishRelays = [...relays, ...outbox].reduce<string[]>((accumulator, current) => {
      // Remove the last character if it's a '/'
      const modifiedCurrent = current.endsWith('/') ? current.slice(0, -1) : current;

      // Check if the modified current string is already in the accumulator
      if (!accumulator.includes(modifiedCurrent)) {
        accumulator.push(modifiedCurrent);
      }
      return accumulator;
    }, []);

    const pool = new SimplePool();
    pool
      .querySync(
        publishRelays,
        {
          kinds: [3],
          authors: [pubkey ?? ''],
          limit: 1,
        },
        {
          id: 'p2pWebOfTrust',
        }
      )
      .then((events: Event[]) => {
        if (events.length > 0) {
          console.log('Found user follow list, buildint web of trust');
          events.forEach(followsEvent => {
            const pubKeys = followsEvent.tags.map(t => t[1]);
            setWebOfTrustKeys(keys => {
              if (keys) {
                pubKeys.forEach(t => {
                  if (!keys.includes(t)) keys.push(t);
                });
              }
              setWebOfTrustCount(keys?.length ?? 0);
              return keys;
            });
          });
        }
      });
  };

  // Initial load of events
  useEffect(() => {
    loadEvents();
  }, []);

  // Periodic sweep: drop events whose effective expiration has passed so they
  // disappear from the UI even if the source relay never sends a replacement.
  useEffect(() => {
    const sweep = () => {
      setEvents(prev => {
        const now = Math.floor(Date.now() / 1000);
        let changed = false;
        const next = new Map(prev);
        next.forEach((ev, dTag) => {
          if (ev && isEventExpired(ev, now)) {
            next.delete(dTag);
            changed = true;
          }
        });
        if (!changed) return prev;
        setEventsCount(next.size);
        return next;
      });
    };
    sweep();
    const id = setInterval(sweep, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (pubkey) {
      try {
        console.log('Fetching user outbox relays from metadata...');

        const pool = new SimplePool();
        pool
          .querySync(
            relays,
            {
              kinds: [10002],
              authors: [pubkey ?? ''],
              limit: 1,
            },
            {
              id: 'p2pBandOutbox',
            }
          )
          .then((events: Event[]) => {
            if (events.length > 0) {
              const rTags = events[0].tags
                .filter(t => t[0] == 'r' && (t.length < 3 || t[2] === 'write'))
                .map(t => t[1]);
              console.log('Outbox relays:', rTags);

              setOutboxRelays(rTags);
              buildWebOfTrust(rTags);
            }
          });
      } catch (error) {
        console.error('Error fetching outbox relays:', error);
        buildWebOfTrust([]);
      }
    }
  }, [pubkey]);

  // Create the context value object
  const contextValue: NostrEventsContextType = {
    pubkey,
    setPubkey,
    removeEvent,
    webOfTrust,
    setWebOfTrust,
    webOfTrustKeys,
    outboxRelays,
    events,
    relays,
    eventsLoading,
    webOfTrustCount,
    eventsCount,
    error,
    refreshEvents: loadEvents,
  };

  // Provide the context to children
  return <NostrEventsContext.Provider value={contextValue}>{children}</NostrEventsContext.Provider>;
};

// Custom hook to use the Nostr events context
export const useNostrEvents = (): NostrEventsContextType => {
  const context = useContext(NostrEventsContext);
  if (context === undefined) {
    throw new Error('useNostrEvents must be used within a NostrEventsProvider');
  }
  return context;
};
