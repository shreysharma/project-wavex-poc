interface TranslationResponse {
  original_text: string;
  translated_text: string;
  latency: number;
}

interface TranslationResult {
  language: {
    code: string;
    name: string;
    nativeName: string;
  };
  original_text: string;
  translated_text: string;
  latency: number;
}

export class TranslationService {
  private static readonly API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  static async translateText(text: string, sourceLanguage: string): Promise<TranslationResult[]> {
    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('source_language', sourceLanguage);

      const response = await fetch(`${this.API_BASE_URL}/translate-text`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Check if the API response has the expected format
      if (!result.success || !result.translations) {
        throw new Error('Invalid API response format');
      }

      // Map the API response to our TranslationResult format
      const languageMap: { [key: string]: { name: string; nativeName: string } } = {
        'hi': { name: 'Hindi', nativeName: 'हिंदी' },
        'en': { name: 'English', nativeName: 'English' },
        'ta': { name: 'Tamil', nativeName: 'தமிழ்' },
        'te': { name: 'Telugu', nativeName: 'తెలుగు' },
        'bn': { name: 'Bengali', nativeName: 'বাংলা' },
        'mr': { name: 'Marathi', nativeName: 'मराठी' },
        'gu': { name: 'Gujarati', nativeName: 'ગુજરાતી' },
        'kn': { name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
        'ml': { name: 'Malayalam', nativeName: 'മലയാളം' },
        'pa': { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
        'ur': { name: 'Urdu', nativeName: 'اردو' },
        'or': { name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
        'as': { name: 'Assamese', nativeName: 'অসমীয়া' },
      };

      const translations: TranslationResult[] = result.translations.map((translation: any) => {
        const langCode = translation.language;
        const langInfo = languageMap[langCode];

        return {
          language: {
            code: langCode,
            name: langInfo?.name || translation.language_name?.split(' ')[0] || langCode.toUpperCase(),
            nativeName: langInfo?.nativeName || translation.language_name || langCode.toUpperCase(),
          },
          original_text: result.original_text,
          translated_text: translation.translated_text,
          latency: translation.latency_ms || 0,
        };
      });

      // Sort translations according to preferred order: Hindi, English, Punjabi, Urdu, Marathi first
      const preferredOrder = ['hi', 'en', 'pa', 'ur', 'mr', 'gu', 'ta', 'te', 'bn', 'kn', 'ml', 'or', 'as'];
      translations.sort((a, b) => {
        const indexA = preferredOrder.indexOf(a.language.code);
        const indexB = preferredOrder.indexOf(b.language.code);
        
        // If both languages are in preferred order, sort by their index
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        // If only one is in preferred order, it comes first
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // If neither is in preferred order, sort alphabetically
        return a.language.name.localeCompare(b.language.name);
      });

      return translations;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async translateFile(file: File, inputLanguage: string, outputLanguage: string): Promise<TranslationResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('input_language', inputLanguage);
      formData.append('output_language', outputLanguage);

      const response = await fetch(`${this.API_BASE_URL}/translate-file`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        original_text: result.original_text,
        translated_text: result.translated_text,
        latency: result.latency?.trans || result.latency || 0,
      };
    } catch (error) {
      console.error('File translation error:', error);
      throw new Error(`File translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // One Shot Mode: Process audio file with 12 parallel API calls
  static async processAudioFileOneShot(file: File, inputLanguage: string): Promise<TranslationResult[]> {
    try {
      console.log(`Processing audio file with 12 parallel /translate-file API calls: ${file.name}`);

      // Convert audio to PCM format (like index.html)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      console.log(`Audio decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);

      // Convert entire file to 16-bit PCM mono at 16kHz
      const channelData = audioBuffer.getChannelData(0);
      const totalSamples = channelData.length;
      const fileSizeMB = (totalSamples * 2 / 1024 / 1024).toFixed(2);

      // Convert the ENTIRE file to PCM
      const pcmBuffer = new Int16Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        pcmBuffer[i] = Math.round(sample * 32767);
      }

      console.log(`Making 12 parallel /translate-file API calls with ${fileSizeMB} MB PCM data...`);

      // Define 12 target languages
      const targetLanguages = [
        { code: "hi", name: "Hindi" },
        { code: "en", name: "English" },
        { code: "ta", name: "Tamil" },
        { code: "te", name: "Telugu" },
        { code: "bn", name: "Bengali" },
        { code: "mr", name: "Marathi" },
        { code: "gu", name: "Gujarati" },
        { code: "kn", name: "Kannada" },
        { code: "ml", name: "Malayalam" },
        { code: "pa", name: "Punjabi" },
        { code: "ur", name: "Urdu" },
        { code: "or", name: "Odia" },
      ];

      // Create PCM blob once
      const pcmBlob = new Blob([pcmBuffer.buffer], { type: 'audio/raw' });

      // Process in batches to optimize performance
      const batchSize = 3; // Process 3 languages at a time
      const results: TranslationResult[] = [];

      for (let i = 0; i < targetLanguages.length; i += batchSize) {
        const batch = targetLanguages.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetLanguages.length / batchSize)}: ${batch.map(l => l.name).join(', ')}`);

        const batchPromises = batch.map(async (lang) => {
          try {
            console.log(`Starting /translate-file for ${lang.name}...`);

            const formData = new FormData();
            formData.append('file', pcmBlob, 'audio.raw');
            formData.append('input_language', inputLanguage);
            formData.append('output_language', lang.code);

            const response = await fetch(`${this.API_BASE_URL}/translate-file`, {
              method: 'POST',
              body: formData
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
              throw new Error(result.error || 'Translation failed');
            }

            console.log(`Completed /translate-file for ${lang.name}: ${result.translated_text.substring(0, 50)}...`);

            return {
              language: {
                code: lang.code,
                name: lang.name,
                nativeName: lang.name // You can map this to native names later
              },
              original_text: result.original_text,
              translated_text: result.translated_text,
              latency: result.latency?.trans || result.latency || 0,
            };
          } catch (error) {
            console.error(`/translate-file failed for ${lang.code}:`, error);
            // Return error result instead of throwing
            return {
              language: {
                code: lang.code,
                name: lang.name,
                nativeName: lang.name
              },
              original_text: '',
              translated_text: `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
              latency: 0,
            };
          }
        });

        // Wait for current batch to complete
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to reduce server load
        if (i + batchSize < targetLanguages.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`Completed all 12 /translate-file API calls in ${Math.ceil(targetLanguages.length / batchSize)} batches`);
      return results;
    } catch (error) {
      console.error('Audio One Shot processing error:', error);
      throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}