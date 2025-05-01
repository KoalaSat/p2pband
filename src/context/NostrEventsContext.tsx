import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SimplePool } from 'nostr-tools';
import { Event } from 'nostr-tools/lib/types/core';
import { Filter } from 'nostr-tools/lib/types/filter';

// Define the context type
interface NostrEventsContextType {
  events: Event[];
  eventsLoading: boolean;
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
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Function to load events from Nostr relays
  const loadEvents = () => {
    setEventsLoading(true);
    setError(null);

    try {
      const pool = new SimplePool();

      // Connect to the specified relay plus random relays
      const relays = [
        'wss://nostr.satstralia.com',
        'wss://relay.mostro.network',
        'wss://relay.damus.io',
        'wss://relay.snort.social',
        'wss://nos.lol',
        'wss://relay.current.fyi',
      ];

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
          // Check if the event's pubkey is in the allowed list
          const allowedPubkeys = [
            '7af6f7cfc3bfdf8aa65df2465aa7841096fa8ee6b2d4d14fc43d974e5db9ab96',
            'c8dc40a80bbb41fe7430fca9d0451b37a2341486ab65f890955528e4732da34a',
            'f2d4855df39a7db6196666e8469a07a131cddc08dcaa744a344343ffcf54a10c',
            '74001620297035daa61475c069f90b6950087fea0d0134b795fac758c34e7191',
            'fcc2a0bd8f5803f6dd8b201a1ddb67a4b6e268371fe7353d41d2b6684af7a61e',
            'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2',
            '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390',
          ];
          const sourceTag = event.tags.find(tag => tag[0] === 'y') ?? [];

          // Skip events whose pubkey is not in the allowed list
          if (!allowedPubkeys.includes(event.pubkey) && sourceTag[1] !== 'mostro') {
            console.log(sourceTag);
            return;
          }

          // Add the event to our collection
          allEvents.push(event);
          
          // Sort by newest first
          allEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          
          // Update state with the latest events
          setEvents([...allEvents]);
        },
        oneose() {
            setEventsLoading(false);
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
    eventsLoading,
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
