import React, { useState, useEffect } from 'react';
import { Button, Modal, Space, Typography, InputNumber, message, Progress } from 'antd';
import { HeartOutlined, ArrowLeftOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { SimplePool } from 'nostr-tools';
import { Event, UnsignedEvent } from 'nostr-tools/lib/types/core';
import { useNostrEvents } from '../context/NostrEventsContext';

const { Title, Paragraph } = Typography;

const DEVELOPER_PUBKEY = '5b7e291df10b60da4d71ea99142a0f3e0eb83f20c2f122efe8ee633e7c90e2ab';
const DEVELOPER_LN_ADDRESS = 'cobaltshrimp5@primal.net';
const MONTHLY_GOAL_SATS = 15000;

// Preset zap amounts in satoshis
const PRESET_AMOUNTS = [210, 1000, 2100, 5000, 10000, 15000];

// Interface for NIP-07 window extension and WebLN
interface NostrWindow extends Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    signEvent(event: UnsignedEvent): Promise<Event>;
  };
  webln?: {
    enable(): Promise<void>;
    sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
  };
}

declare const window: NostrWindow;

interface DonationModalProps {
  visible: boolean;
  onClose: () => void;
  onLNInvoice: () => void;
  onZapDeveloper: () => void;
  onZapWithNostr: () => void;
  monthlyTotal: number;
  loading: boolean;
  isLoggedIn: boolean;
}

const DonationModal: React.FC<DonationModalProps> = ({
  visible,
  onClose,
  onLNInvoice,
  onZapDeveloper,
  onZapWithNostr,
  monthlyTotal,
  loading,
  isLoggedIn,
}) => {
  const progressPercent = Math.min((monthlyTotal / MONTHLY_GOAL_SATS) * 100, 100);

  return (
    <Modal
      title={
        <Title level={4}>
          {'>>'} SUPPORT DEVELOPMENT<span className="blink">_</span>
        </Title>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
      className="digital-noise"
    >
      <div style={{ padding: '10px 0' }}>
        <Paragraph style={{ color: '#41f4f4', fontWeight: 'bold' }}>
          <strong>[!] HELP KEEP P2P.BAND ALIVE:</strong>
        </Paragraph>
        <Paragraph
          style={{
            fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
            fontSize: '15px',
            lineHeight: 1.5,
            color: '#3cf73c',
            textShadow: '0 0 1px rgba(60, 247, 60, 0.2)',
          }}
        >
          Your support helps maintain and improve this project. Choose your preferred donation
          method:
        </Paragraph>

        {/* Monthly Goal Section */}
        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
          <Paragraph style={{ color: '#41f4f4', fontWeight: 'bold', marginBottom: '10px' }}>
            <strong>[⚡] MONTHLY GOAL:</strong>
          </Paragraph>
          <div style={{ marginBottom: '8px' }}>
            <Progress
              percent={progressPercent}
              strokeColor={{
                '0%': '#3cf73c',
                '100%': '#41f4f4',
              }}
              trailColor="#1a1a1a"
              status={loading ? 'active' : 'normal'}
              showInfo={false}
            />
          </div>
          <Paragraph
            style={{
              fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
              fontSize: '14px',
              color: '#3cf73c',
              textShadow: '0 0 1px rgba(60, 247, 60, 0.2)',
              marginTop: '8px',
            }}
          >
            {loading ? (
              'Loading...'
            ) : (
              <>
                {monthlyTotal.toLocaleString()} / {MONTHLY_GOAL_SATS.toLocaleString()} sats (
                {progressPercent.toFixed(1)}%)
              </>
            )}
          </Paragraph>
        </div>

        <Space direction="vertical" style={{ width: '100%', marginTop: '20px' }}>
          {isLoggedIn ? (
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={onZapWithNostr} block>
              {'// ZAP WITH NOSTR'}
            </Button>
          ) : (
            <Button type="primary" onClick={onZapDeveloper} block>
              {'// ZAP WITH NOSTR'}
            </Button>
          )}
          <Button onClick={onLNInvoice} block>
            {'// GENERATE LN INVOICE'}
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

interface ZapModalProps {
  visible: boolean;
  onClose: () => void;
  onBack: () => void;
}

const ZapModal: React.FC<ZapModalProps> = ({ visible, onClose, onBack }) => {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { relays, pubkey } = useNostrEvents();

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount(null);
  };

  const handleCustomAmountChange = (value: number | null) => {
    setCustomAmount(value);
    setSelectedAmount(null);
  };

  const handleSendZap = async () => {
    const amount = selectedAmount || customAmount;
    if (!amount || amount <= 0) {
      message.error('Please select or enter a valid amount in sats');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Get the LNURL pay endpoint
      const [username, domain] = DEVELOPER_LN_ADDRESS.split('@');
      const lnurlResponse = await fetch(`https://${domain}/.well-known/lnurlp/${username}`);

      if (!lnurlResponse.ok) {
        throw new Error('Failed to resolve Lightning Address');
      }

      const lnurlData = await lnurlResponse.json();

      // Check if the endpoint supports zaps (has allowsNostr and nostrPubkey)
      if (!lnurlData.allowsNostr || !lnurlData.nostrPubkey) {
        throw new Error('This Lightning Address does not support Nostr zaps');
      }

      // Step 2: Create the zap request event (kind 9734)
      // This request will be included in the invoice and used by the provider to create the zap receipt
      const zapRequestEvent: UnsignedEvent = {
        kind: 9734,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', DEVELOPER_PUBKEY], // recipient pubkey
          ['amount', (amount * 1000).toString()], // amount in millisats
          ['relays', ...relays.slice(0, 5)], // relays where zap receipt should be published
        ],
        content: '', // optional comment
        pubkey: pubkey || '',
      };

      console.log('Creating zap request:', zapRequestEvent);

      // Step 3: Sign the zap request with NIP-07
      if (!window.nostr) {
        throw new Error('Nostr extension not found. Please install a NIP-07 compatible extension.');
      }

      const signedZapRequest = await window.nostr.signEvent(zapRequestEvent);
      console.log('Signed zap request:', signedZapRequest);

      // Step 4: Request the invoice with the zap request
      const amountMillisats = amount * 1000;
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.append('amount', amountMillisats.toString());
      callbackUrl.searchParams.append('nostr', JSON.stringify(signedZapRequest));

      console.log('Requesting zap invoice from:', callbackUrl.toString());

      const invoiceResponse = await fetch(callbackUrl.toString());

      if (!invoiceResponse.ok) {
        throw new Error('Failed to generate zap invoice');
      }

      const invoiceData = await invoiceResponse.json();
      console.log('Invoice response:', invoiceData);

      if (invoiceData.status === 'ERROR') {
        throw new Error(invoiceData.reason || 'Failed to generate zap invoice');
      }

      // Step 5: Send the invoice to the wallet extension
      if (window.webln) {
        console.log('Paying invoice with WebLN...');
        await (window.webln as any).enable();
        const paymentResult = await (window.webln as any).sendPayment(invoiceData.pr);
        console.log('Payment successful!', paymentResult);
        message.success(
          `Zap of ${amount} sats sent successfully!`
        );
        handleReset();
        onClose();
      } else {
        // Fallback: copy invoice to clipboard
        console.log('WebLN not available, copying invoice to clipboard');
        navigator.clipboard.writeText(invoiceData.pr);
        message.success(
          'Zap invoice copied to clipboard! Pay it with your Lightning wallet and the zap receipt will be published to Nostr.'
        );
        handleReset();
      }
    } catch (error) {
      console.error('Error sending zap:', error);
      message.error(
        error instanceof Error ? error.message : 'Failed to send zap. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedAmount(null);
    setCustomAmount(null);
  };

  const handleModalClose = () => {
    handleReset();
    onClose();
  };

  const handleBackClick = () => {
    handleReset();
    onBack();
  };

  return (
    <Modal
      title={
        <Title level={4}>
          <ThunderboltOutlined /> ZAP DEVELOPER<span className="blink">_</span>
        </Title>
      }
      open={visible}
      onCancel={handleModalClose}
      footer={null}
      centered
      className="digital-noise"
    >
      <div style={{ padding: '10px 0' }}>
        <Paragraph style={{ color: '#41f4f4', fontWeight: 'bold' }}>
          <strong>[!] SELECT ZAP AMOUNT:</strong>
        </Paragraph>
        <Paragraph
          style={{
            fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
            fontSize: '15px',
            lineHeight: 1.5,
            color: '#3cf73c',
            textShadow: '0 0 1px rgba(60, 247, 60, 0.2)',
            marginBottom: '20px',
          }}
        >
          Choose a preset amount or enter a custom value in satoshis.
        </Paragraph>

        {/* Preset Amount Buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          {PRESET_AMOUNTS.map(amount => (
            <Button
              key={amount}
              type={selectedAmount === amount ? 'primary' : 'default'}
              onClick={() => handleAmountSelect(amount)}
              style={{
                height: '45px',
                fontWeight: 'bold',
              }}
            >
              {amount.toLocaleString()} ⚡
            </Button>
          ))}
        </div>

        {/* Custom Amount Input */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              color: '#41f4f4',
              fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
              fontSize: '14px',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            CUSTOM AMOUNT (SATS):
          </label>
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            value={customAmount}
            onChange={handleCustomAmountChange}
            placeholder="Enter custom amount"
            size="large"
          />
        </div>

        {/* Action Buttons */}
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleSendZap}
            loading={loading}
            block
            disabled={!selectedAmount && !customAmount}
          >
            {`// SEND ZAP ${
              selectedAmount || customAmount
                ? `(${(selectedAmount || customAmount)?.toLocaleString()} SATS)`
                : ''
            }`}
          </Button>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBackClick} block>
            {'// BACK'}
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

interface InvoiceFormModalProps {
  visible: boolean;
  onClose: () => void;
  onBack: () => void;
}

const InvoiceFormModal: React.FC<InvoiceFormModalProps> = ({ visible, onClose, onBack }) => {
  const [satsAmount, setSatsAmount] = useState<number | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateInvoice = async () => {
    if (!satsAmount || satsAmount <= 0) {
      message.error('Please enter a valid amount in sats');
      return;
    }

    setLoading(true);

    try {
      const lnAddress = 'cobaltshrimp5@primal.net';
      const [username, domain] = lnAddress.split('@');

      // Step 1: Fetch the LNURL endpoint from the Lightning Address
      const lnurlResponse = await fetch(`https://${domain}/.well-known/lnurlp/${username}`);

      if (!lnurlResponse.ok) {
        throw new Error('Failed to resolve Lightning Address');
      }

      const lnurlData = await lnurlResponse.json();

      // Step 2: Request an invoice from the callback URL
      const amountMillisats = satsAmount * 1000;
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.append('amount', amountMillisats.toString());

      const invoiceResponse = await fetch(callbackUrl.toString());

      if (!invoiceResponse.ok) {
        throw new Error('Failed to generate invoice');
      }

      const invoiceData = await invoiceResponse.json();

      if (invoiceData.status === 'ERROR') {
        throw new Error(invoiceData.reason || 'Failed to generate invoice');
      }

      setInvoice(invoiceData.pr);
      message.success('Invoice generated successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      message.error('Failed to generate invoice. Please try again or use the Zap option.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvoice = () => {
    if (invoice) {
      navigator.clipboard.writeText(invoice);
      message.success('Invoice copied to clipboard!');
    }
  };

  const handleReset = () => {
    setSatsAmount(null);
    setInvoice(null);
  };

  const handleModalClose = () => {
    handleReset();
    onClose();
  };

  const handleBackClick = () => {
    handleReset();
    onBack();
  };

  return (
    <Modal
      title={
        <Title level={4}>
          {'>>'} LIGHTNING INVOICE<span className="blink">_</span>
        </Title>
      }
      open={visible}
      onCancel={handleModalClose}
      footer={null}
      centered
      className="digital-noise"
    >
      <div style={{ padding: '10px 0' }}>
        {!invoice ? (
          <>
            <Paragraph style={{ color: '#41f4f4', fontWeight: 'bold' }}>
              <strong>[!] ENTER AMOUNT TO DONATE:</strong>
            </Paragraph>
            <Paragraph
              style={{
                fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                fontSize: '15px',
                lineHeight: 1.5,
                color: '#3cf73c',
                textShadow: '0 0 1px rgba(60, 247, 60, 0.2)',
                marginBottom: '20px',
              }}
            >
              Specify the amount in satoshis to generate a Lightning invoice.
            </Paragraph>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <label
                  style={{
                    color: '#41f4f4',
                    fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                    fontSize: '14px',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  AMOUNT (SATS):
                </label>
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  value={satsAmount}
                  onChange={value => setSatsAmount(value)}
                  placeholder="Enter amount in sats"
                  size="large"
                />
              </div>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button type="primary" onClick={handleGenerateInvoice} loading={loading} block>
                  {'// GENERATE INVOICE'}
                </Button>
                <Button icon={<ArrowLeftOutlined />} onClick={handleBackClick} block>
                  {'// BACK'}
                </Button>
              </Space>
            </Space>
          </>
        ) : (
          <>
            <Paragraph style={{ color: '#41f4f4', fontWeight: 'bold' }}>
              <strong>[✓] INVOICE GENERATED:</strong>
            </Paragraph>
            <Paragraph
              style={{
                fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                fontSize: '15px',
                lineHeight: 1.5,
                color: '#3cf73c',
                textShadow: '0 0 1px rgba(60, 247, 60, 0.2)',
                marginBottom: '20px',
              }}
            >
              Scan the QR code or copy the invoice to pay {satsAmount} sats.
            </Paragraph>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '20px',
                padding: '20px',
                backgroundColor: '#ffffff',
                borderRadius: '8px',
              }}
            >
              <QRCodeSVG value={invoice} size={200} level="H" />
            </div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button type="primary" onClick={handleCopyInvoice} block>
                {'// COPY INVOICE'}
              </Button>
              <Button onClick={handleReset} block>
                {'// GENERATE NEW INVOICE'}
              </Button>
              <Button icon={<ArrowLeftOutlined />} onClick={handleBackClick} block>
                {'// BACK'}
              </Button>
            </Space>
          </>
        )}
      </div>
    </Modal>
  );
};

const DonationButton: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showZapModal, setShowZapModal] = useState(false);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { relays, pubkey } = useNostrEvents();

  // Fetch monthly zaps when component mounts or modal opens
  useEffect(() => {
    if (modalVisible) {
      fetchMonthlyZaps();
    }
  }, [modalVisible]);

  const fetchMonthlyZaps = () => {
    setLoading(true);
    try {
      console.log('Fetching monthly zaps from relays:', relays);
      const pool = new SimplePool();

      // Calculate timestamp for the start of this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);

      console.log('Querying for zaps since:', new Date(startTimestamp * 1000).toISOString());

      let totalSats = 0;
      let eventCount = 0;

      // Subscribe to zap events (kind 9735) for the developer's pubkey
      const sub = pool.subscribeMany(
        relays,
        [
          {
            kinds: [9735],
            '#p': [DEVELOPER_PUBKEY],
            since: startTimestamp,
          },
        ],
        {
          id: 'monthlyDonations',
          onevent(event: Event) {
            eventCount++;
            // Zap receipts contain the amount in the bolt11 tag
            const bolt11Tag = event.tags.find(tag => tag[0] === 'bolt11');
            if (bolt11Tag && bolt11Tag[1]) {
              // Parse the amount from the bolt11 invoice
              const amountMatch = bolt11Tag[1].match(/lnbc(\d+)([munp]?)/i);
              if (amountMatch) {
                let amount = parseInt(amountMatch[1], 10);
                const unit = amountMatch[2]?.toLowerCase();

                // Convert to satoshis based on unit
                if (unit === 'n') {
                  // nano-bitcoin = 0.1 satoshi
                  amount = amount / 10;
                } else if (unit === 'u') {
                  // micro-bitcoin = 100 satoshis
                  amount = amount * 100;
                } else if (unit === 'm') {
                  // milli-bitcoin = 100,000 satoshis
                  amount = amount * 100000;
                } else if (unit === 'p') {
                  // pico-bitcoin = 0.0001 satoshi
                  amount = amount / 10000;
                }
                // If no unit, it's in bitcoin (very unlikely for zaps)

                totalSats += Math.floor(amount);
                setMonthlyTotal(totalSats);
              }
            }
          },
          oneose() {
            console.log('Received zap events:', eventCount);
            console.log('Total satoshis calculated:', totalSats);
            setLoading(false);
          },
        }
      );
    } catch (error) {
      console.error('Error fetching monthly zaps:', error);
      setMonthlyTotal(0);
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setModalVisible(true);
    setShowInvoiceForm(false);
    setShowZapModal(false);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setShowInvoiceForm(false);
    setShowZapModal(false);
  };

  const handleLNInvoice = () => {
    setModalVisible(false);
    setShowInvoiceForm(true);
  };

  const handleZapWithNostr = () => {
    setModalVisible(false);
    setShowZapModal(true);
  };

  const handleBackToMain = () => {
    setShowInvoiceForm(false);
    setShowZapModal(false);
    setModalVisible(true);
  };

  const handleZapDeveloper = () => {
    window.open(
      'https://njump.me/npub1tdlzj803pdsd5nt3a2v3g2s08c8ts0eqctcj9mlgae3nulysu24svv9s5n',
      '_blank'
    );
    setModalVisible(false);
  };

  return (
    <>
      <Button
        icon={<HeartOutlined />}
        onClick={handleOpenModal}
        style={{
          bottom: '-5px',
          zIndex: 1000,
          height: '50px',
          fontSize: '16px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 0 20px rgba(60, 247, 60, 0.3)',
        }}
      >
        {'// DONATE'}
      </Button>
      <DonationModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onLNInvoice={handleLNInvoice}
        onZapDeveloper={handleZapDeveloper}
        onZapWithNostr={handleZapWithNostr}
        monthlyTotal={monthlyTotal}
        loading={loading}
        isLoggedIn={!!pubkey}
      />
      <ZapModal visible={showZapModal} onClose={handleCloseModal} onBack={handleBackToMain} />
      <InvoiceFormModal
        visible={showInvoiceForm}
        onClose={handleCloseModal}
        onBack={handleBackToMain}
      />
    </>
  );
};

export default DonationButton;
