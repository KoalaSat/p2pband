import React from 'react';
import './App.css';
import NostrEventsTable from './components/NostrEventsTable';
import { ConfigProvider, theme } from 'antd';
import { NostrEventsProvider } from './context/NostrEventsContext';
import Header from 'components/Header';

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
          <div
            style={{
              padding: '0px 0px 20px 0px',
              width: '100%',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 'calc(100vh - 60px)',
              background: '#121212',
            }}
          >
            <Header />
            <NostrEventsTable />
          </div>
        </div>
      </NostrEventsProvider>
    </ConfigProvider>
  );
}

export default App;
