import React from 'react';
import { Typography } from 'antd';

const { Title } = Typography;

const Header: React.FC = () => {
  return (
    <div
      style={{
        marginBottom: '20px',
        textAlign: 'center',
        fontFamily: '"Courier New", monospace',
        letterSpacing: '2px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <h1
        style={{
          color: '#0f0',
          textShadow: '0 0 5px #0f0, 0 0 10px #0f0',
          margin: '0 0 10px 0',
          fontSize: '2.5rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          borderBottom: '2px solid #0f0',
          padding: '10px',
          position: 'relative',
        }}
      >
        P2P ₿AND
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, transparent 0%, #0f02 20%, transparent 40%)',
            animation: 'scan 2s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      </h1>
      <style>
        {`
            @keyframes scan {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}
      </style>
      <p style={{ color: '#0f0', fontSize: '0.9rem', margin: 0 }}>
        P2P Bitcoin exchanges decentralized aggregator
      </p>
    </div>
  );
};

export default Header;
