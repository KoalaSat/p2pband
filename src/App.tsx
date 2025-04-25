import React from 'react';
import './App.css';
import NostrEventsTable from './components/NostrEventsTable';
import { ConfigProvider, theme } from 'antd';

function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#25a425', // Softer, less neon green
          colorInfo: '#2bb8b8', // Softer cyan
          borderRadius: 0,
          fontFamily: 'Roboto Mono, Share Tech Mono, monospace',
        },
      }}
    >
      <div className="App digital-noise">
        <NostrEventsTable />
      </div>
    </ConfigProvider>
  );
}

export default App;
