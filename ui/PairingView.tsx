import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { AppController, AppState, AppStateListener } from '../services/AppController';

interface PairingViewProps {
  controller: AppController;
  onBack: () => void;
}

export const PairingView: React.FC<PairingViewProps> = ({ controller, onBack }) => {
  const [appState, setAppState] = useState<AppState>(controller.currentState);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);

  useEffect(() => {
    const listener: AppStateListener = {
      onStateChange: (state: AppState) => {
        setAppState(state);
        
        // Update scanning status based on connection changes
        if (state.isFlicConnected && isScanning) {
          setIsScanning(false);
          setScanStatus('Successfully connected!');
          setTimeout(() => setScanStatus(''), 3000);
        }
      }
    };

    controller.addStateListener(listener);

    return () => {
      controller.removeStateListener(listener);
    };
  }, [controller, isScanning]);

  const handleStartPairing = async () => {
    setIsScanning(true);
    setScanStatus('Scanning for Flic button...');
    
    try {
      const success = await controller.pairFlicButton();
      
      if (success) {
        setScanStatus('Scanning started. Press your Flic button to pair.');
        
        // Set timeout for scanning
        setTimeout(() => {
          if (isScanning && !appState.isFlicConnected) {
            setIsScanning(false);
            setScanStatus('Scan timeout. Please try again.');
            setTimeout(() => setScanStatus(''), 3000);
          }
        }, 30000); // 30 second timeout
      } else {
        setIsScanning(false);
        setScanStatus('Failed to start scanning. Check Bluetooth permissions.');
        setTimeout(() => setScanStatus(''), 5000);
      }
    } catch (error) {
      setIsScanning(false);
      setScanStatus('Error starting scan. Please try again.');
      console.error('Pairing error:', error);
      setTimeout(() => setScanStatus(''), 5000);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Flic',
      'Are you sure you want to disconnect the Flic button?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await controller.disconnectFlic();
            setScanStatus('Flic button disconnected');
            setTimeout(() => setScanStatus(''), 3000);
          },
        },
      ]
    );
  };

  const showInstructions = () => {
    Alert.alert(
      'How to Pair Your Flic Button',
      '🔵 LED MEANINGS:\n' +
      '• Solid Blue = Connected & ready\n' +
      '• Blinking Blue = Pairing mode\n' +
      '• Red Flash = Low battery\n' +
      '• No Light = Sleep/disconnected\n\n' +
      
      '📋 PAIRING STEPS:\n' +
      '1. Hold Flic button for 7+ seconds\n' +
      '2. LED will flash blue (pairing mode)\n' +
      '3. Press "Start Pairing" in app\n' +
      '4. Wait for connection (30 seconds max)\n' +
      '5. LED turns solid blue when paired\n\n' +
      
      '🔄 RESET IF NEEDED:\n' +
      'Hold button 7 seconds → Release → Hold 7 more seconds',
      
      [{ text: 'Got it!', style: 'default' }],
      { cancelable: true }
    );
  };

  const showDetailedGuide = () => {
    Alert.alert(
      'Detailed Flic Guide',
      '🔋 BATTERY CHECK:\n' +
      '• Press button once - should light up\n' +
      '• Red flash = charge needed\n' +
      '• No light = dead battery\n\n' +
      
      '🔧 TROUBLESHOOTING:\n' +
      '• Button not responding? Try reset\n' +
      '• App can\'t find it? Check distance (<3 feet)\n' +
      '• Previously paired? Reset first\n' +
      '• Still issues? Try new battery\n\n' +
      
      '📱 PHONE SETUP:\n' +
      '• Enable Bluetooth\n' +
      '• Grant location permissions\n' +
      '• Close other BLE apps\n' +
      '• Stay close during pairing',
      
      [{ text: 'Close', style: 'default' }],
      { cancelable: true }
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Flic Pairing</Text>
      </View>

      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <View 
            style={[
              styles.statusDot, 
              { backgroundColor: appState.isFlicConnected ? '#4CAF50' : '#F44336' }
            ]} 
          />
          <Text style={styles.statusText}>
            {appState.isFlicConnected ? 'Flic Button Connected' : 'No Flic Button Connected'}
          </Text>
        </View>
        
        {scanStatus && (
          <View style={styles.scanStatusContainer}>
            <Text style={styles.scanStatusText}>{scanStatus}</Text>
            {isScanning && <ActivityIndicator size="small" color="#2196F3" style={styles.spinner} />}
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {!appState.isFlicConnected ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.pairButton, isScanning && styles.disabledButton]}
            onPress={handleStartPairing}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.actionButtonText}>🔍 Start Pairing</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.disconnectButton]}
            onPress={handleDisconnect}
          >
            <Text style={styles.actionButtonText}>🔴 Disconnect</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.instructionsButton]}
          onPress={showInstructions}
        >
          <Text style={styles.actionButtonText}>📋 Quick Pairing Guide</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.helpButton]}
          onPress={showDetailedGuide}
        >
          <Text style={styles.actionButtonText}>🔧 Detailed Help & Troubleshooting</Text>
        </TouchableOpacity>
      </View>

      {/* Information Cards */}
      <View style={styles.infoContainer}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About Flic Buttons</Text>
          <Text style={styles.infoText}>
            Flic buttons are wireless smart buttons using Bluetooth Low Energy (BLE). 
            They feature a clickable surface with LED status indicator and work up to 
            50 meters away. Battery typically lasts 1-2 years with normal use.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>LED Status Guide</Text>
          <View style={styles.actionList}>
            <Text style={styles.actionItem}>🔵 Solid Blue: Connected and ready</Text>
            <Text style={styles.actionItem}>💙 Blinking Blue: Pairing mode active</Text>
            <Text style={styles.actionItem}>🔴 Red Flash: Low battery warning</Text>
            <Text style={styles.actionItem}>⚫ No Light: Sleep mode or disconnected</Text>
            <Text style={styles.actionItem}>🟢 Green Flash: Successfully paired</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Button Actions</Text>
          <View style={styles.actionList}>
            <Text style={styles.actionItem}>• Single click: Start recording or add bookmark</Text>
            <Text style={styles.actionItem}>• Double click: Stop and save recording</Text>
            <Text style={styles.actionItem}>• Hold (1s+): Stop and flag as important</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Step-by-Step Pairing</Text>
          <View style={styles.actionList}>
            <Text style={styles.actionItem}>1️⃣ Check battery: Press button → Should light up</Text>
            <Text style={styles.actionItem}>2️⃣ Reset button: Hold 7 seconds until blue blinks</Text>
            <Text style={styles.actionItem}>3️⃣ Enable phone Bluetooth and location</Text>
            <Text style={styles.actionItem}>4️⃣ Stay within 3 feet during pairing</Text>
            <Text style={styles.actionItem}>5️⃣ Tap "Start Pairing" when button blinks blue</Text>
            <Text style={styles.actionItem}>6️⃣ Wait for solid blue = Success!</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Common Issues & Solutions</Text>
          <Text style={styles.infoText}>
            🔴 No LED when pressed? → Replace battery (CR2032)
            {'\n'}💙 Button blinks but won't pair? → Try factory reset
            {'\n'}📱 App can't find button? → Check Bluetooth permissions
            {'\n'}⚡ Button works once then stops? → Stay in BLE range
            {'\n'}🔄 Previously paired elsewhere? → Reset first
            {'\n'}⚠️ Note: Full BLE requires development build, not Expo Go
          </Text>
        </View>
      </View>

      {/* Technical Info */}
      {appState.isFlicConnected && (
        <View style={styles.technicalContainer}>
          <Text style={styles.technicalTitle}>Connection Details</Text>
          <Text style={styles.technicalText}>Status: Connected via Bluetooth LE</Text>
          <Text style={styles.technicalText}>Auto-reconnect: Enabled</Text>
          <Text style={styles.technicalText}>Background mode: Supported</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    fontSize: 18,
    color: '#2196F3',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statusContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  scanStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  scanStatusText: {
    fontSize: 14,
    color: '#2196F3',
    flex: 1,
  },
  spinner: {
    marginLeft: 10,
  },
  actionsContainer: {
    marginBottom: 30,
  },
  actionButton: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  pairButton: {
    backgroundColor: '#2196F3',
  },
  disconnectButton: {
    backgroundColor: '#F44336',
  },
  instructionsButton: {
    backgroundColor: '#FF9800',
  },
  helpButton: {
    backgroundColor: '#9C27B0',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  actionList: {
    marginTop: 5,
  },
  actionItem: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
    lineHeight: 20,
  },
  technicalContainer: {
    backgroundColor: '#e8f5e8',
    borderRadius: 10,
    padding: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  technicalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e7d2e',
    marginBottom: 8,
  },
  technicalText: {
    fontSize: 13,
    color: '#2e7d2e',
    marginBottom: 3,
  },
});