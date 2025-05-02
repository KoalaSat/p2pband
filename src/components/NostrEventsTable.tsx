import React, { useEffect, useState } from 'react';
import { Table, Pagination, Typography, Spin, Alert, Tag, Select, Space, Card, Input } from 'antd';
import cypherpunkQuotes from '../data/cypherpunkQuotes.json';
import { ExportOutlined } from '@ant-design/icons';
import { ResponsiveLine } from '@nivo/line';
import OnionAddressWarning from './OnionAddressWarning';
import * as isoCountryCurrency from 'iso-country-currency';
import { processEvent, updateExchangeRates } from 'functions';
import { useNostrEvents } from 'context/NostrEventsContext';
import DepthChart from './DepthChart';

const { Title } = Typography;

// Define interface for depth chart data
interface DepthChartData {
  id: string;
  data: Array<{
    x: number;
    y: number;
  }>;
}

// Define the structure of the processed event data for the table
export interface EventTableData {
  id: string;
  source: string;
  is: string;
  amount: string;
  currencyCode: string | null;
  link: string;
  created_at: number;
  premium: string | null;
  bond: string | null;
  price: string | null;
  rawAmount: number | null;
  paymentMethods: string | null;
  pubkey: string;
}

// Function to get flag emoji from currency code using iso-country-currency library
const getCurrencyFlag = (currencyCode: string | null): string => {
  if (!currencyCode) return '';

  try {
    // Handle special cases for common currencies to ensure correct flags
    const specialCaseCurrencies: Record<string, string> = {
      USD: '🇺🇸', // United States Dollar
      EUR: '🇪🇺', // Euro
      GBP: '🇬🇧', // British Pound Sterling
      JPY: '🇯🇵', // Japanese Yen
      CAD: '🇨🇦', // Canadian Dollar
      AUD: '🇦🇺', // Australian Dollar
      CHF: '🇨🇭', // Swiss Franc
      CNY: '🇨🇳', // Chinese Yuan
      HKD: '🇭🇰', // Hong Kong Dollar
      SGD: '🇸🇬', // Singapore Dollar
      INR: '🇮🇳', // Indian Rupee
      RUB: '🇷🇺', // Russian Ruble
      BRL: '🇧🇷', // Brazilian Real
      ZAR: '🇿🇦', // South African Rand
      VES: '🇻🇪', // Venezuelan Bolívar Soberano
      USDVE: '🇻🇪', // USD in Venezuela (custom code)
      BTC: '₿', // Bitcoin with its symbol instead of a flag
    };

    // Check if we have a hardcoded flag for this currency
    if (specialCaseCurrencies[currencyCode]) {
      return specialCaseCurrencies[currencyCode];
    }

    // Get country code(s) from currency code for other currencies
    const countryCodes = isoCountryCurrency.getAllISOByCurrencyOrSymbol('currency', currencyCode);
    if (!countryCodes || countryCodes.length === 0) return '';

    // Use the first country code associated with this currency
    const countryCode = countryCodes[0];

    // Convert country code to regional indicator symbols (flag emoji)
    // Each letter is represented by a regional indicator symbol in the range U+1F1E6 to U+1F1FF
    const baseCharCode = 127462; // This is the Unicode code point for 🇦 (Regional Indicator Symbol Letter A)
    const countryChars = countryCode.toUpperCase().split('');

    return countryChars
      .map((char: string) => String.fromCodePoint(baseCharCode + char.charCodeAt(0) - 65))
      .join('');
  } catch (error) {
    return '';
  }
};

const NostrEventsTable: React.FC = () => {
  const { events, eventsLoading, eventsCount, pubkey, webOfTrustKeys, webOfTrustCount } =
    useNostrEvents();
  const [tableEvents, setTableEvents] = useState<EventTableData[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventTableData[]>([]);
  const [currentQuote, setCurrentQuote] = useState<{ quote: string; author: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [onionModalVisible, setOnionModalVisible] = useState<boolean>(false);
  const [currentOnionAddress, setCurrentOnionAddress] = useState<string>('');
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [webOfTrust, setWebOfTrust] = useState<boolean>(false);
  const [ratesLoading, setRatesLoading] = useState<boolean>(true);
  const [rateSources, setRateSources] = useState<string[]>([]);
  const [sortedInfo, setSortedInfo] = useState<{
    columnKey?: string | number;
    order?: 'ascend' | 'descend';
  }>({});

  // Filter states
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<string | null>(null);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('');
  const pageSize = 20;

  // Function to fetch exchange rates from multiple sources
  const fetchExchangeRates = async (): Promise<void> => {
    setRatesLoading(true);

    const [newRates, rateSources] = await updateExchangeRates();

    // Calculate average rates from all sources
    if (Object.keys(newRates).length > 0) {
      setExchangeRates(newRates);
      setRateSources(rateSources);
      setError(null);
    }

    setRatesLoading(false);
  };

  // Function to get a random cypherpunk quote
  const getRandomQuote = () => {
    const quotes = cypherpunkQuotes.quotes;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    return quotes[randomIndex];
  };

  const loadData = async () => {
    setRatesLoading(true);
    setError(null);
    setCurrentQuote(getRandomQuote());

    // First, fetch exchange rates
    fetchExchangeRates();
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle table change for sorting
  const handleTableChange = (_pagination: any, _filters: any, sorter: any) => {
    setSortedInfo(sorter);

    if (sorter && sorter.columnKey) {
      // Create sorting function based on the column that was clicked
      const sortFunction = (a: EventTableData, b: EventTableData) => {
        if (sorter.columnKey === 'premium') {
          const premiumA = a.premium ? parseFloat(a.premium) : 0;
          const premiumB = b.premium ? parseFloat(b.premium) : 0;
          return sorter.order === 'ascend' ? premiumA - premiumB : premiumB - premiumA;
        } else if (sorter.columnKey === 'bond') {
          const bondA = a.bond ? parseFloat(a.bond) : 0;
          const bondB = b.bond ? parseFloat(b.bond) : 0;
          return sorter.order === 'ascend' ? bondA - bondB : bondB - bondA;
        } else if (sorter.columnKey === 'created_at') {
          // Default sorting by timestamp (newest first or oldest first)
          return sorter.order === 'ascend'
            ? a.created_at - b.created_at
            : b.created_at - a.created_at;
        }
        return 0;
      };

      // Sort both the original and filtered events
      const sortedEvents = [...tableEvents].sort(sortFunction);
      const sortedFilteredEvents = [...filteredEvents].sort(sortFunction);

      // Update both state variables
      setTableEvents(sortedEvents);
      setFilteredEvents(sortedFilteredEvents);
    }
  };

  // Get unique values for filters
  const getUniqueSources = () => {
    const sources = new Set<string>();
    tableEvents.forEach(event => {
      if (event.source && event.source !== '-') {
        sources.add(event.source);
      }
    });
    return Array.from(sources).sort();
  };

  const getUniqueTypes = () => {
    const types = new Set<string>();
    tableEvents.forEach(event => {
      if (event.is && event.is !== '-') {
        types.add(event.is.toUpperCase());
      }
    });
    return Array.from(types).sort();
  };

  const getUniqueCurrencies = () => {
    const currencies = new Set<string>();
    tableEvents.forEach(event => {
      if (event.currencyCode) {
        currencies.add(event.currencyCode);
      }
    });
    return Array.from(currencies).sort();
  };

  // Handle filter changes
  const handleSourceFilterChange = (value: string | null) => {
    setSourceFilter(value);
  };

  const handleTypeFilterChange = (value: string | null) => {
    setTypeFilter(value);
  };

  const handleCurrencyFilterChange = (value: string | null) => {
    setCurrencyFilter(value);
  };

  const handlePaymentMethodFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentMethodFilter(e.target.value);
  };

  const clearFilters = () => {
    setWebOfTrust(false);
    setSourceFilter(null);
    setTypeFilter(null);
    setCurrencyFilter(null);
    setPaymentMethodFilter('');
  };

  // Handle .onion address actions
  const handleGoAnyway = () => {
    if (currentOnionAddress) {
      window.open(currentOnionAddress, '_blank', 'noopener,noreferrer');
    }
    setOnionModalVisible(false);
  };

  // Handle .onion address actions
  const onGoClearnet = () => {
    if (currentOnionAddress) {
      // Replace the onion domain with https://unsafe.robosats.org while preserving the path
      const clearNetAddress = currentOnionAddress.replace(
        /^https?:\/\/[^\/]+/,
        'https://unsafe.robosats.org'
      );
      window.open(clearNetAddress, '_blank', 'noopener,noreferrer');
    }
    setOnionModalVisible(false);
  };

  const onCopyClink = () => {
    if (currentOnionAddress) {
      navigator.clipboard
        .writeText(currentOnionAddress)
        .catch(err => console.error('Failed to copy address: ', err));
    }
    setOnionModalVisible(false);
  };

  const handleDownloadTor = () => {
    window.open('https://www.torproject.org/download/', '_blank', 'noopener,noreferrer');
    setOnionModalVisible(false);
  };

  const handleCloseModal = () => {
    setOnionModalVisible(false);
  };

  // Get a list of exchange rate sources for display with links
  const getRateSourcesList = () => {
    if (rateSources.length === 0) return 'No sources available';

    // Map of source names to their URLs
    const sourceUrls: Record<string, string> = {
      coingecko: 'https://www.coingecko.com',
      yadio: 'https://yadio.io',
    };

    return rateSources.map((source, index) => {
      // Capitalize first letter of source name
      const displayName = source.charAt(0).toUpperCase() + source.slice(1);

      // Get URL for this source if available
      const url = sourceUrls[source.toLowerCase()];

      return (
        <React.Fragment key={source}>
          {index > 0 && ', '}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
              {displayName}
            </a>
          ) : (
            displayName
          )}
        </React.Fragment>
      );
    });
  };

  const calculateFilteredevents = (updatedEvents: EventTableData[]) => {
    if (updatedEvents.length === 0) {
      setFilteredEvents([]);
      return;
    }

    let result = [...updatedEvents];

    // Apply source filter
    if (webOfTrust) {
      result = result.filter(event => webOfTrustKeys?.includes(event.pubkey));
    }

    // Apply source filter
    if (sourceFilter) {
      result = result.filter(event => event.source === sourceFilter);
    }

    // Apply type filter
    if (typeFilter) {
      result = result.filter(event => event.is.toUpperCase() === typeFilter);
    }

    // Apply currency filter
    if (currencyFilter) {
      result = result.filter(event => event.currencyCode === currencyFilter);
    }

    // Apply payment method filter
    if (paymentMethodFilter.trim() !== '') {
      result = result.filter(
        event =>
          event.paymentMethods &&
          event.paymentMethods.toLowerCase().includes(paymentMethodFilter.toLowerCase())
      );
    }

    setFilteredEvents(result);
    setTotalEvents(result.length);
    setCurrentPage(1);
  };

  // Main effect to coordinate data loading
  useEffect(() => {
    loadData();
  }, []);

  // Effect to update prices when exchange rates change
  useEffect(() => {
    if (
      (!ratesLoading && Object.keys(exchangeRates).length > 0) ||
      (!eventsLoading && Object.keys(events).length > 0)
    ) {
      const updatedEvents: EventTableData[] = [];

      events.forEach(event => {
        const data = processEvent(event, exchangeRates);
        if (data) updatedEvents.push(data);
      });

      setTableEvents(updatedEvents);

      calculateFilteredevents(updatedEvents);
    }
  }, [events, exchangeRates, ratesLoading, eventsLoading, eventsCount]);

  // Effect to filter events when filter states or events change
  useEffect(() => {
    calculateFilteredevents(tableEvents);
  }, [sourceFilter, typeFilter, currencyFilter, paymentMethodFilter, webOfTrust]);

  // Calculate current page data from filtered events
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentData = filteredEvents.slice(startIndex, endIndex);

  // Define table columns
  const columns = [
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (text: string) => {
        // Try to load the image from public/assets with the naming convention {value}.small.png
        const imagePath = `/assets/${text}.small.png`;
        return (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src={imagePath}
              alt={text}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                marginRight: '8px',
                objectFit: 'cover',
              }}
              onError={e => {
                // Fallback to text tag if image fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
            <Tag color="blue">{text}</Tag>
          </div>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'is',
      key: 'is',
      render: (text: string) => text.toUpperCase(),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
    {
      title: 'Currency',
      dataIndex: 'currencyCode',
      key: 'currency',
      render: (currencyCode: string | null) => {
        if (!currencyCode) return '-';
        const flag = getCurrencyFlag(currencyCode);
        return (
          <span>
            {currencyCode} {flag}
          </span>
        );
      },
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (value: string | null, record: EventTableData) => {
        if (!value) return '-';

        // Check if the price value starts with 0 (e.g., "0 VES/BTC")
        if (value.trim().startsWith('0 ') || value === '0' || value === '-') {
          return '-';
        }

        // If there's a premium, the price already includes it from the calculation function
        return value;
      },
    },
    {
      title: 'Premium',
      dataIndex: 'premium',
      key: 'premium',
      render: (value: string | null) => {
        if (!value) return <Tag color="default">-</Tag>;

        const premiumValue = parseFloat(value);
        let tagColor = 'default'; // grey for 0

        if (premiumValue > 0) {
          tagColor = 'success'; // green for positive
        } else if (premiumValue < 0) {
          tagColor = 'error'; // red for negative
        }

        return <Tag color={tagColor}>{premiumValue.toFixed(2)} %</Tag>;
      },
      sorter: true,
      sortOrder: sortedInfo.columnKey === 'premium' ? sortedInfo.order : null,
    },
    {
      title: 'Bond',
      dataIndex: 'bond',
      key: 'bond',
      render: (value: string | null) => (
        <Tag color="default">{value ? `${parseFloat(value).toFixed(2)} %` : '-'}</Tag>
      ),
      sorter: true,
      sortOrder: sortedInfo.columnKey === 'bond' ? sortedInfo.order : null,
    },
    {
      title: 'Payment Methods',
      dataIndex: 'paymentMethods',
      key: 'paymentMethods',
      render: (methods: string | null) => {
        if (!methods) return '-';

        // Check for characters that are likely emojis using a simple for loop
        // Most emojis have character codes > 127 (outside standard ASCII)
        let hasEmoji = false;
        for (let i = 0; i < methods.length; i++) {
          if (methods.charCodeAt(i) > 127) {
            hasEmoji = true;
            break;
          }
        }

        // If it contains emoji, display just a dash
        if (hasEmoji) return '-';

        return <div>{methods}</div>;
      },
    },

    {
      title: 'Link',
      dataIndex: 'link',
      key: 'link',
      render: (text: string) => {
        if (text && text !== '-') {
          const isOnionAddress = text.toLowerCase().includes('.onion');

          if (isOnionAddress) {
            return (
              <a
                href="#"
                onClick={e => {
                  e.preventDefault();
                  setCurrentOnionAddress(text);
                  setOnionModalVisible(true);
                }}
                title={text}
              >
                <ExportOutlined style={{ fontSize: '16px' }} />
              </a>
            );
          } else {
            return (
              <a href={text} target="_blank" rel="noopener noreferrer" title={text}>
                <ExportOutlined style={{ fontSize: '16px' }} />
              </a>
            );
          }
        } else {
          return '-';
        }
      },
    },
  ];

  return (
    <div style={{ padding: '0px 10px' }}>
      {error && <Alert message={error} type="error" style={{ marginBottom: '20px' }} />}

      <OnionAddressWarning
        visible={onionModalVisible}
        onClose={handleCloseModal}
        onGo={handleGoAnyway}
        onCopyClink={onCopyClink}
        onGoClearnet={onGoClearnet}
        onDownloadTor={handleDownloadTor}
        address={currentOnionAddress}
      />

      {ratesLoading ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 'calc(100vh - 200px)',
          }}
        >
          <Spin size="large" />
          {currentQuote && (
            <div style={{ marginTop: '20px', maxWidth: '600px', margin: '20px auto' }}>
              <p style={{ fontStyle: 'italic' }}>&quot;{currentQuote.quote}&quot;</p>
              <p style={{ fontWeight: 'bold' }}>— {currentQuote.author}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Depth Chart */}
          <Card style={{ marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}>
            <DepthChart tableEvents={filteredEvents} exchangeRates={exchangeRates} />
            <Title level={4} style={{ margin: '20px 0 0 0', minWidth: '120px' }}>
              {`${totalEvents}`} Total Orders
            </Title>
          </Card>

          {/* Filter UI */}
          <Card style={{ marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}>
            <div
              className="filter-container"
              style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}
            >
              <Title level={4} style={{ margin: '0', minWidth: '120px' }}>
                Filter Options:
              </Title>
              <Space wrap style={{ flex: 1 }}>
                <Select
                  style={{ width: 180 }}
                  placeholder="Source"
                  allowClear
                  onChange={handleSourceFilterChange}
                  value={sourceFilter}
                  options={getUniqueSources().map(source => ({ value: source, label: source }))}
                />
                <Select
                  style={{ width: 180 }}
                  placeholder="Type"
                  allowClear
                  onChange={handleTypeFilterChange}
                  value={typeFilter}
                  options={getUniqueTypes().map(type => ({ value: type, label: type }))}
                />
                <Select
                  style={{ width: 180 }}
                  placeholder="Currency"
                  allowClear
                  onChange={handleCurrencyFilterChange}
                  value={currencyFilter}
                  options={getUniqueCurrencies().map(currency => {
                    let flag = '';
                    try {
                      flag = getCurrencyFlag(currency);
                    } catch (error) {
                      console.log(`No flag found for ${currency.toUpperCase()}`);
                    }
                    return {
                      value: currency,
                      label: (
                        <span>
                          {currency} {flag}
                        </span>
                      ),
                    };
                  })}
                />
                <Input
                  style={{ width: 200 }}
                  placeholder="Payment Method"
                  value={paymentMethodFilter}
                  onChange={handlePaymentMethodFilterChange}
                  allowClear
                />
                {pubkey && (
                  <div
                    onClick={() => setWebOfTrust(v => !v)}
                    style={{
                      border: `2px solid ${webOfTrust ? '#41f4f4' : '#444'}`,
                      borderRadius: '4px',
                      padding: '2px 25px',
                      backgroundColor: '#000',
                      cursor: !webOfTrustKeys ? 'progress' : 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: webOfTrust ? '0 0 10px rgba(65, 244, 244, 0.5)' : 'none',
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
                          color: webOfTrust ? '#41f4f4' : '#666',
                          fontWeight: 'bold',
                        }}
                      >
                        Web of Trust
                      </span>
                      {!webOfTrustKeys || webOfTrustCount < 2 ? (
                        <Spin size="small" style={{ marginLeft: 10 }} />
                      ) : (
                        <>
                          <span
                            style={{
                              marginLeft: 10,
                              color: '#41f4f4',
                            }}
                          >
                            {webOfTrustCount}
                          </span>
                          <span
                            style={{
                              width: '12px',
                              height: '12px',
                              marginLeft: 10,
                              borderRadius: '50%',
                              backgroundColor: webOfTrust ? '#3cf73c' : '#666',
                              display: 'inline-block',
                              boxShadow: webOfTrust ? '0 0 5px #3cf73c' : 'none',
                            }}
                          ></span>
                        </>
                      )}
                    </div>

                    {/* Digital noise overlay for selected state */}
                    {webOfTrust && (
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
                )}
                <button
                  onClick={clearFilters}
                  style={{
                    background: '#222',
                    border: '1px solid #444',
                    color: '#fff',
                    padding: '5px 12px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                  disabled={!sourceFilter && !typeFilter && !currencyFilter && !paymentMethodFilter}
                >
                  Clear All Filters
                </button>
              </Space>
            </div>
          </Card>

          <Table
            dataSource={currentData}
            columns={columns}
            rowKey="id"
            pagination={false}
            bordered
            style={{ marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}
            onChange={handleTableChange}
            sortDirections={['ascend', 'descend']}
          />

          <Pagination
            responsive
            current={currentPage}
            pageSize={pageSize}
            total={totalEvents}
            onChange={handlePageChange}
            showSizeChanger={false}
            showLessItems={false}
            size="default"
            style={{
              width: '100%',
              textAlign: 'center',
              marginBottom: '20px',
            }}
          />
        </>
      )}

      <div
        className="footer-container"
        style={{
          marginTop: 'auto',
          padding: '10px 0',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div>
          {!ratesLoading && Object.keys(rateSources).length > 0 && (
            <small style={{ color: '#666' }}>
              Exchange rates: Average from {getRateSourcesList()}
            </small>
          )}
        </div>
        <div>
          <small style={{ color: '#666' }}>
            {'Vibe coded with 🐨 by'}
            <a
              href="https://njump.me/npub1v3tgrwwsv7c6xckyhm5dmluc05jxd4yeqhpxew87chn0kua0tjzqc6yvjh"
              target="_blank"
              style={{ marginLeft: 4 }}
              rel="noreferrer"
            >
              KoalaSat
            </a>
          </small>
        </div>
      </div>
      <style>
        {`
            @media (max-width: 768px) {
              .footer-container {
                flex-direction: column;
                align-items: flex-start;
              }
            }
          `}
      </style>
    </div>
  );
};

export default NostrEventsTable;
