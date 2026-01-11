import React, { useState } from 'react';
import { Button, Modal, Space, Typography, InputNumber, message } from 'antd';
import { HeartOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';

const { Title, Paragraph } = Typography;

interface DonationModalProps {
  visible: boolean;
  onClose: () => void;
  onLNInvoice: () => void;
  onZapDeveloper: () => void;
}

const DonationModal: React.FC<DonationModalProps> = ({
  visible,
  onClose,
  onLNInvoice,
  onZapDeveloper,
}) => {
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
        <Space direction="vertical" style={{ width: '100%', marginTop: '20px' }}>
          <Button type="primary" onClick={onLNInvoice} block>
            {'// GENERATE LN INVOICE'}
          </Button>
          <Button onClick={onZapDeveloper} block>
            {'// ZAP DEVELOPER'}
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
      'https://njump.me/npub1v3tgrwwsv7c6xckyhm5dmluc05jxd4yeqhpxew87chn0kua0tjzqc6yvjh',
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
