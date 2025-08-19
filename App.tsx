import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, AppState as RNAppState, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AppController } from './services/AppController';
import { HomeView } from './ui/HomeView';
import { PairingView } from './ui/PairingView';
import { SettingsView } from './ui/SettingsView';

type ViewMode = 'home' | 'pairing' | 'settings';

export default function App() {
  console.log('🚀 App component rendering...');
  
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const controllerRef = useRef<AppController | null>(null);

  // Initialize app controller
  useEffect(() => {
    console.log('🔥 useEffect triggered - starting initialization');
    let controller: AppController | null = null;
    
    const timer = setTimeout(() => {
      console.log('🚀 Creating app controller...');
      setError(null);
      
      try {
        controller = new AppController();
        console.log('🎯 AppController created successfully');
        controllerRef.current = controller;
        setIsLoading(false);
        console.log('✅ App controller set and loading disabled');

        // Handle app state changes for background recording
        const handleAppStateChange = (nextAppState: string) => {
          console.log(`📱 App state changed to: ${nextAppState}`);
        };

        // Subscribe to app state changes
        const subscription = RNAppState.addEventListener('change', handleAppStateChange);

        // Store subscription for cleanup
        (controller as any)._subscription = subscription;

      } catch (error) {
        console.error('❌ App controller creation failed:', error);
        setError(`Controller failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      console.log('🧹 Cleaning up app...');
      if (controller) {
        // Clean up subscription
        if ((controller as any)._subscription) {
          (controller as any)._subscription.remove();
        }
        controller.cleanup().catch(console.error);
      }
    };
  }, []);

  const handlePairingPress = () => {
    setCurrentView('pairing');
  };

  const handleSettingsPress = () => {
    setCurrentView('settings');
  };

  const handleBackToHome = () => {
    setCurrentView('home');
  };

  // Show error screen if there's an error
  if (error) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { padding: 20, justifyContent: 'center' }]}>
          <Text style={{ fontSize: 18, color: 'red', textAlign: 'center', marginBottom: 20 }}>
            App Error: {error}
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 8 }}
            onPress={() => setError(null)}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>Retry</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  console.log('🚨 Render - isLoading:', isLoading, 'controllerRef.current:', !!controllerRef.current, 'error:', error);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { padding: 20, justifyContent: 'center' }]}>
          <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: 20 }}>Loading...</Text>
          <Text style={{ fontSize: 14, textAlign: 'center', color: '#666' }}>
            Initializing TaiRecorder...
          </Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" backgroundColor="#f5f5f5" />
        
        {currentView === 'home' ? (
          <HomeView
            controller={controllerRef.current}
            onPairingPress={handlePairingPress}
            onSettingsPress={handleSettingsPress}
          />
        ) : currentView === 'pairing' ? (
          <PairingView
            controller={controllerRef.current}
            onBack={handleBackToHome}
          />
        ) : (
          <SettingsView
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
