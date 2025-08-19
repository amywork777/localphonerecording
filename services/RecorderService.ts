import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export type RecorderCallback = (fileUri?: string, bookmarks?: number[]) => void;

export class RecorderService {
  private recording: Audio.Recording | null = null;
  private fileUri: string | null = null;
  private bookmarks: number[] = [];
  private startTime: number = 0;

  private readonly recordingOptions: Audio.RecordingOptions = {
    android: {
      extension: '.m4a',
      outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
      audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 32000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
      audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MEDIUM,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 32000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
  };

  async start(): Promise<boolean> {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Audio recording permission not granted');
        return false;
      }

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: false,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      // Create new recording
      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync(this.recordingOptions);
      
      // Generate file name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.fileUri = `${FileSystem.documentDirectory}recording-${timestamp}.m4a`;
      
      // Start recording
      await this.recording.startAsync();
      this.startTime = Date.now();
      this.bookmarks = [];
      
      console.log('Recording started');
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  async stop(onFinish?: RecorderCallback): Promise<void> {
    if (!this.recording) {
      onFinish?.(undefined, []);
      return;
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      
      // Copy to permanent location
      if (uri && this.fileUri) {
        await FileSystem.copyAsync({ from: uri, to: this.fileUri });
      }

      const finalUri = this.fileUri;
      const finalBookmarks = [...this.bookmarks];

      // Clean up
      this.recording = null;
      this.fileUri = null;
      this.bookmarks = [];
      
      console.log('Recording stopped:', finalUri);
      onFinish?.(finalUri, finalBookmarks);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      onFinish?.(undefined, []);
    }
  }

  mark(): void {
    if (!this.recording || !this.isRecording) {
      return;
    }

    const currentTime = (Date.now() - this.startTime) / 1000;
    this.bookmarks.push(currentTime);
    console.log('Bookmark added at:', currentTime);
  }

  get isRecording(): boolean {
    return this.recording?._isDoneRecording === false;
  }

  async getDurationMillis(): Promise<number> {
    if (!this.recording || !this.isRecording) {
      return 0;
    }
    
    try {
      const status = await this.recording.getStatusAsync();
      return status.durationMillis || 0;
    } catch {
      return 0;
    }
  }
}