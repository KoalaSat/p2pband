import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SimplePool } from 'nostr-tools';
import { Event } from 'nostr-tools/lib/types/core';
import { Filter } from 'nostr-tools/lib/types/filter';

// Define the context type
interface NostrEventsContextType {
  pubkey: string | null;
  setPubkey: (pubkey: string | null) => void;
  removeEvent: (dTag: string) => void;
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

// Create the provider component
export const NostrEventsProvider: React.FC<NostrEventsProviderProps> = ({ children }) => {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [webOfTrustKeys, setWebOfTrustKeys] = useState<string[] | null>(null);
  const [webOfTrustCount, setWebOfTrustCount] = useState<number>(0);
  const [events, setEvents] = useState<Event[]>([]);
  const [relays] = useState<string[]>([
    'wss://nostr.satstralia.com',
    'wss://relay.damus.io',
    'wss://relay.snort.social',
    'wss://nos.lol',
    'wss://relay.mostro.network'
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
        '#s': ['pending'],
      };

      // Subscribe to events
      pool.subscribeMany(relays, [filter], {
        id: 'p2pBandOrders',
        onevent(event: Event) {

          const statusTag = event.tags.find(tag => tag[0] === 's') ?? [];
          const premiumTag = event.tags.find(tag => tag[0] === 'premium') ?? [];
          const premium = premiumTag[1] ? parseInt(premiumTag[1], 10) : 100;

          if (premium > 40 || premium < -40) {
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

  const removeEvent = (dTag: string) => {
    setEvents(events => {
      return events.filter(e => {
        const tag = e.tags.find(tag => tag[0] === 'd');
        if (!tag?.[1]) {
          setEventsCount(events.length - 1);
          return true;
        }
        return dTag !== tag[1];
      });
    });
  };

  const buildWebOfTrust = (outbox: string[]) => {
    setWebOfTrustKeys(keys => {
      return [pubkey!];
    });

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
          authors: [pubkey!],
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
              authors: [pubkey!],
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
