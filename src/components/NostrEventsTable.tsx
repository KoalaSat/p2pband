import React, { useEffect, useState } from 'react';
import { Table, Pagination, Typography, Spin, Alert, Tag, Select, Space, Card } from 'antd';
import { ResponsiveLine } from '@nivo/line';
import OnionAddressWarning from './OnionAddressWarning';
import { Filter } from 'nostr-tools/lib/types/filter';
import { Event } from 'nostr-tools/lib/types/core';
import { SimplePool } from 'nostr-tools';
import * as isoCountryCurrency from 'iso-country-currency';

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
interface EventTableData {
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
    console.error(`Error getting flag for currency ${currencyCode}:`, error);
    return '';
  }
};

const NostrEventsTable: React.FC = () => {
  const [events, setEvents] = useState<EventTableData[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventTableData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [onionModalVisible, setOnionModalVisible] = useState<boolean>(false);
  const [currentOnionAddress, setCurrentOnionAddress] = useState<string>('');
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [ratesLoading, setRatesLoading] = useState<boolean>(true);
  const [rateSources, setRateSources] = useState<Record<string, Record<string, number>>>({});
  const [sortedInfo, setSortedInfo] = useState<{
    columnKey?: string | number;
    order?: 'ascend' | 'descend';
  }>({});
  const [depthChartData, setDepthChartData] = useState<DepthChartData[]>([]);

  // Filter states
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<string | null>(null);
  const pageSize = 20;

  // Function to format amount values
  const formatAmount = (value: string): string => {
    const num = parseFloat(value);

    if (isNaN(num)) return value;

    // Format with thousands separators
    return Math.floor(num).toLocaleString();
  };

  // Function to calculate exchange rate pair for display in the Price column
  const calculateBtcPrice = (
    amount: number | null,
    currencyCode: string | null,
    premium: string | null
  ): string | null => {
    try {
      console.log('calculateBtcPrice: Starting with', { amount, currencyCode, premium });

      if (!amount) {
        console.log('calculateBtcPrice: No amount provided');
        return null;
      }

      if (!currencyCode) {
        console.log('calculateBtcPrice: No currency code provided');
        return null;
      }

      const upperCaseCurrency = currencyCode.toUpperCase();

      if (!exchangeRates[upperCaseCurrency]) {
        console.log(`calculateBtcPrice: No exchange rate found for ${upperCaseCurrency}`);

        // Check if we have any individual source rates for this currency
        const sourcesWithRate: Record<string, number> = {};
        Object.entries(rateSources).forEach(([sourceName, sourceRates]) => {
          if (sourceRates[upperCaseCurrency]) {
            sourcesWithRate[sourceName] = sourceRates[upperCaseCurrency];
          }
        });

        // If we have at least one source with a rate, use that
        if (Object.keys(sourcesWithRate).length > 0) {
          console.log(
            `Found rates for ${upperCaseCurrency} in individual sources:`,
            sourcesWithRate
          );

          // Calculate the average of available rates
          const rates = Object.values(sourcesWithRate);
          const averageRate = calculateAverage(rates);

          // If the average is 0, return null
          if (averageRate === 0) {
            return null;
          }

          // Apply premium
          let finalRate = averageRate;
          if (premium) {
            const premiumPercent = parseFloat(premium) / 100;
            finalRate = averageRate * (1 + premiumPercent);
          }

          // Return in format: {rate with premium} {currency code}/BTC
          const result = `${finalRate.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })} ${upperCaseCurrency}/BTC`;
          console.log(`Using calculated average: ${result}`);
          return result;
        }

        // No rate available, return null
        return null;
      }

      // Get the base exchange rate
      const baseRate = exchangeRates[upperCaseCurrency];

      // If the base rate is 0, return null
      if (baseRate === 0) {
        return null;
      }

      // Apply premium to the rate if it exists
      let finalRate = baseRate;
      if (premium) {
        const premiumPercent = parseFloat(premium) / 100;
        finalRate = baseRate * (1 + premiumPercent);
        console.log(`Applying premium of ${premium} %: ${baseRate} → ${finalRate}`);
      }

      // Return in format: {rate with premium} {currency code}/BTC
      const result = `${finalRate.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} ${upperCaseCurrency}/BTC`;
      console.log(`calculateBtcPrice: Calculated price: ${result}`);
      return result;
    } catch (error) {
      console.error('Error in calculateBtcPrice:', error);
      return null;
    }
  };

  // Helper function to calculate average of array values
  const calculateAverage = (values: number[]): number => {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];

    // Sum all values and divide by the number of values
    const sum = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    return sum / values.length;
  };

  // Function to prepare data for the depth chart
  const prepareDepthChartData = (eventsData: EventTableData[]): DepthChartData[] => {
    if (eventsData.length === 0) {
      return [];
    }

    // Create maps to hold premium -> amount mappings before accumulating
    const buyPremiumMap: Map<number, number> = new Map();
    const sellPremiumMap: Map<number, number> = new Map();

    // Process each event
    eventsData.forEach(event => {
      // Skip events without premium or raw amount
      if (!event.premium || !event.rawAmount || !event.currencyCode) {
        return;
      }

      // Parse premium as number
      const premiumValue = parseFloat(event.premium);

      // Convert amount to BTC using the exchange rate (reverse the rate)
      let btcAmount = 0;
      const currencyCode = event.currencyCode.toUpperCase();

      if (exchangeRates[currencyCode] && exchangeRates[currencyCode] > 0) {
        // Calculate the exchange rate with premium applied
        const rateWithPremium = exchangeRates[currencyCode] * (1 + premiumValue / 100);

        // Apply reverse exchange rate to get BTC amount
        btcAmount = event.rawAmount / rateWithPremium;
      }

      // Skip events with zero BTC amount
      if (btcAmount <= 0) {
        return;
      }

      // Add to appropriate map based on event type (buy/sell)
      if (event.is.toLowerCase() === 'buy') {
        // If premium already exists, add to the amount
        if (buyPremiumMap.has(premiumValue)) {
          buyPremiumMap.set(premiumValue, buyPremiumMap.get(premiumValue)! + btcAmount);
        } else {
          buyPremiumMap.set(premiumValue, btcAmount);
        }
      } else if (event.is.toLowerCase() === 'sell') {
        // If premium already exists, add to the amount
        if (sellPremiumMap.has(premiumValue)) {
          sellPremiumMap.set(premiumValue, sellPremiumMap.get(premiumValue)! + btcAmount);
        } else {
          sellPremiumMap.set(premiumValue, btcAmount);
        }
      }
    });

    // Create arrays from maps for buy and sell data
    const buyArray: { premium: number; amount: number }[] = Array.from(
      buyPremiumMap.entries()
    ).map(([premium, amount]) => ({ premium, amount }));

    const sellArray: { premium: number; amount: number }[] = Array.from(
      sellPremiumMap.entries()
    ).map(([premium, amount]) => ({ premium, amount }));

    // Sort buy orders from highest to lowest premium
    buyArray.sort((a, b) => b.premium - a.premium);

    // Sort sell orders from lowest to highest premium
    sellArray.sort((a, b) => a.premium - b.premium);

    // Accumulate amounts
    const buyData: { x: number; y: number }[] = [];
    let buyAccumulated = 0;
    buyArray.forEach(item => {
      buyAccumulated += item.amount;
      buyData.push({ x: item.premium, y: buyAccumulated });
    });

    const sellData: { x: number; y: number }[] = [];
    let sellAccumulated = 0;
    sellArray.forEach(item => {
      sellAccumulated += item.amount;
      sellData.push({ x: item.premium, y: sellAccumulated });
    });

    return [
      {
        id: 'Buy Orders',
        data: buyData,
      },
      {
        id: 'Sell Orders',
        data: sellData,
      },
    ];
  };

  // Function to combine exchange rates from multiple sources and calculate the average
  const calculateAverageRates = (
    sources: Record<string, Record<string, number>>
  ): Record<string, number> => {
    console.log('Calculating average rates from sources:', sources);
    const averageRates: Record<string, number> = {};
    const allCurrencies = new Set<string>();

    // Collect all unique currency codes across all sources
    Object.values(sources).forEach(sourceRates => {
      Object.keys(sourceRates).forEach(currency => {
        allCurrencies.add(currency);
      });
    });

    // For each currency, calculate the average rate across all sources
    allCurrencies.forEach(currency => {
      const rates: number[] = [];

      // Collect rates for this currency from all sources
      Object.values(sources).forEach(sourceRates => {
        if (sourceRates[currency] !== undefined) {
          rates.push(sourceRates[currency]);
        }
      });

      // Calculate average rate if we have any rates
      if (rates.length > 0) {
        averageRates[currency] = calculateAverage(rates);
        console.log(
          `Average rate for ${currency}: ${averageRates[currency]} from values: ${rates.join(', ')}`
        );
      }
    });

    return averageRates;
  };

  // Manually force a refresh of all displayed prices
  const refreshAllPrices = () => {
    if (events.length > 0) {
      console.log('Manually refreshing all prices...');

      // Update prices for all events based on rates in rateSources
      const updatedEvents = events.map(event => {
        const newPrice = calculateBtcPrice(event.rawAmount, event.currencyCode, event.premium);
        return {
          ...event,
          price: newPrice,
        };
      });

      setEvents(updatedEvents);
    }
  };

  // Function to fetch exchange rates from multiple sources
  const fetchExchangeRates = async (): Promise<void> => {
    setRatesLoading(true);
    console.log('Fetching exchange rates from multiple sources...');

    // Create a new copy of the current rate sources
    const newRateSources: Record<string, Record<string, number>> = {};
    let hasErrors = false;

    // Fetch from CoinGecko API
    try {
      const coinGeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp,jpy,cad,aud,chf,cny,krw,inr,brl,rub,mxn,zar`;

      console.log('Fetching from CoinGecko:', coinGeckoUrl);
      const response = await fetch(coinGeckoUrl);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('CoinGecko response:', data);

      // Check if we have valid data
      if (data && data.bitcoin) {
        // Convert rates to uppercase keys for consistency
        const rates: Record<string, number> = {};
        Object.entries(data.bitcoin).forEach(([currency, rate]) => {
          rates[currency] = rate as number;
        });

        console.log('Processed CoinGecko rates:', rates);

        // Add to sources
        newRateSources['coingecko'] = rates;
      } else {
        console.error('Invalid response from CoinGecko API:', data);
        hasErrors = true;
      }
    } catch (error) {
      console.error('Error fetching CoinGecko exchange rates:', error);
      hasErrors = true;
    }

    // Fetch from Yadio API
    try {
      const yadioUrl = `https://api.yadio.io/exrates/BTC`;

      console.log('Fetching from Yadio:', yadioUrl);
      const response = await fetch(yadioUrl);

      if (!response.ok) {
        throw new Error(`Yadio API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Yadio response:', data);

      // Check if we have valid data
      if (data && data.BTC) {
        // Convert rates to uppercase keys for consistency
        const rates: Record<string, number> = {};
        Object.entries(data.BTC).forEach(([currency, rate]) => {
          rates[currency] = rate as number;
        });

        console.log('Processed Yadio rates:', rates);

        // Add to sources
        newRateSources['yadio'] = rates;
      } else {
        console.error('Invalid response from Yadio API:', data);
        hasErrors = true;
      }
    } catch (error) {
      console.error('Error fetching Yadio exchange rates:', error);
      hasErrors = true;
    }

    // Update rateSources state
    setRateSources(newRateSources);

    // Calculate average rates from all sources
    if (Object.keys(newRateSources).length > 0) {
      console.log(newRateSources);
      const averageRates = calculateAverageRates(newRateSources);
      console.log('Final average rates:', averageRates);
      setExchangeRates(averageRates);

      // Only clear error if we have at least one successful source
      setError(null);

      // Immediately force a refresh of prices with the new rates
      setTimeout(() => {
        console.log('Forcing immediate price refresh after rate update');
        refreshAllPrices();
      }, 100);
    } else if (hasErrors) {
      setError(
        'Failed to fetch exchange rates from all sources. Price column may not display correctly.'
      );
      setExchangeRates({});
    }

    setRatesLoading(false);
  };

  // Function to process raw Nostr events into the format needed for the table
  const processEvent = (event: Event): EventTableData | null => {
    try {
      // Find the required tags
      const sourceTag = event.tags.find(tag => tag[0] === 'y');
      const isTag = event.tags.find(tag => tag[0] === 'k');
      const amountTag = event.tags.find(tag => tag[0] === 'fa');
      const currencyTag = event.tags.find(tag => tag[0] === 'f');
      const linkTag = event.tags.find(tag => tag[0] === 'source');
      const sTag = event.tags.find(tag => tag[0] === 's');
      const premiumTag = event.tags.find(tag => tag[0] === 'premium');
      const bondTag = event.tags.find(tag => tag[0] === 'bond');

      // Skip events with 's' tag equal to 'pending'
      if (sTag && sTag[1] === 'pending') {
        return null;
      }

      // Get currency code from the 'f' tag if it exists
      let currencyCode = currencyTag && currencyTag.length > 1 ? currencyTag[1] : null;

      // Debug log to see what currency codes we're getting
      console.log(`Found currencyCode in event: ${currencyCode}`);

      // Handle case insensitivity and common currency code variants
      if (currencyCode) {
        currencyCode = currencyCode.toUpperCase();

        // Map common alternative codes to standard ones
        const currencyMap: Record<string, string> = {
          USDT: 'USD',
          USDC: 'USD',
          US$: 'USD',
          BUSD: 'USD',
          DOLLAR: 'USD',
          DOLLARS: 'USD',
          '€': 'EUR',
          EURO: 'EUR',
          EUROS: 'EUR',
          '£': 'GBP',
          POUND: 'GBP',
          POUNDS: 'GBP',
          STERLING: 'GBP',
          '¥': 'JPY',
          YEN: 'JPY',
        };

        if (currencyMap[currencyCode]) {
          console.log(`Mapping currency code ${currencyCode} to ${currencyMap[currencyCode]}`);
          currencyCode = currencyMap[currencyCode];
        }
      }

      let formattedAmount = '-';
      let rawAmount: number | null = null;

      if (amountTag) {
        if (amountTag.length === 2) {
          formattedAmount = formatAmount(amountTag[1]);
          rawAmount = parseFloat(amountTag[1]);
          console.log(`Single amount: ${rawAmount} ${currencyCode}`);
        } else if (amountTag.length >= 3) {
          formattedAmount = `${formatAmount(amountTag[amountTag.length - 2])} - ${formatAmount(
            amountTag[amountTag.length - 1]
          )}`;
          // For ranges, use the maximum amount
          rawAmount = parseFloat(amountTag[amountTag.length - 1]);
          console.log(`Range amount, using max: ${rawAmount} ${currencyCode}`);
        }
      }

      if (!currencyCode) {
        console.log(`Using default USD currency code for event with no currency`);
        currencyCode = 'USD'; // Default to USD if no currency specified
      }

      // Create the event data object first without the price
      const eventData: EventTableData = {
        id: event.id,
        source: sourceTag ? sourceTag[1] : '-',
        is: isTag ? isTag[1] : '-',
        amount: formattedAmount,
        currencyCode: currencyCode,
        link: linkTag ? linkTag[1] : '-',
        created_at: event.created_at || 0,
        premium: premiumTag ? premiumTag[1] : null,
        bond: bondTag ? bondTag[1] : null,
        price: null,
        rawAmount: rawAmount,
      };

      try {
        // Calculate BTC price if we have both a currency code and an amount
        if (rawAmount !== null && currencyCode) {
          eventData.price = calculateBtcPrice(
            rawAmount,
            currencyCode,
            premiumTag ? premiumTag[1] : null
          );
        }
      } catch (priceError) {
        console.error('Error calculating price:', priceError);
        eventData.price = null;
      }

      return eventData;
    } catch (error) {
      console.error('Error processing event:', error, event);
      return null;
    }
  };

  // Main effect to coordinate data loading
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // First, fetch exchange rates
      await fetchExchangeRates();

      // Then fetch events
      try {
        const pool = new SimplePool();

        // Connect to the specified relay plus random relays
        const relays = [
          'wss://nostr.satstralia.com',
          'wss://relay.damus.io',
          'wss://relay.snort.social',
          'wss://nos.lol',
          'wss://relay.current.fyi',
        ];

        // Define the filter for kind 38383 events
        const filter: Filter = {
          kinds: [38383],
        };

        // Create an array to store all events
        const allEvents: EventTableData[] = [];

        // Subscribe to events
        const subscription = pool.subscribeMany(relays, [filter], {
          onevent(event: Event) {
            // Check if the event's pubkey is in the allowed list
            const allowedPubkeys = [
              '7af6f7cfc3bfdf8aa65df2465aa7841096fa8ee6b2d4d14fc43d974e5db9ab96',
              'c8dc40a80bbb41fe7430fca9d0451b37a2341486ab65f890955528e4732da34a',
              'f2d4855df39a7db6196666e8469a07a131cddc08dcaa744a344343ffcf54a10c',
              '74001620297035daa61475c069f90b6950087fea0d0134b795fac758c34e7191',
              'fcc2a0bd8f5803f6dd8b201a1ddb67a4b6e268371fe7353d41d2b6684af7a61e',
              'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2',
            ];

            // Skip events whose pubkey is not in the allowed list
            if (!allowedPubkeys.includes(event.pubkey)) {
              return;
            }

            const processedEvent = processEvent(event);
            if (processedEvent) {
              allEvents.push(processedEvent);
              // Sort by newest first
              allEvents.sort((a, b) => b.created_at - a.created_at);
              const sortedEvents = [...allEvents];
              setEvents(sortedEvents);
              setFilteredEvents(sortedEvents); // Initialize filtered events with all events
              setTotalEvents(allEvents.length);
            }
          },
          oneose() {
            setLoading(false);
            if (allEvents.length === 0) {
              setError('No events found. Try again later.');
            }
          },
        });

        // Cleanup subscription when component unmounts
        return () => {
          subscription.close();
          pool.close(relays);
        };
      } catch (error) {
        console.error('Error fetching events:', error);
        setError('Failed to fetch events. Please check your connection and try again.');
        setLoading(false);
      }
    };

    loadData();

    // Set up refresh interval for exchange rates
    const interval = setInterval(async () => {
      console.log('Refreshing exchange rates...');
      await fetchExchangeRates();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Effect to update prices when exchange rates change
  useEffect(() => {
    if (
      (!ratesLoading && Object.keys(exchangeRates).length > 0) ||
      (!ratesLoading && Object.keys(rateSources).length > 0)
    ) {
      if (events.length > 0) {
        console.log('Updating prices for all events with new exchange rates...');

        // Update prices for all events based on new exchange rates
        const updatedEvents = events.map(event => {
          const newPrice = calculateBtcPrice(event.rawAmount, event.currencyCode, event.premium);
          return {
            ...event,
            price: newPrice,
          };
        });

        console.log('Updated events with new prices:', updatedEvents);
        setEvents(updatedEvents);

        // Update depth chart data
        const chartData = prepareDepthChartData(updatedEvents);
        setDepthChartData(chartData);
      }
    }
  }, [exchangeRates, ratesLoading, rateSources]);

  // Effect to filter events when filter states or events change
  useEffect(() => {
    if (events.length === 0) {
      setFilteredEvents([]);
      return;
    }

    let result = [...events];

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

    setFilteredEvents(result);
    setTotalEvents(result.length);
    setCurrentPage(1); // Reset to first page when filters change

    // Update depth chart data based on filtered events
    const chartData = prepareDepthChartData(result);
    setDepthChartData(chartData);
  }, [events, sourceFilter, typeFilter, currencyFilter]);

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
      const sortedEvents = [...events].sort(sortFunction);
      const sortedFilteredEvents = [...filteredEvents].sort(sortFunction);

      // Update both state variables
      setEvents(sortedEvents);
      setFilteredEvents(sortedFilteredEvents);
    }
  };

  // Get unique values for filters
  const getUniqueSources = () => {
    const sources = new Set<string>();
    events.forEach(event => {
      if (event.source && event.source !== '-') {
        sources.add(event.source);
      }
    });
    return Array.from(sources).sort();
  };

  const getUniqueTypes = () => {
    const types = new Set<string>();
    events.forEach(event => {
      if (event.is && event.is !== '-') {
        types.add(event.is.toUpperCase());
      }
    });
    return Array.from(types).sort();
  };

  const getUniqueCurrencies = () => {
    const currencies = new Set<string>();
    events.forEach(event => {
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

  const clearFilters = () => {
    setSourceFilter(null);
    setTypeFilter(null);
    setCurrencyFilter(null);
  };

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

        // If there's a premium, make it clear that the rate includes it
        if (record.premium) {
          return value;
        }

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
              >
                {text.length > 30 ? `${text.substring(0, 30)}...` : text}
              </a>
            );
          } else {
            return (
              <a href={text} target="_blank" rel="noopener noreferrer">
                {text.length > 30 ? `${text.substring(0, 30)}...` : text}
              </a>
            );
          }
        } else {
          return '-';
        }
      },
    },
  ];

  // Handle .onion address actions
  const handleGoAnyway = () => {
    if (currentOnionAddress) {
      window.open(currentOnionAddress, '_blank', 'noopener,noreferrer');
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
    const sources = Object.keys(rateSources);
    if (sources.length === 0) return 'No sources available';

    // Map of source names to their URLs
    const sourceUrls: Record<string, string> = {
      coingecko: 'https://www.coingecko.com',
      yadio: 'https://yadio.io',
    };

    return sources.map((source, index) => {
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

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ textAlign: 'center' }}>Nostr Events (Kind 38383)</Title>

      {error && <Alert message={error} type="error" style={{ marginBottom: '20px' }} />}

      <OnionAddressWarning
        visible={onionModalVisible}
        onClose={handleCloseModal}
        onGo={handleGoAnyway}
        onDownloadTor={handleDownloadTor}
        address={currentOnionAddress}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <p style={{ marginTop: '20px' }}>Connecting to relays and fetching events...</p>
        </div>
      ) : (
        <>
          {/* Depth Chart */}
          <Card style={{ marginBottom: '20px' }}>
            <div style={{ height: '400px' }}>
              {depthChartData.length > 0 && depthChartData[0].data.length > 0 ? (
                <ResponsiveLine
                  data={depthChartData}
                  margin={{ top: 40, right: 40, bottom: 50, left: 60 }}
                  theme={{
                    axis: {
                      ticks: {
                        text: {
                          fill: '#ffffff'
                        }
                      },
                      legend: {
                        text: {
                          fill: '#ffffff'
                        }
                      }
                    }
                  }}
                  xScale={{
                    type: 'linear',
                    min: Math.min(
                      ...depthChartData.flatMap(series => series.data.map(point => point.x))
                    ) - 1,
                    max: Math.max(
                      ...depthChartData.flatMap(series => series.data.map(point => point.x))
                    ) + 1
                  }}
                  yScale={{ type: 'linear', min: 0, max: 'auto' }}
                  axisTop={null}
                  axisRight={null}
                  axisBottom={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: 0,
                    legend: 'Premium %',
                    legendOffset: 36,
                    legendPosition: 'middle',
                    tickValues: 5, // Limit the number of ticks
                    format: value =>
                      typeof value === 'number'
                        ? `${value.toFixed(0)}%`
                        : `${value}%`
                  }}
                  axisLeft={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: 0,
                    legend: '',
                    legendOffset: -80,
                    legendPosition: 'middle',
                    format: value => {
                      if (typeof value !== 'number') return `₿${value}`;

                      // Use different precision based on the value
                      if (value >= 1) {
                        return `₿${value.toFixed(2)}`;
                      } else if (value >= 0.01) {
                        return `₿${value.toFixed(4)}`;
                      } else if (value > 0) {
                        return `₿${value.toPrecision(3)}`;
                      } else {
                        return `₿0`;
                      }
                    },
                    tickValues: 5 // Limit the number of ticks
                  }}
                  gridXValues={[]} // No vertical grid lines
                  gridYValues={[]} // No horizontal grid lines
                  enableGridX={false}
                  enableGridY={false}
                  curve="monotoneX"
                  colors={{ scheme: 'category10' }}
                  pointSize={0} // Remove points
                  enablePoints={false} // Disable points
                  lineWidth={2} // Slightly thicker lines for better visibility
                  enableArea={true} // Enable area fill
                  areaOpacity={0.2} // Transparent fill
                  areaBaselineValue={0} // Start fill from bottom
                  useMesh={true}
                  enableSlices="x"
                  sliceTooltip={({ slice }) => {
                    return (
                      <div
                        style={{
                          background: 'white',
                          padding: '9px 12px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                        }}
                      >
                        <div>Premium: {typeof slice.points[0].data.x === 'number' ? slice.points[0].data.x.toFixed(2) : String(slice.points[0].data.x)}%</div>
                        {slice.points.map(point => (
                          <div
                            key={point.id}
                            style={{
                              color: point.serieColor,
                              padding: '3px 0',
                            }}
                          >
                            <strong>{point.serieId}:</strong> {typeof point.data.y === 'number' ? point.data.y.toFixed(8) : String(point.data.y)} BTC
                          </div>
                        ))}
                      </div>
                    )
                  }}
                  legends={[]}
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <p>Not enough data to display depth chart. Try adjusting filters.</p>
                </div>
              )}
            </div>
          </Card>

          {/* Filter UI */}
          <Card style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <Title level={4} style={{ margin: '0', minWidth: '120px' }}>Filter Options:</Title>
              <Space wrap style={{ flex: 1 }}>
                <Select
                  style={{ width: 180 }}
                  placeholder="Filter by Source"
                  allowClear
                  onChange={handleSourceFilterChange}
                  value={sourceFilter}
                  options={getUniqueSources().map(source => ({ value: source, label: source }))}
                />
                <Select
                  style={{ width: 180 }}
                  placeholder="Filter by Type"
                  allowClear
                  onChange={handleTypeFilterChange}
                  value={typeFilter}
                  options={getUniqueTypes().map(type => ({ value: type, label: type }))}
                />
                <Select
                  style={{ width: 180 }}
                  placeholder="Filter by Currency"
                  allowClear
                  onChange={handleCurrencyFilterChange}
                  value={currencyFilter}
                  options={getUniqueCurrencies().map(currency => {
                    const flag = getCurrencyFlag(currency);
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
                {(sourceFilter || typeFilter || currencyFilter) && (
                  <button
                    onClick={clearFilters}
                    style={{
                      background: '#f5f5f5',
                      border: '1px solid #d9d9d9',
                      padding: '5px 12px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    Clear All Filters
                  </button>
                )}
              </Space>
            </div>
          </Card>

          <Table
            dataSource={currentData}
            columns={columns}
            rowKey="id"
            pagination={false}
            bordered
            style={{ marginBottom: '20px' }}
            onChange={handleTableChange}
            sortDirections={['ascend', 'descend']}
          />

          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={totalEvents}
            onChange={handlePageChange}
            showSizeChanger={false}
            showTotal={total => `Total ${total} events`}
          />
        </>
      )}

      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              href='http://github.koalasat.xyz'
              target='_blank'
              style={{ marginLeft: 4 }}
            >
              KoalaSat
            </a>
          </small>
        </div>
      </div>
    </div>
  );
};

export default NostrEventsTable;
