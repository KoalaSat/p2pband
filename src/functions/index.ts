import { EventTableData } from 'components/NostrEventsTable';
import { Event } from 'nostr-tools/lib/types/core';

// Function to format amount values
export const formatAmount = (value: string): string => {
  const num = parseFloat(value);

  if (isNaN(num)) return value;

  // Format with thousands separators
  return Math.floor(num).toLocaleString();
};

// Helper function to calculate average of array values
export const calculateAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  // Sum all values and divide by the number of values
  const sum = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
  return sum / values.length;
};

// Function to combine exchange rates from multiple sources and calculate the average
export const calculateAverageRates = (
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

// Function to process raw Nostr events into the format needed for the table
export const processEvent = (
  event: Event,
  exchangeRates: Record<string, number>
): EventTableData | null => {
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
    const paymentMethodsTag = event.tags.find(tag => tag[0] === 'pm');
    const expirationTag = event.tags.find(tag => tag[0] === 'expiration');

    // Check if the event has expired by comparing expiration timestamp with current time
    if (expirationTag && expirationTag[1]) {
      const expirationTimestamp = parseInt(expirationTag[1], 10);
      const currentTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds

      // Skip expired events
      if (!isNaN(expirationTimestamp) && expirationTimestamp < currentTimestamp) {
        console.log(
          `Skipping expired event ${event.id}, expired at: ${new Date(
            expirationTimestamp * 1000
          ).toISOString()}`
        );
        return null;
      }
    }

    if (sourceTag?.[1] === 'robosats' && linkTag?.[1]) {
      const coordinators: Record<string, string> = {
        'over the moon': 'moon',
        bitcoinveneto: 'veneto',
        thebiglake: 'lake',
        templeofsats: 'temple',
      };
      let link = linkTag[1];
      Object.keys(coordinators).forEach(coord => {
        link = link.replace(coord, coordinators[coord]);
      });
      linkTag[1] = link;
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
      paymentMethods: paymentMethodsTag ? paymentMethodsTag.slice(1).join(' ') : '-',
    };

    if (eventData.source === 'robosats') console.log(paymentMethodsTag);

    try {
      // Calculate BTC price if we have both a currency code and an amount
      if (rawAmount !== null && currencyCode) {
        eventData.price = calculateBtcPrice(
          rawAmount,
          currencyCode,
          premiumTag ? premiumTag[1] : null,
          exchangeRates
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

// Function to calculate exchange rate pair for display in the Price column
export const calculateBtcPrice = (
  amount: number | null,
  currencyCode: string | null,
  premium: string | null,
  exchangeRates: Record<string, number>
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

    // First try using the main exchangeRates object
    if (exchangeRates[currencyCode] && exchangeRates[currencyCode] > 0) {
      // Get the base exchange rate
      const baseRate = exchangeRates[currencyCode];

      // Apply premium to the rate if it exists
      let finalRate = baseRate;
      if (premium) {
        const premiumPercent = parseFloat(premium) / 100;
        finalRate = baseRate * (1 + premiumPercent);
        console.log(`Applying premium of ${premium} %: ${baseRate} → ${finalRate}`);
      }

      // Return in format: {rate with premium} {currency code}/BTC
      const result = `${finalRate.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })} ${currencyCode.toUpperCase()}/BTC`;
      console.log(`calculateBtcPrice: Calculated price using main rates: ${result}`);
      return result;
    }

    // No rate available from any source, return null
    console.log(`No exchange rate available for ${currencyCode.toUpperCase()} from any source`);
    return null;
  } catch (error) {
    console.error('Error in calculateBtcPrice:', error);
    return null;
  }
};

export const updateExchangeRates: () => Promise<[Record<string, number>, string[]]> = async () => {
  console.log('Fetching exchange rates from multiple sources...');

  // Create a new copy of the current rate sources
  const newRateSources: Record<string, Record<string, number>> = {};

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
        rates[currency.toLocaleUpperCase()] = rate as number;
      });

      console.log('Processed CoinGecko rates:', rates);

      // Add to sources
      newRateSources['coingecko'] = rates;
    } else {
      console.error('Invalid response from CoinGecko API:', data);
    }
  } catch (error) {
    console.error('Error fetching CoinGecko exchange rates:', error);
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
    }
  } catch (error) {
    console.error('Error fetching Yadio exchange rates:', error);
  }

  return [calculateAverageRates(newRateSources), Object.keys(newRateSources)];
};
