import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export type RecorderCallback = (fileUri?: string, bookmarks?: number[]) => void;

export class RecorderService {
  private recording: Audio.Recording | null = null;
  private fileUri: string | null = null;
  private bookmarks: number[] = [];
  private startTime: number = 0;

  async start(): Promise<boolean> {
    try {
      // Clean up any existing recording first
      if (this.recording) {
        try {
          await this.recording.stopAndUnloadAsync();
        } catch (cleanupError) {
          console.log('Cleanup error (ignored):', cleanupError);
        }
        this.recording = null;
      }

      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Audio recording permission not granted');
        return false;
      }

      // Set audio mode for recording - minimal config for iOS
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create new recording
      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      
      // Start recording
      await this.recording.startAsync();
      this.startTime = Date.now();
      this.bookmarks = [];
      
      console.log('Recording started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      // Clean up on error
      if (this.recording) {
        try {
          await this.recording.stopAndUnloadAsync();
        } catch (cleanupError) {
          console.log('Error cleanup failed (ignored):', cleanupError);
        }
        this.recording = null;
      }
      return false;
    }
  }

  async stop(onFinish?: RecorderCallback): Promise<void> {
    if (!this.recording) {
      console.log('No recording to stop');
      onFinish?.(undefined, []);
      return;
    }

    try {
      console.log('Stopping recording...');
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      
      const finalUri = uri;
      const finalBookmarks = [...this.bookmarks];

      // Clean up immediately
      this.recording = null;
      this.fileUri = null;
      this.bookmarks = [];
      
      console.log('Recording stopped successfully:', finalUri);
      onFinish?.(finalUri, finalBookmarks);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      // Force cleanup even on error
      this.recording = null;
      this.fileUri = null;
      this.bookmarks = [];
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

  // Cleanup method to ensure no lingering recordings
  async cleanup(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch (error) {
        console.log('Cleanup error (ignored):', error);
      }
      this.recording = null;
    }
    this.fileUri = null;
    this.bookmarks = [];
  }
}