import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { AppController, AppState, AppStateListener } from '../services/AppController';

interface HomeViewProps {
  controller: AppController;
  onPairingPress: () => void;
  onSettingsPress: () => void;
}

const { width } = Dimensions.get('window');

export const HomeView: React.FC<HomeViewProps> = ({ controller, onPairingPress, onSettingsPress }) => {
  const [appState, setAppState] = useState<AppState>(controller.currentState);
  const [uploadStatus, setUploadStatus] = useState({
    pending: 0,
    uploading: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });

  useEffect(() => {
    const listener: AppStateListener = {
      onStateChange: (state: AppState) => {
        setAppState(state);
      }
    };

    controller.addStateListener(listener);
    updateUploadStatus();

    return () => {
      controller.removeStateListener(listener);
    };
  }, [controller]);

  const updateUploadStatus = async () => {
    const status = await controller.getUploadStatus();
    setUploadStatus(status);
  };

  const handleStartStop = async () => {
    if (appState.isRecording) {
      await controller.stopRecording();
    } else {
      await controller.startRecording();
    }
  };

  const handleKillSwitchToggle = (value: boolean) => {
    controller.setKillSwitch(value);
  };

  const handleRetryUploads = () => {
    controller.retryFailedUploads();
    setTimeout(updateUploadStatus, 1000);
  };

  const handleClearCompleted = () => {
    controller.clearCompletedUploads();
    setTimeout(updateUploadStatus, 1000);
  };

  const showUploadDetails = () => {
    Alert.alert(
      'Upload Queue Status',
      `Pending: ${uploadStatus.pending}\nUploading: ${uploadStatus.uploading}\nCompleted: ${uploadStatus.completed}\nFailed: ${uploadStatus.failed}\nTotal: ${uploadStatus.total}`,
      [
        { text: 'Retry Failed', onPress: handleRetryUploads },
        { text: 'Clear Completed', onPress: handleClearCompleted },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  const connectionStatusColor = appState.isFlicConnected ? '#4CAF50' : '#F44336';
  const recordingStatusColor = appState.isRecording ? '#FF5722' : '#9E9E9E';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>TaiRecorder</Text>
        <Text style={styles.subtitle}>Flic Button Voice Recorder</Text>
      </View>

      {/* Status Indicators */}
      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: connectionStatusColor }]} />
            <Text style={styles.statusText}>
              {appState.isFlicConnected ? 'Flic Connected' : 'Flic Disconnected'}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: recordingStatusColor }]} />
            <Text style={styles.statusText}>
              {appState.isRecording ? 'Recording...' : 'Idle'}
            </Text>
          </View>
        </View>
      </View>

      {/* Kill Switch */}
      <View style={styles.killSwitchContainer}>
        <Text style={styles.killSwitchLabel}>Kill Switch</Text>
        <Switch
          value={appState.killSwitchEnabled}
          onValueChange={handleKillSwitchToggle}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={appState.killSwitchEnabled ? '#f5dd4b' : '#f4f3f4'}
        />
      </View>

      {/* Manual Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            appState.isRecording ? styles.stopButton : styles.startButton
          ]}
          onPress={handleStartStop}
          disabled={appState.killSwitchEnabled}
        >
          <Text style={styles.controlButtonText}>
            {appState.isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            styles.pairingButton,
            appState.isFlicConnected && styles.connectedButton
          ]}
          onPress={onPairingPress}
        >
          <Text style={styles.controlButtonText}>
            {appState.isFlicConnected ? '🔵 Reconnect Flic' : '🔍 Pair Flic Button'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.settingsButton]}
          onPress={onSettingsPress}
        >
          <Text style={styles.controlButtonText}>⚙️ Settings</Text>
        </TouchableOpacity>

        {appState.lastRecordingUri && (
          <TouchableOpacity
            style={[styles.controlButton, styles.transcribeButton]}
            onPress={() => controller.retranscribeLastRecording()}
            disabled={appState.isTranscribing}
          >
            <Text style={styles.controlButtonText}>
              {appState.isTranscribing ? '🔄 Transcribing...' : '📝 Transcribe Last Recording'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Upload Queue Info */}
      <View style={styles.uploadContainer}>
        <Text style={styles.uploadTitle}>Upload Queue</Text>
        <TouchableOpacity style={styles.uploadStatus} onPress={showUploadDetails}>
          <View style={styles.uploadRow}>
            <Text style={styles.uploadText}>Pending: {uploadStatus.pending}</Text>
            <Text style={styles.uploadText}>Uploading: {uploadStatus.uploading}</Text>
          </View>
          <View style={styles.uploadRow}>
            <Text style={styles.uploadText}>Completed: {uploadStatus.completed}</Text>
            <Text style={styles.uploadText}>Failed: {uploadStatus.failed}</Text>
          </View>
          <Text style={styles.uploadSubtext}>Tap for details</Text>
        </TouchableOpacity>
      </View>

      {/* Last Recording Info */}
      {appState.lastRecordingUri && (
        <View style={styles.lastRecordingContainer}>
          <Text style={styles.lastRecordingTitle}>Last Recording</Text>
          <Text style={styles.lastRecordingText}>
            {appState.lastRecordingUri.split('/').pop()}
          </Text>
          {appState.lastRecordingDuration && (
            <Text style={styles.lastRecordingText}>
              Duration: {Math.round(appState.lastRecordingDuration / 1000)}s
            </Text>
          )}
        </View>
      )}

      {/* Transcription Results */}
      {(appState.isTranscribing || appState.lastTranscription) && (
        <View style={styles.transcriptionContainer}>
          <Text style={styles.transcriptionTitle}>Transcription</Text>
          {appState.isTranscribing ? (
            <View style={styles.transcribingStatus}>
              <Text style={styles.transcribingText}>Transcribing audio...</Text>
            </View>
          ) : appState.lastTranscription ? (
            <View>
              <Text style={styles.transcriptionText}>{appState.lastTranscription}</Text>
              <TouchableOpacity 
                style={styles.retranscribeButton}
                onPress={() => controller.retranscribeLastRecording()}
              >
                <Text style={styles.retranscribeButtonText}>🔄 Retranscribe</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>Button Actions</Text>
        <Text style={styles.instructionText}>• Single click: Start recording / Add bookmark</Text>
        <Text style={styles.instructionText}>• Double click: Stop and save</Text>
        <Text style={styles.instructionText}>• Hold: Stop and flag as important</Text>
      </View>
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
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
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
    marginBottom: 10,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusText: {
    fontSize: 16,
    color: '#333',
  },
  killSwitchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  killSwitchLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  controlsContainer: {
    marginBottom: 20,
  },
  controlButton: {
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
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  pairingButton: {
    backgroundColor: '#2196F3',
  },
  connectedButton: {
    backgroundColor: '#FF9800',
  },
  settingsButton: {
    backgroundColor: '#9E9E9E',
  },
  transcribeButton: {
    backgroundColor: '#8BC34A',
  },
  controlButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  uploadContainer: {
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
  uploadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  uploadStatus: {
    borderRadius: 5,
    backgroundColor: '#f8f8f8',
    padding: 10,
  },
  uploadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  uploadText: {
    fontSize: 14,
    color: '#555',
  },
  uploadSubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
  },
  lastRecordingContainer: {
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
  lastRecordingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  lastRecordingText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  instructionsContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  instructionText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
    lineHeight: 20,
  },
  transcriptionContainer: {
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
  transcriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  transcriptionText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 10,
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 6,
  },
  transcribingStatus: {
    alignItems: 'center',
    padding: 20,
  },
  transcribingText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  retranscribeButton: {
    backgroundColor: '#FF9800',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  retranscribeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});