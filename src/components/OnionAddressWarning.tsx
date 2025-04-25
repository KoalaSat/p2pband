import React from 'react';
import { Modal, Button, Space, Typography } from 'antd';

const { Title, Paragraph } = Typography;

interface OnionAddressWarningProps {
  visible: boolean;
  onClose: () => void;
  onGo: () => void;
  onDownloadTor: () => void;
  address: string;
}

const OnionAddressWarning: React.FC<OnionAddressWarningProps> = ({
  visible,
  onClose,
  onGo,
  onDownloadTor,
  address,
}) => {
  return (
    <Modal
      title={<Title level={4}>Tor Network Warning</Title>}
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
    >
      <div style={{ padding: '10px 0' }}>
        <Paragraph>
          <strong>You're trying to access an .onion address:</strong>
        </Paragraph>
        <Paragraph code style={{ wordBreak: 'break-all' }}>
          {address}
        </Paragraph>
        <Paragraph>
          .onion addresses require the Tor Browser to work properly. If you're not using Tor
          Browser, the link may not load correctly.
        </Paragraph>
        <Space direction="vertical" style={{ width: '100%', marginTop: '20px' }}>
          <Button type="primary" onClick={onGo} block>
            Go Anyway
          </Button>
          <Button onClick={onDownloadTor} block>
            Download Tor Browser
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default OnionAddressWarning;
