import React from 'react';
import { Modal, Button, Space, Typography } from 'antd';

const { Title, Paragraph } = Typography;

interface CreateOrderProps {
  visible: boolean;
  onClose: () => void;
}

const CreateOrder: React.FC<CreateOrderProps> = ({
  visible,
  onClose
}) => {
  const onCreateorder = () => {

  }

  return (
    <Modal
      title={<Title level={4}>{'>>'} CREATE ORDER_</Title>}
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
      className="digital-noise"
    >
      <div style={{ padding: '10px 0' }}>
        <Space direction="vertical" style={{ width: '100%', marginTop: '20px' }}>
          <Button type="primary" onClick={onCreateorder} block>
            {'// CREATE'}
          </Button>
          <Button onClick={onClose} block>
            {'// CANCEL'}
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default CreateOrder;
