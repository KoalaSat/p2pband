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
          colorPrimary: '#1890ff',
        },
      }}
    >
      <div className="App">
        <NostrEventsTable />
      </div>
    </ConfigProvider>
  );
}

export default App;
