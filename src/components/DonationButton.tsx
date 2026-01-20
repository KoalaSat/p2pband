import React, { useState, useEffect } from 'react';
import { Button, Modal, Space, Typography, InputNumber, message, Progress } from 'antd';
import { HeartOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { SimplePool } from 'nostr-tools';
import { Event } from 'nostr-tools/lib/types/core';
import { useNostrEvents } from '../context/NostrEventsContext';

const { Title, Paragraph } = Typography;

const DEVELOPER_PUBKEY = '5b7e291df10b60da4d71ea99142a0f3e0eb83f20c2f122efe8ee633e7c90e2ab';
const MONTHLY_GOAL_SATS = 15000;

interface DonationModalProps {
  visible: boolean;
  onClose: () => void;
  onLNInvoice: () => void;
  onZapDeveloper: () => void;
  monthlyTotal: number;
  loading: boolean;
}

const DonationModal: React.FC<DonationModalProps> = ({
  visible,
  onClose,
  onLNInvoice,
  onZapDeveloper,
  monthlyTotal,
  loading,
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
          <Button type="primary" onClick={onZapDeveloper} block>
            {'// ZAP DEVELOPER'}
          </Button>
          <Button onClick={onLNInvoice} block>
            {'// GENERATE LN INVOICE'}
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
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { relays } = useNostrEvents();

  // Fetch monthly zaps when component mounts or modal opens
  useEffect(() => {
    if (modalVisible) {
      fetchMonthlyZaps();
    }
  }, [modalVisible]);

  const fetchMonthlyZaps = async () => {
    setLoading(true);
    try {
      console.log('Fetching monthly zaps from relays:', relays);
      const pool = new SimplePool();

      // Calculate timestamp for the start of this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);

      console.log('Querying for zaps since:', new Date(startTimestamp * 1000).toISOString());

      // Fetch zap events (kind 9735) for the developer's pubkey
      const zapEvents = await pool.querySync(
        relays,
        {
          kinds: [9735],
          '#p': [DEVELOPER_PUBKEY],
          since: startTimestamp,
        },
        {
          id: 'monthlyDonations',
        }
      );

      console.log('Received zap events:', zapEvents.length);

      // Calculate total satoshis from zap events
      let totalSats = 0;
      zapEvents.forEach((event: Event) => {
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
          }
        }
      });

      console.log('Total satoshis calculated:', totalSats);
      setMonthlyTotal(totalSats);
    } catch (error) {
      console.error('Error fetching monthly zaps:', error);
      setMonthlyTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setModalVisible(true);
    setShowInvoiceForm(false);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setShowInvoiceForm(false);
  };

  const handleLNInvoice = () => {
    setModalVisible(false);
    setShowInvoiceForm(true);
  };

  const handleBackToMain = () => {
    setShowInvoiceForm(false);
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
        monthlyTotal={monthlyTotal}
        loading={loading}
      />
      <InvoiceFormModal
        visible={showInvoiceForm}
        onClose={handleCloseModal}
        onBack={handleBackToMain}
      />
    </>
  );
};

export default DonationButton;
