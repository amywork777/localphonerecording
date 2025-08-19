import AsyncStorage from '@react-native-async-storage/async-storage';

interface TranscriptionResult {
  text: string;
  confidence?: number;
  error?: string;
  provider: 'assemblyai' | 'openai';
}

export class TranscriptionService {
  async transcribeAudio(audioUri: string, preferredProvider?: 'assemblyai' | 'openai'): Promise<TranscriptionResult> {
    try {
      console.log('🎯 TranscriptionService.transcribeAudio called with:', audioUri);
      
      // Get API keys from storage
      const openaiKey = await AsyncStorage.getItem('openai_api_key');
      const assemblyaiKey = await AsyncStorage.getItem('assemblyai_api_key');
      const savedProvider = await AsyncStorage.getItem('preferred_provider') as 'openai' | 'assemblyai' || 'openai';
      
      console.log('🔑 API Keys loaded:', {
        hasOpenAI: !!openaiKey,
        hasAssemblyAI: !!assemblyaiKey,
        openAILength: openaiKey?.length || 0,
        assemblyAILength: assemblyaiKey?.length || 0
      });
      
      const provider = preferredProvider || savedProvider;
      console.log('📋 Using provider:', provider);

      if (!openaiKey && !assemblyaiKey) {
        console.error('❌ No API keys found');
        return {
          text: '',
          error: 'No API keys configured. Please add your keys in Settings.',
          provider: provider
        };
      }

      // Try preferred provider first
      if (provider === 'openai' && openaiKey) {
        const result = await this.transcribeWithOpenAI(audioUri, openaiKey);
        if (result.text && !result.error) {
          return result;
        }
        // Fallback to AssemblyAI if available
        if (assemblyaiKey) {
          console.log('OpenAI failed, trying AssemblyAI as fallback');
          return await this.transcribeWithAssemblyAI(audioUri, assemblyaiKey);
        }
        return result; // Return OpenAI error if no fallback
      } else if (provider === 'assemblyai' && assemblyaiKey) {
        const result = await this.transcribeWithAssemblyAI(audioUri, assemblyaiKey);
        if (result.text && !result.error) {
          return result;
        }
        // Fallback to OpenAI if available
        if (openaiKey) {
          console.log('AssemblyAI failed, trying OpenAI as fallback');
          return await this.transcribeWithOpenAI(audioUri, openaiKey);
        }
        return result; // Return AssemblyAI error if no fallback
      }

      return {
        text: '',
        error: `No API key available for ${provider}`,
        provider: provider
      };

    } catch (error) {
      console.error('Transcription error:', error);
      return {
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: preferredProvider || 'openai'
      };
    }
  }

  async transcribeWithOpenAI(audioUri: string, apiKey: string): Promise<TranscriptionResult> {
    try {
      console.log('Starting OpenAI transcription for:', audioUri);

      // Handle blob URLs in web environment
      let audioBlob: Blob;
      if (audioUri.startsWith('blob:')) {
        console.log('Converting blob URL to blob...');
        const response = await fetch(audioUri);
        audioBlob = await response.blob();
        console.log('Blob converted, size:', audioBlob.size, 'type:', audioBlob.type);
      } else {
        // For native, create a proper file reference
        audioBlob = {
          uri: audioUri,
          type: 'audio/m4a',
          name: 'recording.m4a',
        } as any;
      }

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.m4a');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${result.error?.message || 'Unknown error'}`);
      }

      console.log('OpenAI transcription completed:', result.text);
      return {
        text: result.text || '',
        provider: 'openai'
      };

    } catch (error) {
      console.error('OpenAI transcription error:', error);
      return {
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'openai'
      };
    }
  }

  async transcribeWithAssemblyAI(audioUri: string, apiKey: string): Promise<TranscriptionResult> {
    try {
      console.log('Starting AssemblyAI transcription for:', audioUri);

      // Handle blob URLs in web environment
      let audioBlob: Blob;
      if (audioUri.startsWith('blob:')) {
        console.log('Converting blob URL to blob for AssemblyAI...');
        const response = await fetch(audioUri);
        audioBlob = await response.blob();
        console.log('AssemblyAI blob converted, size:', audioBlob.size, 'type:', audioBlob.type);
      } else {
        // For native, create a proper file reference
        audioBlob = {
          uri: audioUri,
          type: 'audio/m4a',
          name: 'recording.m4a',
        } as any;
      }

      // Step 1: Upload audio file
      const uploadFormData = new FormData();
      uploadFormData.append('file', audioBlob, 'recording.m4a');

      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
        },
        body: uploadFormData
      });

      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResult.error || 'Unknown error'}`);
      }

      const audioUrl = uploadResult.upload_url;
      console.log('Audio uploaded to AssemblyAI:', audioUrl);

      // Step 2: Request transcription
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          language_detection: true,
          punctuate: true,
          format_text: true
        })
      });

      const transcriptResult = await transcriptResponse.json();
      if (!transcriptResponse.ok) {
        throw new Error(`Transcription request failed: ${transcriptResult.error || 'Unknown error'}`);
      }

      const transcriptId = transcriptResult.id;
      console.log('AssemblyAI transcription started, ID:', transcriptId);

      // Step 3: Poll for results
      return await this.pollAssemblyAIResults(transcriptId, apiKey);

    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      return {
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'assemblyai'
      };
    }
  }

  private async pollAssemblyAIResults(transcriptId: string, apiKey: string, maxAttempts = 30): Promise<TranscriptionResult> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: {
            'authorization': apiKey
          }
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(`Polling failed: ${result.error || 'Unknown error'}`);
        }

        if (result.status === 'completed') {
          console.log('AssemblyAI transcription completed:', result.text);
          return {
            text: result.text || '',
            confidence: result.confidence,
            provider: 'assemblyai'
          };
        } else if (result.status === 'error') {
          throw new Error(`Transcription failed: ${result.error}`);
        }

        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`Polling attempt ${i + 1}/${maxAttempts}, status: ${result.status}`);

      } catch (error) {
        if (i === maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Transcription timeout - please try again');
  }
}