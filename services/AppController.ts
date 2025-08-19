import { RecorderService, RecorderCallback } from './RecorderService';
import { FlicService, FlicEvents, ClickType } from './FlicService';
import { UploadQueue } from './UploadQueue';
import { TranscriptionService } from './TranscriptionService';
import { Alert, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';

export interface AppState {
  isRecording: boolean;
  isFlicConnected: boolean;
  killSwitchEnabled: boolean;
  lastRecordingUri?: string;
  lastRecordingDuration?: number;
  lastTranscription?: string;
  isTranscribing: boolean;
  uploadQueueCount: number;
}

export interface AppStateListener {
  onStateChange(state: AppState): void;
}

export class AppController implements FlicEvents {
  private recorder: RecorderService;
  private flic: FlicService;
  private uploader: UploadQueue;
  private transcription: TranscriptionService;
  private listeners: AppStateListener[] = [];
  private state: AppState;

  constructor() {
    this.state = {
      isRecording: false,
      isFlicConnected: false,
      killSwitchEnabled: false,
      isTranscribing: false,
      uploadQueueCount: 0,
    };

    // Initialize services with error boundaries
    this.initializeServices();
  }

  private initializeServices() {
    // Initialize services individually with error boundaries
    this.initRecorderService();
    this.initFlicService();
    this.initUploadService();
    this.initTranscriptionService();
    
    // Setup services if all initialized successfully
    this.setupServices();
  }

  private initRecorderService() {
    try {
      this.recorder = new RecorderService();
      console.log('✅ RecorderService initialized');
    } catch (error) {
      console.error('❌ RecorderService init failed:', error);
      // Create minimal fallback
      this.recorder = {
        start: async () => false,
        stop: (callback) => callback?.(undefined, []),
        mark: () => {},
        cleanup: async () => {},
        isRecording: false,
        getDurationMillis: async () => 0
      } as any;
    }
  }

  private initFlicService() {
    try {
      this.flic = new FlicService();
      console.log('✅ FlicService initialized');
    } catch (error) {
      console.error('❌ FlicService init failed:', error);
      // Create minimal fallback
      this.flic = {
        setDelegate: () => {},
        startScanning: async () => false,
        disconnect: async () => {},
        isConnected: false
      } as any;
    }
  }

  private initUploadService() {
    try {
      this.uploader = new UploadQueue();
      console.log('✅ UploadQueue initialized');
    } catch (error) {
      console.error('❌ UploadQueue init failed:', error);
      // Create minimal fallback
      this.uploader = {
        enqueue: () => '',
        getQueueStatus: async () => ({ pending: 0, uploading: 0, completed: 0, failed: 0, total: 0 }),
        retryFailed: async () => {},
        clearCompleted: async () => 0
      } as any;
    }
  }

  private initTranscriptionService() {
    try {
      this.transcription = new TranscriptionService();
      console.log('✅ TranscriptionService initialized');
    } catch (error) {
      console.error('❌ TranscriptionService init failed:', error);
      // Create minimal fallback
      this.transcription = {
        transcribeAudio: async () => ({
          text: '',
          error: 'Transcription service not available',
          provider: 'openai' as const
        })
      } as any;
    }
  }

  private setupServices(): void {
    try {
      // Connect Flic service
      if (this.flic && this.flic.setDelegate) {
        this.flic.setDelegate(this);
      }
      
      // Setup notifications
      this.setupNotifications();
      
      // Update upload queue count
      this.updateUploadQueueCount().catch(console.error);
      
      console.log('✅ All services setup completed');
    } catch (error) {
      console.warn('⚠️ Service setup failed:', error);
      // Continue without some services
    }
  }

  private async setupNotifications(): Promise<void> {
    try {
      await Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permissions not granted');
      }
    } catch (error) {
      console.warn('Notifications setup failed - continuing without notifications:', error);
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
        console.log('Recording stopped, URI:', uri);
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
      this.recorder.stop(async (fileUri, bookmarks) => {
        if (fileUri) {
          this.uploader.enqueue(fileUri, bookmarks || [], false);
          this.updateUploadQueueCount();
          this.notify('Recording saved', '💾');
          this.hapticFeedback(2);
          
          // Start transcription
          await this.transcribeRecording(fileUri);
        }
      });
    }
  }

  private async stopAndFlagRecording(): Promise<void> {
    const uri = await this.stopRecording();
    if (uri) {
      this.recorder.stop(async (fileUri, bookmarks) => {
        if (fileUri) {
          this.uploader.enqueue(fileUri, bookmarks || [], true);
          this.updateUploadQueueCount();
          this.notify('Recording flagged', '🚩');
          this.hapticFeedback(3);
          
          // Start transcription
          await this.transcribeRecording(fileUri);
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

  // Transcription methods
  private async transcribeRecording(fileUri: string): Promise<void> {
    if (!fileUri) {
      console.error('No file URI provided for transcription');
      return;
    }

    try {
      console.log('=== STARTING TRANSCRIPTION ===');
      console.log('File URI:', fileUri);
      
      this.state.isTranscribing = true;
      this.notifyStateChange();
      this.notify('Transcribing audio...', '🎯');

      const result = await this.transcription.transcribeAudio(fileUri, 'openai');
      console.log('Transcription result:', result);

      if (result.text && result.text.trim()) {
        this.state.lastTranscription = result.text;
        this.notify(`Transcription: ${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}`, '📝');
        console.log('✅ Transcription completed successfully:', result.text);
      } else if (result.error) {
        this.notify(`Transcription failed: ${result.error}`, '❌');
        console.error('❌ Transcription error:', result.error);
      } else {
        this.notify('Transcription returned empty result', '❌');
        console.error('❌ Transcription returned empty result');
      }
    } catch (error) {
      console.error('❌ Transcription exception:', error);
      this.notify(`Transcription failed: ${error}`, '❌');
    } finally {
      this.state.isTranscribing = false;
      this.notifyStateChange();
      console.log('=== TRANSCRIPTION FINISHED ===');
    }
  }

  async retranscribeLastRecording(): Promise<void> {
    if (this.state.lastRecordingUri) {
      await this.transcribeRecording(this.state.lastRecordingUri);
    } else {
      this.notify('No recording to transcribe', '⚠️');
    }
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
      // Notifications not available in web/Expo Go - this is expected
      if (error.message?.includes('not available on web')) {
        console.log(`📱 ${emoji} ${title}`);
      } else {
        console.warn('Notification failed:', error);
      }
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
    try {
      console.log('Cleaning up AppController...');
      if (this.recorder.isRecording) {
        await this.stopRecording();
      }
      await this.recorder.cleanup();
      await this.flic.disconnect();
      this.listeners = [];
      console.log('AppController cleanup completed');
    } catch (error) {
      console.error('Cleanup error:', error);
    }
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