import { EventTableData } from 'components/NostrEventsTable';
import { Event } from 'nostr-tools/lib/types/core';
import { SimplePool } from 'nostr-tools';
import { isEventExpired } from 'context/NostrEventsContext';
import { MOSTRO_SOURCES, mostroAuthRelays, mostroInstanceNames } from 'functions/mostroInstances';

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
    }
  });

  return averageRates;
};

// Function to process raw Nostr events into the format needed for the table
export const processEvent = (
  event: Event | null,
  exchangeRates: Record<string, number>
): EventTableData | null => {
  if (!event) return null;

  try {
    // Find the required tags
    const sourceTag = event.tags.find(tag => tag[0] === 'y');
    const isTag = event.tags.find(tag => tag[0] === 'k');
    const amountTag = event.tags.find(tag => tag[0] === 'fa');
    const currencyTag = event.tags.find(tag => tag[0] === 'f');
    const linkTag = event.tags.find(tag => tag[0] === 'source');
    const premiumTag = event.tags.find(tag => tag[0] === 'premium');
    const satsTag = event.tags.find(tag => tag[0] === 'amt');
    const bondTag = event.tags.find(tag => tag[0] === 'bond');
    const paymentMethodsTag = event.tags.find(tag => tag[0] === 'pm');

    // Skip expired events. For Mostro the NIP-40 expiration is capped at
    // created_at + MOSTRO_PENDING_MAX_AGE_S, see isEventExpired.
    if (isEventExpired(event)) {
      return null;
    }

    // Distinguish between decentralized Mostro instances by pubkey
    if (sourceTag?.[1] === 'mostro' && mostroInstanceNames[event.pubkey]) {
      sourceTag[1] = mostroInstanceNames[event.pubkey];
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
      } else if (amountTag.length >= 3) {
        formattedAmount = `${formatAmount(amountTag[amountTag.length - 2])} - ${formatAmount(
          amountTag[amountTag.length - 1]
        )}`;
        // For ranges, use the maximum amount
        rawAmount = parseFloat(amountTag[amountTag.length - 1]);
      }
    }

    // Create the event data object first without the price
    const eventData: EventTableData = {
      id: event.id,
      dTag: event.tags.find(tag => tag[0] === 'd')?.[1],
      pubkey: event.pubkey,
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

    try {
      // A non-zero 'amt' means the maker pinned the sats amount, so the order
      // carries its own price and the 'premium' tag is meaningless (Mostro
      // publishes 0 for every fixed-price order). Derive both columns from it.
      // 'amt' pairs with the top of the 'fa' range, which is what rawAmount holds.
      const fixedSats = satsTag && satsTag.length > 1 ? parseFloat(satsTag[1]) : NaN;

      if (rawAmount && currencyCode && fixedSats > 0) {
        const fixedRate = (rawAmount * SATS_PER_BTC) / fixedSats;
        const derived = impliedPremium(fixedRate, currencyCode, exchangeRates);

        eventData.price = formatRate(fixedRate, currencyCode);
        // Without a market rate a non-zero declared premium is still information,
        // but a literal 0 would claim the order is at market.
        const declared = premiumTag && parseFloat(premiumTag[1]) !== 0 ? premiumTag[1] : null;
        eventData.premium = derived ?? declared;
        // Only flag the premium as measured when it contradicts what the maker
        // declared. HodlHodl pins the sats too but publishes a premium that
        // matches within a rounding error, so marking those would be noise.
        eventData.fixedPrice =
          derived !== null &&
          (!premiumTag?.[1] ||
            Math.abs(parseFloat(derived) - parseFloat(premiumTag[1])) > PREMIUM_DRIFT_TOLERANCE);
      } else if (rawAmount !== null && currencyCode) {
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

export const SATS_PER_BTC = 100_000_000;

// Percentage points a fixed-price order may drift from its declared premium
// before we stop trusting the declared one.
export const PREMIUM_DRIFT_TOLERANCE = 0.5;

// Render a rate the way the Price column expects it.
export const formatRate = (rate: number, currencyCode: string): string =>
  `${rate.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })} ${currencyCode.toUpperCase()}/BTC`;

// Premium a fixed-price order actually carries against the current market rate.
// Null when we have no rate for that currency: showing the tag's literal 0 there
// would claim the order is at market when nothing backs that.
export const impliedPremium = (
  rate: number,
  currencyCode: string,
  exchangeRates: Record<string, number>
): string | null => {
  const marketRate = exchangeRates[currencyCode];
  if (!marketRate || marketRate <= 0) return null;
  return String((rate / marketRate - 1) * 100);
};

// Function to calculate exchange rate pair for display in the Price column
export const calculateBtcPrice = (
  amount: number | null,
  currencyCode: string | null,
  premium: string | null,
  exchangeRates: Record<string, number>
): string | null => {
  try {
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
      }

      // Return in format: {rate with premium} {currency code}/BTC
      return formatRate(finalRate, currencyCode);
    }

    return null;
  } catch (error) {
    console.error('Error in calculateBtcPrice:', error);
    return null;
  }
};

export const fetchValidHodlHodlOfferIds = async (): Promise<Set<string> | null> => {
  const validIds = new Set<string>();
  const limit = 100;
  let offset = 0;

  try {
    while (true) {
      const apiUrl = `https://hodlhodl.com/api/v1/offers?filters%5Basset_code%5D=BTC&pagination%5Blimit%5D=${limit}&pagination%5Boffset%5D=${offset}`;
      const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(apiUrl)}`);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.offers || data.offers.length === 0) break;

      data.offers.forEach((offer: { id: string }) => validIds.add(offer.id));

      if (data.offers.length < limit) break;
      offset += limit;
    }
  } catch (error) {
    console.error('Error fetching HodlHodl active offers:', error);
    return null;
  }

  return validIds.size > 0 ? validIds : null;
};

export interface MostroValidation {
  // Instances whose authoritative relay gave a usable answer. Only these get filtered.
  validatedPubkeys: Set<string>;
  // Valid orders, keyed `${pubkey}:${dTag}` so each instance's d-tags are only
  // considered valid for that instance, not shared across all instances.
  dTags: Set<string>;
}

export const fetchValidMostroDTags = (): Promise<MostroValidation> => {
  const dTags = new Set<string>();
  const validatedPubkeys = new Set<string>();
  const pool = new SimplePool();

  const subscriptions = Object.entries(mostroAuthRelays).map(([pubkey, relays]) => {
    return new Promise<void>(resolve => {
      const found = new Set<string>();
      let settled = false;

      // Fail open: an unreachable relay, a timeout or an empty answer must never
      // be read as "this instance has no valid orders" — that would wipe the whole
      // instance off the book. Only an EOSE carrying at least one order counts.
      const finish = (reachedEose: boolean) => {
        if (settled) return;
        settled = true;
        if (reachedEose && found.size > 0) {
          validatedPubkeys.add(pubkey);
          found.forEach(dTag => dTags.add(`${pubkey}:${dTag}`));
        }
        resolve();
      };

      try {
        pool.subscribe(
          relays,
          {
            kinds: [38383],
            '#s': ['pending'],
            authors: [pubkey],
          },
          {
            id: `p2pMostroValid-${pubkey.slice(0, 8)}`,
            onevent(event: Event) {
              const dTag = event.tags.find(t => t[0] === 'd')?.[1] ?? '';
              if (dTag) found.add(dTag);
            },
            oneose() {
              finish(true);
            },
            onclose() {
              finish(false);
            },
          }
        );
      } catch (error) {
        console.error(`Error validating Mostro orders for ${pubkey.slice(0, 8)}:`, error);
        finish(false);
      }

      setTimeout(() => finish(false), 15000);
    });
  });

  return Promise.all(subscriptions).then(() => ({ validatedPubkeys, dTags }));
};

export { MOSTRO_SOURCES } from 'functions/mostroInstances';

// Orphaned orders are pending events still floating on aggregator relays that the
// issuing instance's own relay no longer lists.
export const isMostroOrderValid = (
  event: Pick<EventTableData, 'source' | 'pubkey' | 'dTag'>,
  validation: MostroValidation | null
): boolean => {
  if (!validation) return true;
  if (!MOSTRO_SOURCES.includes(event.source)) return true;
  if (!event.dTag) return true;
  if (!validation.validatedPubkeys.has(event.pubkey)) return true;
  return validation.dTags.has(`${event.pubkey}:${event.dTag}`);
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

export type SourceFilterMode = 'only' | 'except';

// Platform filter predicate. An empty selection filters nothing in either mode.
// Sources are the per-instance names processEvent assigns, so excluding `mostro`
// leaves MostroColombia and the other instances on the book.
export const matchesSourceFilter = (
  event: Pick<EventTableData, 'source'>,
  sources: string[],
  mode: SourceFilterMode
): boolean => {
  if (sources.length === 0) return true;
  return mode === 'except' ? !sources.includes(event.source) : sources.includes(event.source);
};

export interface FilterPreferences {
  sourceMode: SourceFilterMode;
  sources: string[];
  type: string | null;
  currency: string | null;
  paymentMethod: string;
}

export const FILTER_STORAGE_KEY = 'p2pband.filters';

export const DEFAULT_FILTERS: FilterPreferences = {
  sourceMode: 'only',
  sources: [],
  type: null,
  currency: null,
  paymentMethod: '',
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

// Stored preferences are user-editable and outlive any given release, so every
// field is validated on its own — a corrupt one falls back to its default
// instead of discarding the rest.
const sanitiseFilters = (raw: unknown): FilterPreferences => {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_FILTERS;
  const candidate = raw as Record<string, unknown>;

  return {
    sourceMode: candidate.sourceMode === 'except' ? 'except' : DEFAULT_FILTERS.sourceMode,
    sources: isStringArray(candidate.sources) ? candidate.sources : DEFAULT_FILTERS.sources,
    type:
      candidate.type === 'BUY' || candidate.type === 'SELL' ? candidate.type : DEFAULT_FILTERS.type,
    currency:
      typeof candidate.currency === 'string' ? candidate.currency : DEFAULT_FILTERS.currency,
    paymentMethod:
      typeof candidate.paymentMethod === 'string'
        ? candidate.paymentMethod
        : DEFAULT_FILTERS.paymentMethod,
  };
};

export const loadFilters = (): FilterPreferences => {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return sanitiseFilters(JSON.parse(raw));
  } catch (error) {
    // Disabled storage, private mode or corrupt JSON: fall back to the defaults.
    return DEFAULT_FILTERS;
  }
};

export const saveFilters = (filters: FilterPreferences): void => {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    // Storage may be unavailable or full; losing the preference is acceptable.
  }
};
