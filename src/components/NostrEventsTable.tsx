import React, { useEffect, useState } from 'react';
import { Table, Pagination, Typography, Spin, Alert, Tag } from 'antd';
import { Filter } from 'nostr-tools/lib/types/filter';
import { Event } from 'nostr-tools/lib/types/core';
import {SimplePool } from 'nostr-tools';

const { Title } = Typography;

// Define the structure of the processed event data for the table
interface EventTableData {
  id: string;
  source: string;
  is: string;
  amount: string;
  link: string;
  created_at: number;
}

const NostrEventsTable: React.FC = () => {
  const [events, setEvents] = useState<EventTableData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const pageSize = 20;

  // Function to format amount values to 2 decimal places
  const formatAmount = (value: string): string => {
    const num = parseFloat(value);
    return isNaN(num) ? value : num.toFixed(2);
  };

  // Function to process raw Nostr events into the format needed for the table
  const processEvent = (event: Event): EventTableData | null => {
    try {
      // Find the required tags
      const sourceTag = event.tags.find(tag => tag[0] === 'y');
      const isTag = event.tags.find(tag => tag[0] === 'k');
      const amountTag = event.tags.find(tag => tag[0] === 'fa');
      const linkTag = event.tags.find(tag => tag[0] === 'source');
      const sTag = event.tags.find(tag => tag[0] === 's');

      // Skip events with 's' tag equal to 'pending'
      if (sTag && sTag[1] === 'pending') {
        return null;
      }

      return {
        id: event.id,
        source: sourceTag ? sourceTag[1] : '-',
        is: isTag ? isTag[1] : '-',
        amount: amountTag ? (
          amountTag.length === 2 ? formatAmount(amountTag[1]) : 
          amountTag.length >= 3 ? `${formatAmount(amountTag[amountTag.length - 2])}-${formatAmount(amountTag[amountTag.length - 1])}` : 
          '-'
        ) : '-',
        link: linkTag ? linkTag[1] : '-',
        created_at: event.created_at || 0,
      };
    } catch (error) {
      console.error('Error processing event:', error, event);
      return null;
    }
  };

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);

      try {
        const pool = new SimplePool();

        // Connect to the specified relay plus random relays
        // For simplicity, we'll just use a few well-known relays plus the specified one
        const relays = [
          'wss://nostr.satstralia.com',
          'wss://relay.damus.io',
          'wss://relay.snort.social',
          'wss://nos.lol',
          'wss://relay.current.fyi',
        ];

        // Define the filter for kind 38383 events
        const filter: Filter = {
          kinds: [38383],
          limit: 100, // Fetch more than we need to account for filtering
        };

        // Create an array to store all events
        const allEvents: EventTableData[] = [];

        // Subscribe to events
        const subscription = pool.subscribeMany(relays, [filter], {
          onevent(event: Event) {
            const processedEvent = processEvent(event);
            if (processedEvent) {
              allEvents.push(processedEvent);
              // Sort by newest first
              allEvents.sort((a, b) => b.created_at - a.created_at);
              setEvents([...allEvents]);
              setTotalEvents(allEvents.length);
            }
          },
          oneose() {
            setLoading(false);
            if (allEvents.length === 0) {
              setError('No events found. Try again later.');
            }
          },
        });

        // Cleanup subscription when component unmounts
        return () => {
          subscription.close();
          pool.close(relays);
        };
      } catch (error) {
        console.error('Error fetching events:', error);
        setError('Failed to fetch events. Please check your connection and try again.');
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Calculate current page data
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentData = events.slice(startIndex, endIndex);

  // Define table columns
  const columns = [
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Is',
      dataIndex: 'is',
      key: 'is',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
    {
      title: 'Link',
      dataIndex: 'link',
      key: 'link',
      render: (text: string) =>
        text && text !== '-' ? (
          <a href={text} target="_blank" rel="noopener noreferrer">
            {text.length > 30 ? `${text.substring(0, 30)}...` : text}
          </a>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2}>Nostr Events (Kind 38383)</Title>

      {error && <Alert message={error} type="error" style={{ marginBottom: '20px' }} />}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <p style={{ marginTop: '20px' }}>Connecting to relays and fetching events...</p>
        </div>
      ) : (
        <>
          <Table
            dataSource={currentData}
            columns={columns}
            rowKey="id"
            pagination={false}
            bordered
            style={{ marginBottom: '20px' }}
          />

          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={totalEvents}
            onChange={handlePageChange}
            showSizeChanger={false}
            showTotal={total => `Total ${total} events`}
          />
        </>
      )}
    </div>
  );
};

export default NostrEventsTable;
