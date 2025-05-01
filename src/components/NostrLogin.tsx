import React, { useState, useEffect } from 'react';
import { Button, Typography, Tag } from 'antd';
import { Event } from 'nostr-tools/lib/types/core';
import { KeyOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNostrEvents } from '../context/NostrEventsContext';
import CreateOrder from './CreateOrder';
import MyOrders from './MyOrders';

// Interface for NIP-07 window extension
interface NostrWindow extends Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    signEvent(event: any): Promise<any>;
  };
}

declare const window: NostrWindow;

const NostrLogin: React.FC = () => {
  const { pubkey, setPubkey, pool } = useNostrEvents();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nip05Verified, setNip05Verified] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showCreateOrder, setShowCreateOrder] = useState<boolean>(false);
  const [showMyOrders, setShowMyOrders] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Use the pool and relays from NostrEventsContext
  const { relays } = useNostrEvents();

  // Check if NIP-07 extension is installed
  const hasNostrExtension = (): boolean => {
    return !!window.nostr;
  };

  // Format pubkey for display (show only first 8 and last 8 characters)
  const formatPubkey = (pk: string): string => {
    if (!pk) return '';
    return `${pk.substring(0, 8)}...${pk.substring(pk.length - 8)}`;
  };

  // Fetch user metadata and verify NIP-05 identifier
  const fetchUserMetadata = async () => {
    if (!pubkey || displayName) return;

    try {
      // Query for kind 0 (metadata) events from the pubkey
      const events = await pool.querySync(
        relays,
        {
          kinds: [0],
          authors: [pubkey],
          limit: 1,
        },
        {
          id: 'p2pBandNip5',
        }
      );

      if (events && events.length > 0) {
        try {
          const validEvent = events.find((e: Event) => e.content != '');
          const content = JSON.parse(validEvent?.content ?? '{}');

          // Set display name from content.name
          if (content.name) {
            setDisplayName(content.name);
          } else {
            setDisplayName(formatPubkey(pubkey));
          }

          // Store and verify NIP-05 if available
          if (content.nip05) {
            verifyNip05(content.nip05, pubkey);
          } else {
            setNip05Verified(false);
          }
        } catch (e) {
          console.error('Error parsing metadata content:', e);
          setDisplayName(formatPubkey(pubkey));
        }
      } else {
        // No metadata found, use formatted pubkey
        setDisplayName(formatPubkey(pubkey));
      }

      // Clean up
      pool.close(relays);
    } catch (err) {
      console.error('Error fetching metadata:', err);
      setDisplayName(formatPubkey(pubkey));
    }
  };

  // Verify NIP-05 identifier
  const verifyNip05 = async (identifier: string, pk: string) => {
    try {
      if (!identifier || !pk) {
        setNip05Verified(false);
        return;
      }

      // Extract name and domain from NIP-05 identifier
      const [name, domain] = identifier.split('@');
      if (!name || !domain) {
        setNip05Verified(false);
        return;
      }

      // Make request to domain's .well-known/nostr.json
      const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
      if (!response.ok) {
        setNip05Verified(false);
        return;
      }

      const data = await response.json();

      // Check if the pubkey in the response matches the user's pubkey
      if (data && data.names && data.names[name] === pk) {
        setNip05Verified(true);
      } else {
        setNip05Verified(false);
      }
    } catch (err) {
      console.error('Error verifying NIP-05:', err);
      setNip05Verified(false);
    }
  };

  // Handle login button click
  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    if (!hasNostrExtension()) {
      setError('Nostr extension not found. Please install a NIP-07 compatible extension.');
      setLoading(false);
      return;
    }

    try {
      const pk = await window.nostr!.getPublicKey();
      setPubkey(pk);
      // Store the pubkey in localStorage for persistence
      savePubkeyToStorage(pk);
      setLoading(false);
    } catch (err) {
      console.error('Error getting public key:', err);
      setError('Error accessing Nostr extension. Please try again.');
      setLoading(false);
    }
  };

  // Save pubkey to localStorage
  const savePubkeyToStorage = (pk: string) => {
    localStorage.setItem('nostr-pubkey', pk);
  };

  // Get pubkey from localStorage
  const getPubkeyFromStorage = (): string | null => {
    return localStorage.getItem('nostr-pubkey');
  };

  // Clear pubkey from localStorage
  const clearPubkeyFromStorage = () => {
    localStorage.removeItem('nostr-pubkey');
  };

  // Check for existing pubkey on initial load
  useEffect(() => {
    const checkExistingLogin = async () => {
      // First check if we have a pubkey in localStorage
      const storedPubkey = getPubkeyFromStorage();
      if (storedPubkey) {
        setPubkey(storedPubkey);
        return;
      }
    };

    checkExistingLogin();
  }, []);

  // Check for existing pubkey on initial load
  useEffect(() => {
    if (pubkey) fetchUserMetadata();
  }, [pubkey]);

  const icon: () => React.ReactNode = () => {
    if (nip05Verified) return <CheckCircleOutlined />;
    if (displayName) return <UserOutlined />;
    return <KeyOutlined />;
  };

  const name: () => React.ReactNode = () => {
    if (!pubkey) return '';
    return displayName || formatPubkey(pubkey);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px auto',
        padding: '10px',
        maxWidth: '600px',
      }}
    >
      <CreateOrder visible={showCreateOrder} onClose={() => setShowCreateOrder(false)} />
      <MyOrders visible={showMyOrders} onClose={() => setShowMyOrders(false)} />
      {pubkey ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Tag color="success" icon={icon()}>
            {nip05Verified && (
              <CheckCircleOutlined
                style={{
                  color: '#1890ff',
                  marginLeft: '4px',
                  fontSize: '14px',
                }}
              />
            )}
            {name()}
          </Tag>
          <Button
            size="small"
            type="text"
            danger
            onClick={() => {
              setShowCreateOrder(true);
            }}
            style={{ marginLeft: '10px' }}
          >
            Create new order
          </Button>
          <Button
            size="small"
            type="text"
            danger
            onClick={() => {
              setShowMyOrders(true);
            }}
            style={{ marginLeft: '10px' }}
          >
            My orders
          </Button>
          <Button
            size="small"
            type="text"
            danger
            onClick={() => {
              clearPubkeyFromStorage();
              setPubkey(null);
              setDisplayName(null);
              setNip05Verified(false);
            }}
            style={{ marginLeft: '10px' }}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="primary"
            onClick={handleLogin}
            loading={loading}
            icon={<KeyOutlined />}
            style={{
              background: '#0f0',
              borderColor: '#0f0',
              color: '#000',
              fontWeight: 'bold',
              boxShadow: '0 0 10px rgba(60, 247, 60, 0.5)',
            }}
          >
            Connect with Nostr
          </Button>
          {error && (
            <Typography.Text type="danger" style={{ marginTop: '10px' }}>
              {error}
            </Typography.Text>
          )}
          {!hasNostrExtension() && !error && (
            <Typography.Text type="secondary" style={{ marginTop: '10px', fontSize: '0.8rem' }}>
              No Nostr extension detected. Install{' '}
              <a
                href="https://getalby.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#0f0' }}
              >
                Alby
              </a>{' '}
              or{' '}
              <a
                href="https://github.com/fiatjaf/nos2x"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#0f0' }}
              >
                nos2x
              </a>
            </Typography.Text>
          )}
        </>
      )}
    </div>
  );
};

export default NostrLogin;
