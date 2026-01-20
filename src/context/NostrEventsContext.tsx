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
  events: Event[];
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

export const allowedPubkeys = [
  '40d33962fdf26e0910805f36a3a96b239cf93b95d4a3e6dd779f1ea3ff9b0866',
  'e185c2ad0b87b3207ac2b96d6b8fb1ff10fbf25f93eef4d04fb6dbb9039f19fb',
  'ded3dc02a1a9b61ce59d11f496539cb3fd15f00326a16f47e5f8d76baba24bdb',
  '95521a33ba34f5924464f425e81b896b1aa9069796a778368ed053e3612c509b',
  '7af6f7cfc3bfdf8aa65df2465aa7841096fa8ee6b2d4d14fc43d974e5db9ab96',
  'c8dc40a80bbb41fe7430fca9d0451b37a2341486ab65f890955528e4732da34a',
  'f2d4855df39a7db6196666e8469a07a131cddc08dcaa744a344343ffcf54a10c',
  '74001620297035daa61475c069f90b6950087fea0d0134b795fac758c34e7191',
  'fcc2a0bd8f5803f6dd8b201a1ddb67a4b6e268371fe7353d41d2b6684af7a61e',
  'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2',
  '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390',
  '273e7880d38d39a7fb238efcf8957a1b5b27e819127a8483e975416a0a90f8d2',
];

// Create the provider component
export const NostrEventsProvider: React.FC<NostrEventsProviderProps> = ({ children }) => {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [webOfTrustKeys, setWebOfTrustKeys] = useState<string[] | null>(null);
  const [webOfTrustCount, setWebOfTrustCount] = useState<number>(0);
  const [webOfTrust, setWebOfTrust] = useState<boolean>(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [relays] = useState<string[]>([
    'wss://nostr.robosats.org',
    'wss://relay.damus.io',
    'wss://relay.snort.social',
    'wss://relay.mostro.network',
    'wss://relay.primal.net'
  ]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [outboxRelays, setOutboxRelays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Function to load events from Nostr relays
  const loadEvents = () => {
    setEventsLoading(true);
    setError(null);

    try {
      const pool = new SimplePool();

      // Define the filter for kind 38383 events
      const filter: Filter = {
        kinds: [38383],
      };

      // Subscribe to events
      pool.subscribeMany(relays, [filter], {
        id: 'p2pBandOrders',
        onevent(event: Event) {
          const networkTag = event.tags.find(tag => tag[0] === 'network');
          const expirationTag = event.tags.find(tag => tag[0] === 'expiration');
          const statusTag = event.tags.find(tag => tag[0] === 's') ?? [];
          const premiumTag = event.tags.find(tag => tag[0] === 'premium') ?? [];
          const premium = premiumTag[1] ? parseInt(premiumTag[1], 10) : 100;

          if (premium > 40 || premium < -40 || !expirationTag || networkTag?.[1] !== 'mainnet') {
            return;
          }

          if (statusTag[1] !== 'pending') {
            removeEvent(event.id);
          } else {
            setEvents(events => {
              if (!events.find(e => e.id === event.id)) {
                events.push(event);
                setEventsCount(events.length);
                return events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
              } else {
                return events;
              }
            });
          }
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
  };

  const removeEvent = (eventId: string) => {
    setEvents(events => {
      const filteredEvents = events.filter(e => e.id !== eventId);

      setEventsCount(() => filteredEvents.length);
      return filteredEvents;
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
    const cleanup = loadEvents();
    return cleanup;
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
