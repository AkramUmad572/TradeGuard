import React, { useState } from 'react';
import Landing from './components/Landing';
import App from './App';

export default function Root() {
  const [showLanding, setShowLanding] = useState(true);
  const [initialSearch, setInitialSearch] = useState('');

  const handleEnter = () => {
    setShowLanding(false);
  };

  const handleSearch = (query) => {
    setInitialSearch(query);
    setShowLanding(false);
  };

  const handleGoHome = () => {
    setShowLanding(true);
    setInitialSearch('');
  };

  if (showLanding) {
    return (
      <Landing 
        onEnter={handleEnter} 
        onSearch={handleSearch} 
      />
    );
  }

  return <App initialSearch={initialSearch} onGoHome={handleGoHome} />;
}
