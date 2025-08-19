import { RecorderService, RecorderCallback } from './RecorderService';
import { FlicService, FlicEvents, ClickType } from './FlicService';
import { UploadQueue } from './UploadQueue';
import { Alert, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';

export interface AppState {
  isRecording: boolean;
  isFlicConnected: boolean;
  killSwitchEnabled: boolean;
  lastRecordingUri?: string;
  lastRecordingDuration?: number;
  uploadQueueCount: number;
}

export interface AppStateListener {
  onStateChange(state: AppState): void;
}

export class AppController implements FlicEvents {
  private recorder: RecorderService;
  private flic: FlicService;
  private uploader: UploadQueue;
  private listeners: AppStateListener[] = [];
  private state: AppState;

  constructor() {
    this.recorder = new RecorderService();
    this.flic = new FlicService();
    this.uploader = new UploadQueue();
    
    this.state = {
      isRecording: false,
      isFlicConnected: false,
      killSwitchEnabled: false,
      uploadQueueCount: 0,
    };

    this.setupServices();
    this.updateUploadQueueCount();
  }

  private setupServices(): void {
    // Connect Flic service
    this.flic.setDelegate(this);
    
    // Setup notifications
    this.setupNotifications();
  }

  private async setupNotifications(): Promise<void> {
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Request notification permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permissions not granted');
    }
  }

  // FlicEvents implementation
  onSingleClick(): void {
    if (this.state.killSwitchEnabled) {
      console.log('Single click ignored - kill switch enabled');
      return;
    }

    if (this.recorder.isRecording) {
      // Add bookmark
      this.recorder.mark();
      this.notify('Bookmark added', '📍');
      this.hapticFeedback();
    } else {
      // Start recording
      this.startRecording();
    }
  }

  onDoubleClick(): void {
    if (this.state.killSwitchEnabled) {
      console.log('Double click ignored - kill switch enabled');
      return;
    }

    if (this.recorder.isRecording) {
      // Stop and save recording
      this.stopAndSaveRecording();
    } else {
      // Quick start and stop for testing
      this.notify('Double click - not recording', '⚠️');
    }
  }

  onHold(): void {
    if (this.state.killSwitchEnabled) {
      console.log('Hold ignored - kill switch enabled');
      return;
    }

    if (this.recorder.isRecording) {
      // Stop and flag recording
      this.stopAndFlagRecording();
    } else {
      this.notify('Hold - not recording', '⚠️');
    }
  }

  onConnectionChange(connected: boolean): void {
    this.state.isFlicConnected = connected;
    this.notifyStateChange();
    
    if (connected) {
      this.notify('Flic connected', '🔵');
    } else {
      this.notify('Flic disconnected', '🔴');
    }
  }

  // Public methods for manual control
  async startRecording(): Promise<boolean> {
    try {
      const success = await this.recorder.start();
      if (success) {
        this.state.isRecording = true;
        this.notifyStateChange();
        this.notify('Recording started', '🎤');
        this.hapticFeedback();
        return true;
      } else {
        this.notify('Failed to start recording', '❌');
        return false;
      }
    } catch (error) {
      console.error('Start recording error:', error);
      this.notify('Recording error', '❌');
      return false;
    }
  }

  async stopRecording(): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.recorder.stop((uri, bookmarks) => {
        this.state.isRecording = false;
        this.state.lastRecordingUri = uri;
        this.notifyStateChange();
        resolve(uri);
      });
    });
  }

  private async stopAndSaveRecording(): Promise<void> {
    const uri = await this.stopRecording();
    if (uri) {
      this.recorder.stop((fileUri, bookmarks) => {
        if (fileUri) {
          this.uploader.enqueue(fileUri, bookmarks || [], false);
          this.updateUploadQueueCount();
          this.notify('Recording saved', '💾');
          this.hapticFeedback(2);
        }
      });
    }
  }

  private async stopAndFlagRecording(): Promise<void> {
    const uri = await this.stopRecording();
    if (uri) {
      this.recorder.stop((fileUri, bookmarks) => {
        if (fileUri) {
          this.uploader.enqueue(fileUri, bookmarks || [], true);
          this.updateUploadQueueCount();
          this.notify('Recording flagged', '🚩');
          this.hapticFeedback(3);
        }
      });
    }
  }

  // Flic button management
  async pairFlicButton(): Promise<boolean> {
    return await this.flic.startScanning();
  }

  async disconnectFlic(): Promise<void> {
    await this.flic.disconnect();
  }

  // Kill switch
  setKillSwitch(enabled: boolean): void {
    this.state.killSwitchEnabled = enabled;
    this.notifyStateChange();
    
    if (enabled) {
      this.notify('Kill switch ON', '🛑');
      // Stop recording if currently recording
      if (this.recorder.isRecording) {
        this.stopRecording();
      }
    } else {
      this.notify('Kill switch OFF', '✅');
    }
  }

  // Upload queue management
  async retryFailedUploads(): Promise<void> {
    await this.uploader.retryFailed();
    this.updateUploadQueueCount();
    this.notify('Retrying failed uploads', '🔄');
  }

  async clearCompletedUploads(): Promise<void> {
    const cleared = await this.uploader.clearCompleted();
    this.updateUploadQueueCount();
    if (cleared > 0) {
      this.notify(`Cleared ${cleared} completed uploads`, '🗑️');
    }
  }

  async getUploadStatus() {
    return await this.uploader.getQueueStatus();
  }

  // State management
  addStateListener(listener: AppStateListener): void {
    this.listeners.push(listener);
    // Immediately notify with current state
    listener.onStateChange(this.state);
  }

  removeStateListener(listener: AppStateListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyStateChange(): void {
    this.listeners.forEach(listener => {
      try {
        listener.onStateChange({ ...this.state });
      } catch (error) {
        console.error('State listener error:', error);
      }
    });
  }

  private async updateUploadQueueCount(): Promise<void> {
    const status = await this.uploader.getQueueStatus();
    this.state.uploadQueueCount = status.pending + status.uploading;
    this.notifyStateChange();
  }

  // Utilities
  private async notify(title: string, emoji = ''): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${emoji} ${title}`,
          body: '',
          sound: false, // Keep it quiet for background use
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('Notification failed:', error);
    }
  }

  private hapticFeedback(count = 1): void {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        Vibration.vibrate(100);
      }, i * 200);
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.recorder.isRecording) {
      await this.stopRecording();
    }
    await this.flic.disconnect();
    this.listeners = [];
  }

  // Getters for current state
  get currentState(): AppState {
    return { ...this.state };
  }

  get isRecording(): boolean {
    return this.state.isRecording;
  }

  get isFlicConnected(): boolean {
    return this.state.isFlicConnected;
  }

  get killSwitchEnabled(): boolean {
    return this.state.killSwitchEnabled;
  }
}