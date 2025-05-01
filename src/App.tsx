import React from 'react';
import './App.css';
import NostrEventsTable from './components/NostrEventsTable';
import { ConfigProvider, theme } from 'antd';
import { NostrEventsProvider } from './context/NostrEventsContext';

function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3cf73c',
          colorInfo: '#41f4f4',
          borderRadius: 0,
          fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
        },
      }}
    >
      <NostrEventsProvider>
        <div className="App">
          <NostrEventsTable />
        </div>
      </NostrEventsProvider>
    </ConfigProvider>
  );
}

export default App;
