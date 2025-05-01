import React, { useEffect, useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { EventTableData } from './NostrEventsTable';

// Define interface for depth chart data
interface DepthChartData {
  id: string;
  data: Array<{
    x: number;
    y: number;
  }>;
}

interface DepthChartProps {
  tableEvents: EventTableData[];
  exchangeRates: Record<string, number>;
}

const DepthChart = ({ tableEvents, exchangeRates }: DepthChartProps) => {
  const [depthChartData, setDepthChartData] = useState<DepthChartData[]>([]);

  useEffect(() => {
    // Update depth chart data
    const chartData = prepareDepthChartData(tableEvents);
    setDepthChartData(chartData);
  }, [tableEvents.length]);

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
      } else {
        return;
      }

      // Skip events with zero BTC amount or too hight amounts
      if (btcAmount <= 0 || btcAmount > 0.5) {
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
    const buyArray: { premium: number; amount: number }[] = Array.from(buyPremiumMap.entries()).map(
      ([premium, amount]) => ({ premium, amount })
    );

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

    // Only include series that have data
    const result = [];

    if (buyData.length > 0) {
      result.push({
        id: 'Buy Orders',
        data: buyData,
      });
    }

    if (sellData.length > 0) {
      result.push({
        id: 'Sell Orders',
        data: sellData,
      });
    }

    return result;
  };

  return (
    <div className="depth-chart-container" style={{ height: '400px' }}>
      {depthChartData.length > 0 && depthChartData.some(series => series.data.length > 0) ? (
        <ResponsiveLine
          data={depthChartData}
          margin={{ top: 40, right: 40, bottom: 50, left: 60 }}
          theme={{
            axis: {
              ticks: {
                text: {
                  fill: '#ffffff',
                },
              },
              legend: {
                text: {
                  fill: '#ffffff',
                },
              },
              domain: {
                line: {
                  stroke: '#555',
                  strokeWidth: 1,
                },
              },
            },
            grid: {
              line: {
                stroke: 'transparent',
              },
            },
          }}
          xScale={{
            type: 'linear',
            min:
              Math.min(...depthChartData.flatMap(series => series.data.map(point => point.x))) - 1,
            max:
              Math.max(...depthChartData.flatMap(series => series.data.map(point => point.x))) + 1,
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
            format: value => (typeof value === 'number' ? `${value.toFixed(0)}%` : `${value}%`),
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

              // Always round to 2 decimal places
              return `₿${value.toFixed(2)}`;
            },
            tickValues: 5, // Limit the number of ticks
          }}
          enableGridX={false}
          enableGridY={false}
          curve="monotoneX"
          colors={d => (d.id === 'Buy Orders' ? '#1f77b4' : '#ff7f0e')} // Blue for Buy, Orange for Sell
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
                  background: '#1f1f1f',
                  padding: '9px 12px',
                  border: '1px solid #333',
                  borderRadius: '3px',
                  color: 'rgba(255, 255, 255, 0.85)',
                  boxShadow: '0 3px 6px rgba(0, 0, 0, 0.2)',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#1890ff' }}>
                  Premium:{' '}
                  {typeof slice.points[0].data.x === 'number'
                    ? slice.points[0].data.x.toFixed(2)
                    : String(slice.points[0].data.x)}
                  %
                </div>
                {slice.points.map(point => (
                  <div
                    key={point.id}
                    style={{
                      color: point.serieColor,
                      padding: '3px 0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom:
                        point.id === slice.points[slice.points.length - 1].id
                          ? 'none'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                      paddingBottom: '4px',
                      marginBottom: '4px',
                    }}
                  >
                    <strong>{point.serieId}:</strong>{' '}
                    {typeof point.data.y === 'number'
                      ? point.data.y.toFixed(8)
                      : String(point.data.y)}{' '}
                    BTC
                  </div>
                ))}
              </div>
            );
          }}
          legends={[]}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <p>Not enough data to display depth chart. Try adjusting filters.</p>
        </div>
      )}
    </div>
  );
};

export default DepthChart;
