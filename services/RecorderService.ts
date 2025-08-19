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
      // Ensure we're not already recording
      if (this.isRecording) {
        console.log('Already recording, cannot start new recording');
        return false;
      }

      // Clean up any existing recording first with better error handling
      await this.forceCleanup();

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

      console.log('🎤 Creating new recording object...');
      
      // Create new recording with retry logic for state conflicts
      let retryCount = 0;
      while (retryCount < 3) {
        try {
          this.recording = new Audio.Recording();
          await this.recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
          break; // Success, exit retry loop
        } catch (prepareError) {
          console.warn(`Recording prepare attempt ${retryCount + 1} failed:`, prepareError);
          
          // Clean up failed recording object
          if (this.recording) {
            try {
              await this.recording.stopAndUnloadAsync();
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            this.recording = null;
          }
          
          retryCount++;
          if (retryCount >= 3) {
            throw prepareError; // Re-throw if all retries failed
          }
          
          // Wait briefly before retry
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Start recording
      await this.recording!.startAsync();
      this.startTime = Date.now();
      this.bookmarks = [];
      
      console.log('✅ Recording started successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      // Force cleanup on error
      await this.forceCleanup();
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
    if (!this.recording) return false;
    
    try {
      // Check if recording object exists and is in a valid state
      return this.recording._isDoneRecording === false;
    } catch (error) {
      // If we can't check state, assume not recording
      console.warn('Could not check recording state:', error);
      return false;
    }
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

  // Force cleanup method with aggressive error handling
  private async forceCleanup(): Promise<void> {
    if (this.recording) {
      try {
        // Try to get status first to check if recording is valid
        const status = await this.recording.getStatusAsync();
        if (!status.isDoneRecording) {
          await this.recording.stopAndUnloadAsync();
        } else {
          // If already done, just unload
          await this.recording.unloadAsync();
        }
      } catch (error) {
        // If normal cleanup fails, try just unloading
        try {
          await this.recording.unloadAsync();
        } catch (unloadError) {
          console.log('Force unload also failed (ignored):', unloadError);
        }
      }
      this.recording = null;
    }
    this.fileUri = null;
    this.bookmarks = [];
  }

  // Public cleanup method to ensure no lingering recordings
  async cleanup(): Promise<void> {
    await this.forceCleanup();
  }
}