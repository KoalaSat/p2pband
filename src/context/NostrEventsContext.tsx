import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SimplePool } from 'nostr-tools';
import { Event } from 'nostr-tools/lib/types/core';
import { Filter } from 'nostr-tools/lib/types/filter';

// Define the context type
interface NostrEventsContextType {
  events: Event[];
  relays: string[];
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
  const [error, setError] = useState<string | null>(null);

  // Function to load events from Nostr relays
  const loadEvents = () => {
    setEventsLoading(true);
    setError(null);

    try {
      const pool = new SimplePool()

      // Define the filter for kind 38383 events
      const filter: Filter = {
        kinds: [38383],
        '#s': ['pending'],
      };

      // Create an array to store all events
      const allEvents: Event[] = [];

      // Subscribe to events
      const subscription = pool.subscribeMany(relays, [filter], {
        onevent(event: Event) {
          const premiumTag = event.tags.find(tag => tag[0] === 'premium') ?? [];
          const premium = premiumTag[1] ? parseInt(premiumTag[1], 10) : 100

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
          setLastEvent(new Date().getUTCDate())
        },
        oneose() {
          setEventsLoading(false);
          setLastEvent(new Date().getUTCDate())
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

  // Create the context value object
  const contextValue: NostrEventsContextType = {
    events,
    relays,
    eventsLoading,
    lastEvent,
    error,
    refreshEvents: loadEvents
  };

  // Provide the context to children
  return (
    <NostrEventsContext.Provider value={contextValue}>
      {children}
    </NostrEventsContext.Provider>
  );
};

// Custom hook to use the Nostr events context
export const useNostrEvents = (): NostrEventsContextType => {
  const context = useContext(NostrEventsContext);
  if (context === undefined) {
    throw new Error('useNostrEvents must be used within a NostrEventsProvider');
  }
  return context;
};
