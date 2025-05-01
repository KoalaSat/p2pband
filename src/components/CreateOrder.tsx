import React, { useState, useMemo } from 'react';
import { Modal, Button, Space, Typography, Select, InputNumber, Form, Row, Col, Input } from 'antd';
import currenciesData from '../data/currencies.json';
import { useNostrEvents } from 'context/NostrEventsContext';
import { v4 as uuidv4 } from 'uuid';
import { Event } from 'nostr-tools/lib/types/core';
import { nip19, SimplePool } from 'nostr-tools';

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

const { Title, Paragraph } = Typography;
const { Option } = Select;

interface CreateOrderProps {
  visible: boolean;
  onClose: () => void;
}

interface OrderFormData {
  orderType: 'buy' | 'sell';
  premium: number;
  currency: string;
  amountType: 'fixed' | 'range';
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  layers: string[];
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

const CreateOrder: React.FC<CreateOrderProps> = ({ visible, onClose }) => {
  const { pubkey, relays, outboxRelays } = useNostrEvents();
  const [form] = Form.useForm<OrderFormData>();
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [premium, setPremium] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('USD');
  const [paymentMethods, setPaymentMethods] = useState<string>('');
  const [amountType, setAmountType] = useState<'fixed' | 'range'>('fixed');
  const [amount, setAmount] = useState<number | null>(null);
  const [amountMin, setAmountMin] = useState<number | null>(null);
  const [amountMax, setAmountMax] = useState<number | null>(null);
  const [layers, setLayers] = useState<string[]>(['lightning']);
  const [publishing, setPublishing] = useState<boolean>(false);

  // Combine all currencies (fiat and crypto) for the selector
  const allCurrencies = useMemo(() => {
    return [...currenciesData.fiat, ...currenciesData.crypto];
  }, []);

  const onCreateorder = async () => {
    // Ensure at least one layer is selected
    if (layers.length === 0) {
      console.error('You must select at least one layer (Onchain or Lightning)');
      return;
    }
    if (!pubkey) {
      console.error('PubKey not found');
      return;
    }
    setPublishing(true);
    const formData = {
      orderType,
      premium,
      currency,
      amountType,
      ...(amountType === 'fixed' ? { amount } : { amountMin, amountMax }),
      layers,
    };
    console.log('Order data:', formData);

    // Create nostr event
    const now = Math.floor(Date.now() / 1000);
    const expirationTime = now + 86400; // 24h expiration time

    // Build the nostr event
    const nostrEvent = {
      pubkey: pubkey,
      created_at: now,
      kind: 38383,
      tags: [
        ['d', uuidv4()],
        ['k', orderType],
        ['f', currency],
        ['s', 'pending'],
        ['amt', amountType === 'fixed' ? amount?.toString() || '0' : '0'],
        ['fa', amountType === 'fixed' ? amount?.toString() || '0' : amountMin?.toString() || '0'],
        ['pm', paymentMethods.toString()],
        ['premium', premium.toString()],
        ['source', `https://njump.me/:${nip19.npubEncode(pubkey)}`],
        ['network', 'mainnet'],
        ['layer', layers.join(',')],
        ['bond', '0'],
        ['expiration', expirationTime.toString()],
        ['y', 'nostr'],
        ['z', 'order'],
      ],
      content: '',
    };

    try {
      // Check if window.nostr is available (browser extension)
      if (typeof window.nostr === 'undefined') {
        console.error('Nostr extension not found. Please install a Nostr browser extension.');
        return;
      }
      console.log('Signing: ', nostrEvent);

      // Sign the event using window.nostr
      const signedEvent = await window.nostr.signEvent(nostrEvent);

      // Log the signed event
      console.log('Signed Nostr event:', signedEvent);
      publishOrder(signedEvent);
    } catch (error) {
      console.error('Error signing Nostr event:', error);
    }
  };

  const publishOrder = async (signedEvent: Event) => {
    try {
      const publishRelays = [...relays, ...outboxRelays].reduce<string[]>(
        (accumulator, current) => {
          // Remove the last character if it's a '/'
          const modifiedCurrent = current.endsWith('/') ? current.slice(0, -1) : current;

          // Check if the modified current string is already in the accumulator
          if (!accumulator.includes(modifiedCurrent)) {
            accumulator.push(modifiedCurrent);
          }
          return accumulator;
        },
        []
      );

      console.log('Publishing order to relays:', publishRelays);

      const pool = new SimplePool();

      setPublishing(false);
      onClose();

      // Publish the event to all outbox relays
      const publishPromises = pool.publish(publishRelays, signedEvent);

      // Wait for the results
      const publishResults = await Promise.all(publishPromises);

      // Check if the event was published successfully to at least one relay
      const successfulPublishes = publishResults.filter((result: string) => result);

      if (successfulPublishes.length > 0) {
        console.log(`Order published successfully to ${successfulPublishes.length} relays`);
      } else {
        console.error('Failed to publish order to any relay');
      }
      // Close the pool connection
      pool.close(publishRelays);
    } catch (error) {
      console.error('Error publishing order:', error);
    }
  };

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
        <Form
          form={form}
          layout="vertical"
          style={{
            width: '100%',
            fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
            fontSize: '15px',
          }}
        >
          <Form.Item
            label={
              <span
                style={{
                  color: '#41f4f4',
                  fontWeight: 'bold',
                  fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                }}
              >
                <strong>[!] I WANT TO:</strong>
              </span>
            }
            name="orderType"
          >
            <Select
              defaultValue="buy"
              onChange={value => setOrderType(value as 'buy' | 'sell')}
              style={{
                width: '100%',
                backgroundColor: '#000',
                border: '1px solid #3cf73c',
                color: '#3cf73c',
                fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
              }}
              dropdownStyle={{
                backgroundColor: '#000',
                borderColor: '#3cf73c',
              }}
            >
              <Option value="buy" style={{ color: '#3cf73c' }}>
                BUY
              </Option>
              <Option value="sell" style={{ color: '#3cf73c' }}>
                SELL
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            label={
              <span
                style={{
                  color: '#41f4f4',
                  fontWeight: 'bold',
                  fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                }}
              >
                <strong>[!] CURRENCY:</strong>
              </span>
            }
            name="currency"
          >
            <Select
              showSearch
              defaultValue="USD"
              onChange={value => setCurrency(value)}
              style={{
                width: '100%',
                backgroundColor: '#000',
                border: '1px solid #3cf73c',
                color: '#3cf73c',
                fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
              }}
              dropdownStyle={{
                backgroundColor: '#000',
                borderColor: '#3cf73c',
              }}
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.value?.toString().toLowerCase() ?? '').includes(input.toLowerCase()) ||
                (option?.children?.toString().toLowerCase() ?? '').includes(input.toLowerCase())
              }
              placeholder="Select a currency"
            >
              {allCurrencies.map((curr: Currency) => (
                <Option key={curr.code} value={curr.code} style={{ color: '#3cf73c' }}>
                  {curr.code} - {curr.name} {curr.symbol}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label={
              <span
                style={{
                  color: '#41f4f4',
                  fontWeight: 'bold',
                  fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                }}
              >
                <strong>[!] AMOUNT:</strong>
              </span>
            }
          >
            <Row gutter={16}>
              <Col span={12}>
                <div
                  onClick={() => setAmountType('fixed')}
                  style={{
                    border: `2px solid ${amountType == 'fixed' ? '#41f4f4' : '#444'}`,
                    borderRadius: '4px',
                    padding: '10px',
                    backgroundColor: '#000',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: amountType == 'fixed' ? '0 0 10px rgba(65, 244, 244, 0.5)' : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Terminal Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: amountType == 'fixed' ? '#41f4f4' : '#666',
                        fontWeight: 'bold',
                      }}
                    >
                      {'>_'} FIXED AMOUNT
                    </span>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: amountType == 'fixed' ? '#3cf73c' : '#666',
                        display: 'inline-block',
                        boxShadow: amountType == 'fixed' ? '0 0 5px #3cf73c' : 'none',
                      }}
                    ></span>
                  </div>

                  {/* Digital noise overlay for selected state */}
                  {amountType == 'fixed' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage:
                          'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c4zIgcAAAAEXRSTlP0/vwOJhEbFvn49vPbvbSgZpv4SiUAAACQSURBVEjH7ZTbCoAgEEWX5GXUvGvu///oOLM+FCQaaPAczZ6zVYaI/cwEU4noqVAqWMtGmHB6cBIseYgQIUKE/CExZI98fHJCrCdP+KPfkIkSos8KsOUGfPNXdD1Ru8FxepIatIorJUQ/L2BPuqJAvrJruGZZuGZvO7ZxO0pR8Nu4PYTbGtruhbcGbpvVnQv/zAsRXxky9QAAAABJRU5ErkJggg==")',
                        opacity: 0.05,
                        pointerEvents: 'none',
                      }}
                    ></div>
                  )}
                </div>
              </Col>
              <Col span={12}>
                <div
                  onClick={() => setAmountType('range')}
                  style={{
                    border: `2px solid ${amountType == 'range' ? '#41f4f4' : '#444'}`,
                    borderRadius: '4px',
                    padding: '10px',
                    backgroundColor: '#000',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: amountType == 'range' ? '0 0 10px rgba(65, 244, 244, 0.5)' : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Terminal Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: amountType == 'range' ? '#41f4f4' : '#666',
                        fontWeight: 'bold',
                      }}
                    >
                      {'>_'} RANGE
                    </span>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: amountType == 'range' ? '#3cf73c' : '#666',
                        display: 'inline-block',
                        boxShadow: amountType == 'range' ? '0 0 5px #3cf73c' : 'none',
                      }}
                    ></span>
                  </div>

                  {/* Digital noise overlay for selected state */}
                  {amountType == 'range' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage:
                          'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c4zIgcAAAAEXRSTlP0/vwOJhEbFvn49vPbvbSgZpv4SiUAAACQSURBVEjH7ZTbCoAgEEWX5GXUvGvu///oOLM+FCQaaPAczZ6zVYaI/cwEU4noqVAqWMtGmHB6cBIseYgQIUKE/CExZI98fHJCrCdP+KPfkIkSos8KsOUGfPNXdD1Ru8FxepIatIorJUQ/L2BPuqJAvrJruGZZuGZvO7ZxO0pR8Nu4PYTbGtruhbcGbpvVnQv/zAsRXxky9QAAAABJRU5ErkJggg==")',
                        opacity: 0.05,
                        pointerEvents: 'none',
                      }}
                    ></div>
                  )}
                </div>
              </Col>
            </Row>

            {amountType === 'fixed' ? (
              <div>
                <Paragraph
                  style={{
                    color: '#41f4f4',
                    fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                    fontSize: '12px',
                    margin: '5px 0',
                  }}
                >
                  EXACT AMOUNT TO TRADE:
                </Paragraph>
                <InputNumber
                  min={0}
                  onChange={value => setAmount(value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#000',
                    borderColor: '#3cf73c',
                    color: '#3cf73c',
                    fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                  }}
                  placeholder="Enter amount"
                />
              </div>
            ) : (
              <div>
                <Paragraph
                  style={{
                    color: '#41f4f4',
                    fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                    fontSize: '12px',
                    margin: '5px 0',
                  }}
                >
                  AMOUNT RANGE TO TRADE:
                </Paragraph>
                <Row gutter={8}>
                  <Col span={11}>
                    <InputNumber
                      min={0}
                      onChange={value => setAmountMin(value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#000',
                        borderColor: '#3cf73c',
                        fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                      }}
                      placeholder="Min"
                    />
                  </Col>
                  <Col span={2} style={{ textAlign: 'center' }}>
                    to
                  </Col>
                  <Col span={11}>
                    <InputNumber
                      min={0}
                      onChange={value => setAmountMax(value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#000',
                        borderColor: '#3cf73c',
                        fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                      }}
                      placeholder="Max"
                    />
                  </Col>
                </Row>
              </div>
            )}
          </Form.Item>

          <Form.Item
            label={
              <span
                style={{
                  color: '#41f4f4',
                  fontWeight: 'bold',
                  fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                }}
              >
                <strong>[!] PREMIUM OVER MARKET PRICE:</strong>
              </span>
            }
            name="premium"
            tooltip="Add negative values for under market prices"
          >
            <InputNumber
              defaultValue={0}
              min={-100}
              max={100}
              onChange={value => setPremium(value as number)}
              addonAfter="%"
              style={{
                width: '100%',
                backgroundColor: '#000',
                borderColor: '#3cf73c',
                fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
              }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span
                style={{
                  color: '#41f4f4',
                  fontWeight: 'bold',
                  fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                }}
              >
                <strong>[!] PAYMENT METHOD(S):</strong>
              </span>
            }
            name="patmentMethods"
          >
            <Input
              onChange={value => setPaymentMethods(value.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#000',
                borderColor: '#3cf73c',
                fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
              }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span
                style={{
                  color: '#41f4f4',
                  fontWeight: 'bold',
                  fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
                }}
              >
                <strong>[!] LAYER:</strong>
              </span>
            }
            name="layers"
            required
            tooltip="At least one layer must be selected"
          >
            <Row gutter={16}>
              {/* Onchain Terminal Panel */}
              <Col span={12}>
                <div
                  onClick={() => {
                    // Toggle onchain selection
                    const newLayers = layers.includes('onchain')
                      ? layers.filter(l => l !== 'onchain')
                      : [...layers, 'onchain'];

                    // Ensure at least one option remains selected
                    if (newLayers.length > 0) {
                      setLayers(newLayers);
                    }
                  }}
                  style={{
                    border: `2px solid ${layers.includes('onchain') ? '#41f4f4' : '#444'}`,
                    borderRadius: '4px',
                    padding: '10px',
                    backgroundColor: '#000',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: layers.includes('onchain')
                      ? '0 0 10px rgba(65, 244, 244, 0.5)'
                      : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Terminal Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: layers.includes('onchain') ? '#41f4f4' : '#666',
                        fontWeight: 'bold',
                      }}
                    >
                      {'>_'} ONCHAIN.NET
                    </span>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: layers.includes('onchain') ? '#3cf73c' : '#666',
                        display: 'inline-block',
                        boxShadow: layers.includes('onchain') ? '0 0 5px #3cf73c' : 'none',
                      }}
                    ></span>
                  </div>

                  {/* Digital noise overlay for selected state */}
                  {layers.includes('onchain') && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage:
                          'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c4zIgcAAAAEXRSTlP0/vwOJhEbFvn49vPbvbSgZpv4SiUAAACQSURBVEjH7ZTbCoAgEEWX5GXUvGvu///oOLM+FCQaaPAczZ6zVYaI/cwEU4noqVAqWMtGmHB6cBIseYgQIUKE/CExZI98fHJCrCdP+KPfkIkSos8KsOUGfPNXdD1Ru8FxepIatIorJUQ/L2BPuqJAvrJruGZZuGZvO7ZxO0pR8Nu4PYTbGtruhbcGbpvVnQv/zAsRXxky9QAAAABJRU5ErkJggg==")',
                        opacity: 0.05,
                        pointerEvents: 'none',
                      }}
                    ></div>
                  )}
                </div>
              </Col>

              {/* Lightning Terminal Panel */}
              <Col span={12}>
                <div
                  onClick={() => {
                    // Toggle lightning selection
                    const newLayers = layers.includes('lightning')
                      ? layers.filter(l => l !== 'lightning')
                      : [...layers, 'lightning'];

                    // Ensure at least one option remains selected
                    if (newLayers.length > 0) {
                      setLayers(newLayers);
                    }
                  }}
                  style={{
                    border: `2px solid ${layers.includes('lightning') ? '#ffec3d' : '#444'}`,
                    borderRadius: '4px',
                    padding: '10px',
                    backgroundColor: '#000',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: layers.includes('lightning')
                      ? '0 0 10px rgba(255, 236, 61, 0.5)'
                      : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Terminal Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: layers.includes('lightning') ? '#ffec3d' : '#666',
                        fontWeight: 'bold',
                      }}
                    >
                      {'>_'} LIGHTNING
                    </span>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: layers.includes('lightning') ? '#ffec3d' : '#666',
                        display: 'inline-block',
                        boxShadow: layers.includes('lightning') ? '0 0 5px #ffec3d' : 'none',
                      }}
                    ></span>
                  </div>

                  {/* Digital noise overlay for selected state */}
                  {layers.includes('lightning') && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage:
                          'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c4zIgcAAAAEXRSTlP0/vwOJhEbFvn49vPbvbSgZpv4SiUAAACQSURBVEjH7ZTbCoAgEEWX5GXUvGvu///oOLM+FCQaaPAczZ6zVYaI/cwEU4noqVAqWMtGmHB6cBIseYgQIUKE/CExZI98fHJCrCdP+KPfkIkSos8KsOUGfPNXdD1Ru8FxepIatIorJUQ/L2BPuqJAvrJruGZZuGZvO7ZxO0pR8Nu4PYTbGtruhbcGbpvVnQv/zAsRXxky9QAAAABJRU5ErkJggg==")',
                        opacity: 0.05,
                        pointerEvents: 'none',
                      }}
                    ></div>
                  )}
                </div>
              </Col>
            </Row>
          </Form.Item>
        </Form>
        <Space direction="vertical" style={{ width: '100%', marginTop: '20px' }}>
          <Button
            type="primary"
            onClick={onCreateorder}
            block
            disabled={!amount && paymentMethods !== ''}
            loading={publishing}
          >
            {'// PUBLISH'}
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
