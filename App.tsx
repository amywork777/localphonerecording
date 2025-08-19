import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, AppState as RNAppState } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AppController } from './services/AppController';
import { HomeView } from './ui/HomeView';
import { PairingView } from './ui/PairingView';

type ViewMode = 'home' | 'pairing';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const controllerRef = useRef<AppController | null>(null);

  // Initialize app controller
  useEffect(() => {
    const controller = new AppController();
    controllerRef.current = controller;

    // Handle app state changes for background recording
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('App became active');
      } else if (nextAppState === 'background') {
        console.log('App went to background');
      } else if (nextAppState === 'inactive') {
        console.log('App became inactive');
      }
    };

    // Subscribe to app state changes
    const subscription = RNAppState.addEventListener('change', handleAppStateChange);

    // Cleanup function
    return () => {
      subscription?.remove();
      controller.cleanup().catch(console.error);
    };
  }, []);

  const handlePairingPress = () => {
    setCurrentView('pairing');
  };

  const handleBackToHome = () => {
    setCurrentView('home');
  };

  if (!controllerRef.current) {
    return null; // or a loading screen
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" backgroundColor="#f5f5f5" />
        
        {currentView === 'home' ? (
          <HomeView
            controller={controllerRef.current}
            onPairingPress={handlePairingPress}
          />
        ) : (
          <PairingView
            controller={controllerRef.current}
            onBack={handleBackToHome}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});
