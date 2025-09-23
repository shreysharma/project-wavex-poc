interface OneShotAudioResult {
  success: boolean;
  original_text: string;
  translated_text: string;
  audio_data?: string; // base64 encoded audio
  source_language: string;
  target_language: string;
  latency: {
    stt_ms: number;
    translate_ms: number;
    tts_ms: number;
    total_ms: number;
  };
  error?: string;
}

interface OneShotVideoResult {
  success: boolean;
  original_text: string;
  translated_text: string;
  video_data?: string; // base64 encoded video
  source_language: string;
  target_language: string;
  latency: {
    stt_ms: number;
    translate_ms: number;
    tts_ms: number;
    total_ms: number;
  };
  error?: string;
}

interface OneShotTranslationResult {
  language: {
    code: string;
    name: string;
    nativeName: string;
  };
  original_text: string;
  translated_text: string;
  audio_data?: string;
  video_data?: string;
  latency: number;
  success: boolean;
  error?: string;
}

interface OneShotProgress {
  completed: number;
  total: number;
  currentLanguage?: string;
  batchResults?: OneShotTranslationResult[]; // New: results from current batch
}

export class OneShotService {
  private static readonly API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  // Language mapping for display
  private static readonly LANGUAGE_MAP: { [key: string]: { name: string; nativeName: string } } = {
    'hi': { name: 'Hindi', nativeName: 'हिंदी' },
    'en': { name: 'English', nativeName: 'English' },
    'ta': { name: 'Tamil', nativeName: 'தমিল' },
    'te': { name: 'Telugu', nativeName: 'তেলুগু' },
    'bn': { name: 'Bengali', nativeName: 'বাংলা' },
    'mr': { name: 'Marathi', nativeName: 'মরাঠি' },
    'gu': { name: 'Gujarati', nativeName: 'ગુજরાતી' },
    'kn': { name: 'Kannada', nativeName: 'ಕন্নড' },
    'ml': { name: 'Malayalam', nativeName: 'মলয়ালম' },
    'pa': { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
    'ur': { name: 'Urdu', nativeName: 'اردو' },
    'or': { name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
    'as': { name: 'Assamese', nativeName: 'অসমীয়া' },
  };

  // All target languages for parallel processing
  private static readonly TARGET_LANGUAGES = [
    'hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'or', 'as'
  ];

  /**
   * Process audio file in One Shot Mode - send to all target languages in parallel
   */
  static async processAudioFile(
    file: File, 
    inputLanguage: string,
    onProgress?: (completed: number, total: number, currentLanguage?: string, batchResults?: OneShotTranslationResult[]) => void
  ): Promise<OneShotTranslationResult[]> {
    console.log(`[ONE SHOT AUDIO] Starting processing: ${file.name} (${inputLanguage})`);
    
    const results: OneShotTranslationResult[] = [];
    const targetLanguages = this.TARGET_LANGUAGES.filter(lang => lang !== inputLanguage);
    
    // Add input language for original transcription
    const allLanguages = [inputLanguage, ...targetLanguages];
    
    console.log(`[ONE SHOT AUDIO] Processing ${allLanguages.length} languages in parallel:`, allLanguages);

    // Process in batches to avoid overwhelming the server
    const BATCH_SIZE = 3;
    let completedCount = 0;

    for (let i = 0; i < allLanguages.length; i += BATCH_SIZE) {
      const batch = allLanguages.slice(i, i + BATCH_SIZE);
      console.log(`[ONE SHOT AUDIO] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allLanguages.length / BATCH_SIZE)}: ${batch.join(', ')}`);

      const batchPromises = batch.map(async (targetLanguage) => {
        try {
          onProgress?.(completedCount, allLanguages.length, targetLanguage);
          
          // Convert audio to PCM format first (like the existing TranslationService does)
          console.log(`[ONE SHOT AUDIO] Converting ${targetLanguage} audio to PCM format...`);
          
          const audioContext = new AudioContext({ sampleRate: 16000 });
          const arrayBuffer = await file.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to 16-bit PCM mono at 16kHz
          const channelData = audioBuffer.getChannelData(0);
          const pcmBuffer = new Int16Array(channelData.length);
          for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            pcmBuffer[i] = Math.round(sample * 32767);
          }
          
          // Create PCM blob
          const pcmBlob = new Blob([pcmBuffer.buffer], { type: 'audio/raw' });
          
          const formData = new FormData();
          formData.append('file', pcmBlob, 'audio.raw');
          formData.append('input_language', inputLanguage);
          formData.append('output_language', targetLanguage);

          console.log(`[ONE SHOT AUDIO] Sending ${targetLanguage} request with PCM data (${pcmBuffer.length} samples)...`);
          const response = await fetch(`${this.API_BASE_URL}/translate-file`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result: OneShotAudioResult = await response.json();
          console.log(`[ONE SHOT AUDIO] Completed ${targetLanguage}:`, result.success ? 'SUCCESS' : 'FAILED');

          const langInfo = this.LANGUAGE_MAP[targetLanguage] || { name: targetLanguage.toUpperCase(), nativeName: targetLanguage.toUpperCase() };

          return {
            language: {
              code: targetLanguage,
              name: langInfo.name,
              nativeName: langInfo.nativeName,
            },
            original_text: result.original_text || '',
            translated_text: result.translated_text || '',
            audio_data: result.audio_data,
            latency: result.latency?.total_ms || 0,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          console.error(`[ONE SHOT AUDIO] Failed for ${targetLanguage}:`, error);
          const langInfo = this.LANGUAGE_MAP[targetLanguage] || { name: targetLanguage.toUpperCase(), nativeName: targetLanguage.toUpperCase() };
          
          return {
            language: {
              code: targetLanguage,
              name: langInfo.name,
              nativeName: langInfo.nativeName,
            },
            original_text: '',
            translated_text: `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
            latency: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      // Wait for current batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      completedCount += batch.length;

      // Update progress with batch results
      onProgress?.(completedCount, allLanguages.length, undefined, batchResults);

      // Small delay between batches
      if (i + BATCH_SIZE < allLanguages.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`[ONE SHOT AUDIO] Completed all ${allLanguages.length} languages`);
    return results;
  }

  /**
   * Process video file in One Shot Mode - send to all target languages in parallel
   */
  static async processVideoFile(
    file: File, 
    inputLanguage: string,
    onProgress?: (completed: number, total: number, currentLanguage?: string, batchResults?: OneShotTranslationResult[]) => void
  ): Promise<OneShotTranslationResult[]> {
    console.log(`[ONE SHOT VIDEO] Starting processing: ${file.name} (${inputLanguage})`);
    
    const results: OneShotTranslationResult[] = [];
    const targetLanguages = this.TARGET_LANGUAGES.filter(lang => lang !== inputLanguage);
    
    // Add input language for original transcription
    const allLanguages = [inputLanguage, ...targetLanguages];
    
    console.log(`[ONE SHOT VIDEO] Processing ${allLanguages.length} languages in parallel:`, allLanguages);

    // Process in batches to avoid overwhelming the server
    const BATCH_SIZE = 2; // Smaller batches for video due to larger file sizes
    let completedCount = 0;

    for (let i = 0; i < allLanguages.length; i += BATCH_SIZE) {
      const batch = allLanguages.slice(i, i + BATCH_SIZE);
      console.log(`[ONE SHOT VIDEO] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allLanguages.length / BATCH_SIZE)}: ${batch.join(', ')}`);

      const batchPromises = batch.map(async (targetLanguage) => {
        try {
          onProgress?.(completedCount, allLanguages.length, targetLanguage);
          
          const formData = new FormData();
          formData.append('file', file);
          formData.append('input_language', inputLanguage);
          formData.append('output_language', targetLanguage);

          console.log(`[ONE SHOT VIDEO] Sending ${targetLanguage} request...`);
          const response = await fetch(`${this.API_BASE_URL}/translate-video`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result: OneShotVideoResult = await response.json();
          console.log(`[ONE SHOT VIDEO] Completed ${targetLanguage}:`, result.success ? 'SUCCESS' : 'FAILED');

          const langInfo = this.LANGUAGE_MAP[targetLanguage] || { name: targetLanguage.toUpperCase(), nativeName: targetLanguage.toUpperCase() };

          return {
            language: {
              code: targetLanguage,
              name: langInfo.name,
              nativeName: langInfo.nativeName,
            },
            original_text: result.original_text || '',
            translated_text: result.translated_text || '',
            video_data: result.video_data,
            latency: result.latency?.total_ms || 0,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          console.error(`[ONE SHOT VIDEO] Failed for ${targetLanguage}:`, error);
          const langInfo = this.LANGUAGE_MAP[targetLanguage] || { name: targetLanguage.toUpperCase(), nativeName: targetLanguage.toUpperCase() };
          
          return {
            language: {
              code: targetLanguage,
              name: langInfo.name,
              nativeName: langInfo.nativeName,
            },
            original_text: '',
            translated_text: `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
            latency: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      // Wait for current batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      completedCount += batch.length;

      // Update progress with batch results
      onProgress?.(completedCount, allLanguages.length, undefined, batchResults);

      // Small delay between batches
      if (i + BATCH_SIZE < allLanguages.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Longer delay for video
      }
    }

    console.log(`[ONE SHOT VIDEO] Completed all ${allLanguages.length} languages`);
    return results;
  }

  /**
   * Get supported languages
   */
  static getSupportedLanguages() {
    return this.TARGET_LANGUAGES.map(code => ({
      code,
      name: this.LANGUAGE_MAP[code]?.name || code.toUpperCase(),
      nativeName: this.LANGUAGE_MAP[code]?.nativeName || code.toUpperCase(),
    }));
  }
}