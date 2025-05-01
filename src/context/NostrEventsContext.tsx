import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SimplePool } from 'nostr-tools';
import { Event } from 'nostr-tools/lib/types/core';
import { Filter } from 'nostr-tools/lib/types/filter';

// Define the context type
interface NostrEventsContextType {
  pubkey: string | null;
  setPubkey: (pubkey: string | null) => void;
  events: Event[];
  relays: string[];
  outboxRelays: string[];
  eventsLoading: boolean;
  lastEvent: number;
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
  const [events, setEvents] = useState<Event[]>([]);
  const [relays] = useState<string[]>([
    'wss://nostr.satstralia.com',
    'wss://relay.damus.io',
    'wss://relay.snort.social',
    'wss://nos.lol',
    'wss://relay.current.fyi',
  ]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [lastEvent, setLastEvent] = useState<number>(0);
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

      // Create an array to store all events
      const allEvents: Event[] = [];

      // Subscribe to events
      const subscription = pool.subscribeMany(relays, [filter], {
        id: 'p2pBandOrders',
        onevent(event: Event) {
          const premiumTag = event.tags.find(tag => tag[0] === 'premium') ?? [];
          const premium = premiumTag[1] ? parseInt(premiumTag[1], 10) : 100;

          // Skip events whose pubkey is not in the allowed list
          if (premium > 40 || premium < -40) {
            return;
          }

          // Add the event to our collection
          allEvents.push(event);

          // Sort by newest first
          allEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

          // Update state with the latest events
          setEvents([...allEvents]);
          setLastEvent(new Date().getUTCDate());
        },
        oneose() {
          setEventsLoading(false);
          setLastEvent(new Date().getUTCDate());
          if (allEvents.length === 0) {
            setError('No events found. Try again later.');
          }
        },
      });

      // Return cleanup function
      return () => {
        subscription.close();
        pool.close(relays);
      };
    } catch (error) {
      console.error('Error fetching events:', error);
      setError('Failed to fetch events. Please check your connection and try again.');
      setEventsLoading(false);
    }
  };

  // Initial load of events
  useEffect(() => {
    const cleanup = loadEvents();
    return cleanup;
  }, []);

  useEffect(() => {
    if (pubkey) {
      try {
        const pool = new SimplePool();
        console.log('Fetching user outbox relays from metadata...');

        // First try to get the user's preferred write relays from their metadata
        const userMetadataFilter = {
          kinds: [10002], // kind 10002 is the relay list event
          authors: [pubkey!],
          limit: 1,
        };

        // Subscribe to events
        const subscription = pool.subscribeMany(relays, [userMetadataFilter], {
          id: 'p2pBandOutbox',
          onevent(event: Event) {
            const rTags = event.tags
              .filter(t => t[0] == 'r' && (t.length < 3 || t[2] === 'write'))
              .map(t => t[1]);
            console.log('Outbox relays:', rTags);
            setOutboxRelays(rTags);
          },
        });

        // Return cleanup function
        return () => {
          subscription.close();
          pool.close(relays);
        };
      } catch (error) {
        console.error('Error fetching outbox relays:', error);
      }
    }
  }, [pubkey]);

  // Create the context value object
  const contextValue: NostrEventsContextType = {
    pubkey,
    setPubkey,
    outboxRelays,
    events,
    relays,
    eventsLoading,
    lastEvent,
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
