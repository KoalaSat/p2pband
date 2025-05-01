import React, { useMemo } from 'react';
import { Modal, List, Typography, Tag, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Event } from 'nostr-tools/lib/types/core';

import { useNostrEvents } from 'context/NostrEventsContext';
import Title from 'antd/es/typography/Title';
import { processEvent } from 'functions';
import { EventTableData } from './NostrEventsTable';

// Define the Nostr window interface for TypeScript
declare global {
  interface Window {
    nostr?: {
      signEvent: (event: any) => Promise<any>;
      getPublicKey?: () => Promise<string>;
      nip04?: {
        encrypt?: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt?: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    };
  }
}

interface MyOrdersProps {
  visible: boolean;
  onClose: () => void;
}

const MyOrders: React.FC<MyOrdersProps> = ({ visible, onClose }) => {
  const { events, pubkey, outboxRelays, relays, pool, lastEvent, removeEvent } = useNostrEvents();

  // Filter and process events that match the user's pubkey
  const myOrders = useMemo(() => {
    if (!pubkey || !events.length) return [];

    return events
      .filter(event => event.pubkey === pubkey)
      .map(event => processEvent(event, {}))
      .filter(event => event !== null) as EventTableData[];
  }, [events, pubkey, lastEvent]);

  // Render premium tag with color based on value
  const renderPremium = (premium: string | null) => {
    if (!premium) return <Tag color="default">-</Tag>;

    const premiumValue = parseFloat(premium);
    let tagColor = 'default'; // grey for 0

    if (premiumValue > 0) {
      tagColor = 'success'; // green for positive
    } else if (premiumValue < 0) {
      tagColor = 'error'; // red for negative
    }

    return <Tag color={tagColor}>{premiumValue.toFixed(2)} %</Tag>;
  };

  const onDeleteOrder = (orderId: string) => {
    if (typeof window.nostr === 'undefined') {
      console.error('Nostr extension not found. Please install a Nostr browser extension.');
      return;
    }

    const event = events.find(e => e.id === orderId);

    if (event) {
      const { id, sig, ...unsignedEvent } = event;

      const tags = unsignedEvent.tags.filter(t => t[0] !== 's');
      const dTag = tags.find(tag => tag[0] === 'd');
      tags.push(['s', 'success']);

      unsignedEvent.tags = tags;

      // Sign the event using window.nostr
      window.nostr.signEvent(unsignedEvent).then(signedEvent => {
        // Log the signed event
        console.log('Signed Nostr event:', signedEvent);

        if (dTag) removeEvent(dTag[1]);
        publishOrder(signedEvent);
      });
    }
  };

  const publishOrder = async (signedEvent: Event) => {
    try {
      let publishRelays = outboxRelays;

      // If no outbox relays found, fall back to the default relays
      if (outboxRelays.length === 0) {
        console.log('No user outbox relays found, using default relays:', relays);
        publishRelays = [...relays];
      }

      console.log('Publishing order to relays:', publishRelays);

      // Publish the event to all outbox relays
      const publishPromises = pool.publish(publishRelays, signedEvent);

      // Wait for the results
      const publishResults = await Promise.all(publishPromises);

      // Check if the event was published successfully to at least one relay
      const successfulPublishes = publishResults.filter((result: string) => result);

      if (successfulPublishes.length > 0) {
        console.log(`Order published successfully to ${successfulPublishes.length} relays`);
        onClose(); // Close the modal on success
      } else {
        console.error('Failed to publish order to any relay');
      }

      // Close the pool connection
      pool.close([...relays, ...outboxRelays]);

      onClose();
    } catch (error) {
      console.error('Error publishing order:', error);
    }
  };

  return (
    <Modal
      title={
        <div className="cyberpunk-title">
          <Title level={4} style={{ margin: 0, display: 'inline-block' }}>
            {'>> '}
            <span className="text-glow">MY_ORDERS</span>_
          </Title>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
      className="digital-noise"
    >
      {myOrders.length === 0 ? (
        <Typography.Text className="cyber-text">
          {'> '}
          <span className="blink">_</span> No orders found with your pubkey.
        </Typography.Text>
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={myOrders}
          renderItem={order => (
            <List.Item
              key={order.id}
              className="cyber-list-item"
              style={{
                margin: '10px 0',
                padding: '10px',
                borderRadius: '2px',
                border: '1px solid rgba(0, 255, 0, 0.2)',
                background: 'rgba(0, 20, 0, 0.4)',
                position: 'relative',
                overflow: 'hidden',
              }}
              actions={[
                <Button
                  icon={<DeleteOutlined />}
                  danger
                  type="primary"
                  title="Remove order"
                  className="cyber-button"
                  onClick={() => onDeleteOrder(order.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ff0066',
                    color: '#ff0066',
                    boxShadow: '0 0 5px rgba(255, 0, 102, 0.5)',
                  }}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <div className="order-type">
                    <span className={order.is.toUpperCase() === 'BUY' ? 'cyber-buy' : 'cyber-sell'}>
                      {order.is.toUpperCase()}_
                    </span>
                  </div>
                }
                description={
                  <div className="order-details">
                    <Typography.Text className="cyber-detail">
                      <span className="cyber-label">AMOUNT:</span> {order.amount}{' '}
                      {order.currencyCode || '-'}
                    </Typography.Text>
                    <br />
                    <Typography.Text className="cyber-detail">
                      <span className="cyber-label">PREMIUM:</span> {renderPremium(order.premium)}
                    </Typography.Text>
                    <br />
                    <Typography.Text className="cyber-detail">
                      <span className="cyber-label">PAYMENT METHOD(S):</span> <br />
                      {order.paymentMethods}
                    </Typography.Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
      <style>{`
        .cyberpunk-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .cyber-icon {
          color: #0f0;
          font-size: 20px;
          margin-right: 5px;
        }
        
        .text-glow {
          color: #0f0;
          text-shadow: 0 0 5px #0f0, 0 0 10px #0f0;
          font-family: monospace;
          letter-spacing: 1px;
        }
        
        .cyber-text {
          color: #0f0;
          font-family: monospace;
          letter-spacing: 1px;
        }
        
        .cyber-list-item:before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(45deg, transparent 49%, rgba(0, 255, 0, 0.1) 50%, transparent 51%);
          background-size: 10px 10px;
          pointer-events: none;
        }
        
        .cyber-buy {
          color: #0f0;
          font-weight: bold;
          font-family: monospace;
          text-shadow: 0 0 5px #0f0;
        }
        
        .cyber-sell {
          color: #ff0066;
          font-weight: bold;
          font-family: monospace;
          text-shadow: 0 0 5px #ff0066;
        }
        
        .cyber-label {
          color: #0cf;
          font-family: monospace;
          margin-right: 5px;
          text-shadow: 0 0 2px #0cf;
        }
        
        .cyber-detail {
          color: #fff;
          font-family: monospace;
          letter-spacing: 0.5px;
          line-height: 1.8;
        }
        
        .blink {
          animation: blink-animation 1s steps(2, start) infinite;
        }
        
        @keyframes blink-animation {
          to {
            visibility: hidden;
          }
        }
        
        .cyber-button:hover {
          box-shadow: 0 0 10px rgba(255, 0, 102, 0.8) !important;
          text-shadow: 0 0 5px #ff0066 !important;
        }
        
        .digital-noise::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 250 250' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix in='colorNoise' type='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          opacity: 0.05;
          pointer-events: none;
        }
      `}</style>
    </Modal>
  );
};

export default MyOrders;
