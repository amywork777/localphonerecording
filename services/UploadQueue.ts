import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UploadItem {
  id: string;
  path: string;
  bookmarks: number[];
  flagged: boolean;
  retries: number;
  createdAt: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
}

export interface UploadConfig {
  endpoint: string;
  maxRetries: number;
  retryDelay: number; // base delay in milliseconds
  maxRetryDelay: number; // maximum delay cap
  cleanupAfterDays: number;
}

const defaultConfig: UploadConfig = {
  endpoint: 'https://your-upload-endpoint.com/api/upload',
  maxRetries: 5,
  retryDelay: 2000, // 2 seconds
  maxRetryDelay: 30000, // 30 seconds
  cleanupAfterDays: 7,
};

export class UploadQueue {
  private config: UploadConfig;
  private isProcessing = false;
  private queue: UploadItem[] = [];
  private readonly STORAGE_KEY = 'upload_queue';

  constructor(config?: Partial<UploadConfig>) {
    this.config = { ...defaultConfig, ...config };
    this.loadQueue();
    this.startPeriodicCleanup();
  }

  async enqueue(filePath: string, bookmarks: number[] = [], flagged = false): Promise<string> {
    const item: UploadItem = {
      id: this.generateId(),
      path: filePath,
      bookmarks,
      flagged,
      retries: 0,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.queue.push(item);
    await this.saveQueue();
    
    console.log('Enqueued upload:', item.id, flagged ? '(FLAGGED)' : '');
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return item.id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('Starting upload queue processing...');

    try {
      while (true) {
        const pendingItem = this.queue.find(item => 
          item.status === 'pending' && item.retries < this.config.maxRetries
        );

        if (!pendingItem) {
          break; // No more items to process
        }

        await this.processItem(pendingItem);
      }
    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.isProcessing = false;
      console.log('Queue processing stopped');
    }
  }

  private async processItem(item: UploadItem): Promise<void> {
    console.log(`Processing upload: ${item.id} (attempt ${item.retries + 1})`);
    
    item.status = 'uploading';
    await this.saveQueue();

    try {
      // Check if file still exists
      const fileInfo = await FileSystem.getInfoAsync(item.path);
      if (!fileInfo.exists) {
        console.warn(`File not found: ${item.path}`);
        item.status = 'failed';
        await this.saveQueue();
        return;
      }

      // Attempt upload
      const success = await this.uploadFile(item);
      
      if (success) {
        item.status = 'completed';
        console.log(`Upload completed: ${item.id}`);
        
        // Optionally delete local file after successful upload
        // await FileSystem.deleteAsync(item.path, { idempotent: true });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error(`Upload failed for ${item.id}:`, error);
      item.retries++;
      
      if (item.retries >= this.config.maxRetries) {
        item.status = 'failed';
        console.error(`Max retries reached for ${item.id}, marking as failed`);
      } else {
        item.status = 'pending';
        const delay = this.calculateRetryDelay(item.retries);
        console.log(`Will retry ${item.id} in ${delay}ms`);
        
        // Schedule retry
        setTimeout(() => {
          if (!this.isProcessing) {
            this.processQueue();
          }
        }, delay);
      }
    }

    await this.saveQueue();
  }

  private async uploadFile(item: UploadItem): Promise<boolean> {
    try {
      const formData = new FormData();
      
      // Add audio file
      formData.append('audio', {
        uri: item.path,
        type: 'audio/m4a',
        name: `recording-${item.id}.m4a`,
      } as any);

      // Add metadata
      formData.append('metadata', JSON.stringify({
        id: item.id,
        bookmarks: item.bookmarks,
        flagged: item.flagged,
        createdAt: item.createdAt,
      }));

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        // Add timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Upload response:', result);
      
      return true;
    } catch (error) {
      console.error('Upload request failed:', error);
      return false;
    }
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.retryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = baseDelay + jitter;
    
    return Math.min(delay, this.config.maxRetryDelay);
  }

  async getQueueStatus(): Promise<{
    pending: number;
    uploading: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const status = {
      pending: 0,
      uploading: 0,
      completed: 0,
      failed: 0,
      total: this.queue.length,
    };

    this.queue.forEach(item => {
      status[item.status]++;
    });

    return status;
  }

  async retryFailed(): Promise<void> {
    const failedItems = this.queue.filter(item => item.status === 'failed');
    
    for (const item of failedItems) {
      item.status = 'pending';
      item.retries = 0;
    }

    await this.saveQueue();
    
    if (failedItems.length > 0 && !this.isProcessing) {
      this.processQueue();
    }
  }

  async clearCompleted(): Promise<number> {
    const completedCount = this.queue.filter(item => item.status === 'completed').length;
    this.queue = this.queue.filter(item => item.status !== 'completed');
    await this.saveQueue();
    return completedCount;
  }

  private async loadQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`Loaded ${this.queue.length} items from queue`);
        
        // Reset any items that were "uploading" when app was closed
        this.queue.forEach(item => {
          if (item.status === 'uploading') {
            item.status = 'pending';
          }
        });
        
        // Resume processing if there are pending items
        if (this.queue.some(item => item.status === 'pending')) {
          this.processQueue();
        }
      }
    } catch (error) {
      console.error('Failed to load upload queue:', error);
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save upload queue:', error);
    }
  }

  private startPeriodicCleanup(): void {
    // Clean up old completed/failed items every hour
    setInterval(() => {
      this.cleanupOldItems();
    }, 60 * 60 * 1000);
  }

  private async cleanupOldItems(): Promise<void> {
    const cutoffTime = Date.now() - (this.config.cleanupAfterDays * 24 * 60 * 60 * 1000);
    const initialCount = this.queue.length;
    
    this.queue = this.queue.filter(item => {
      const shouldKeep = item.status === 'pending' || 
                        item.status === 'uploading' || 
                        item.createdAt > cutoffTime;
      
      // Delete associated files for old completed items
      if (!shouldKeep && (item.status === 'completed' || item.status === 'failed')) {
        FileSystem.deleteAsync(item.path, { idempotent: true }).catch(() => {
          // Ignore errors when deleting old files
        });
      }
      
      return shouldKeep;
    });

    if (this.queue.length !== initialCount) {
      await this.saveQueue();
      console.log(`Cleaned up ${initialCount - this.queue.length} old queue items`);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  updateConfig(newConfig: Partial<UploadConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}