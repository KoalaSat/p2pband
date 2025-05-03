import React from 'react';
import { Modal, Button, Space, Typography } from 'antd';

const { Title, Paragraph } = Typography;

interface OnionAddressWarningProps {
  visible: boolean;
  onClose: () => void;
  onGo: () => void;
  onCopyClink: () => void;
  onGoClearnet: () => void;
  onDownloadTor: () => void;
  address: string;
}

const OnionAddressWarning: React.FC<OnionAddressWarningProps> = ({
  visible,
  onClose,
  onGo,
  onCopyClink,
  onGoClearnet,
  onDownloadTor,
  address,
}) => {
  return (
    <Modal
      title={
        <Title level={4}>
          {'>>'} ACESSING TOR NETWORK<span className="blink">_</span>
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
          <strong>[!] ATTEMPTING TO ACCESS ONION ADDRESS:</strong>
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
          .onion addresses require the Tor Browser to work properly. If you&lsquo;re not using Tor
          Browser, the link may not load correctly.
        </Paragraph>
        <Space direction="vertical" style={{ width: '100%', marginTop: '20px' }}>
          <Button type="primary" onClick={onGo} block>
            {'// I AM ALREADY USING TOR'}
          </Button>
          {/* <Button type="primary" onClick={onGoClearnet} block>
            {'// OPEN CLEARNET LINK /!\\ '}
          </Button> */}
          <Button onClick={onCopyClink} block>
            {'// COPY LINK'}
          </Button>
          <Button onClick={onDownloadTor} block>
            {'// DOWNLOAD TOR BROWSER'}
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default OnionAddressWarning;
