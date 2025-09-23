'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { WebSocketService } from '@/services/websocketService';
import { STTQueueService } from '@/services/sttQueueService';
import { AudioSessionService } from '@/services/audioSessionService';

interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export const LANGUAGES: Language[] = [
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ta', name: 'Tamil', nativeName: 'তমিল' },
  { code: 'te', name: 'Telugu', nativeName: 'তেলুগু' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr', name: 'Marathi', nativeName: 'মরাঠি' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕન্নড' },
  { code: 'ml', name: 'Malayalam', nativeName: 'মলয়ালম' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
];

interface TranslationResult {
  language: Language;
  original_text: string;
  translated_text: string;
  latency: number;
}

interface AudioChunk {
  id: string;
  audio_data: string;
  translated_text: string;
  original_text: string;
  timestamp: number;
  latency: number;
  is_final: boolean;
  confidence?: number;
}

interface LanguageQueue {
  languageCode: string;
  languageName: string;
  nativeName: string;
  chunks: AudioChunk[];
  currentPlayIndex: number;
  isPlaying: boolean;
  totalChunks: number;
}

interface AppContextType {
  // Connection state
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
  connectedSTTCount: number;
  totalSTTCount: number;
  isInitialConnection: boolean;
  setIsInitialConnection: (initial: boolean) => void;

  // Language state
  selectedLanguage: Language;
  setSelectedLanguage: (language: Language) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;

  // One shot mode state
  isOneShotMode: boolean;
  setIsOneShotMode: (mode: boolean) => void;

  // Media popup state
  isPopupOpen: boolean;
  setIsPopupOpen: (open: boolean) => void;
  selectedMediaType: 'text' | 'audio' | 'video' | null;
  setSelectedMediaType: (type: 'text' | 'audio' | 'video' | null) => void;

  // Translation results
  translationResults: TranslationResult[];
  setTranslationResults: (results: TranslationResult[]) => void;
  isTranslating: boolean;
  setIsTranslating: (translating: boolean) => void;
  isWaitingForAudioChunks: boolean;
  setIsWaitingForAudioChunks: (waiting: boolean) => void;
  inputText: string;
  setInputText: (text: string) => void;

  // Selected files
  selectedAudioFile: File | null;
  setSelectedAudioFile: (file: File | null) => void;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;

  // Global Language Queues
  hindiQueue: LanguageQueue;
  englishQueue: LanguageQueue;
  tamilQueue: LanguageQueue;
  teluguQueue: LanguageQueue;
  bengaliQueue: LanguageQueue;
  marathiQueue: LanguageQueue;
  gujaratiQueue: LanguageQueue;
  kannadaQueue: LanguageQueue;
  malayalamQueue: LanguageQueue;
  punjabiQueue: LanguageQueue;
  urduQueue: LanguageQueue;
  odiaQueue: LanguageQueue;
  assameseQueue: LanguageQueue;

  // Global Audio Playback Control
  currentlyPlayingLanguage: string | null;
  setCurrentlyPlayingLanguage: (language: string | null) => void;
  sharedAudioPosition: number;
  setSharedAudioPosition: (position: number) => void;

  // Global Video Playback Control
  currentlyPlayingVideo: string | null;
  setCurrentlyPlayingVideo: (videoId: string | null) => void;
  sharedVideoPosition: number;
  setSharedVideoPosition: (position: number) => void;

  // Queue Management Functions
  addChunkToQueue: (languageCode: string, chunk: AudioChunk) => void;
  getLanguageQueue: (languageCode: string) => LanguageQueue;
  clearLanguageQueue: (languageCode: string) => void;
  clearAllQueues: () => void;
  restartAudioSession: () => Promise<void>;

  // Helper functions
  handleLanguageSelect: (language: Language) => void;
  selectMediaType: (type: string) => void;
  toggleConnection: () => void;
  translateText: (text: string) => Promise<void>;
  processAudioFile: (file: File) => Promise<void>;
  processVideoFile: (file: File) => Promise<void>;
  
  // One Shot Mode state
  oneShotResults: TranslationResult[];
  setOneShotResults: (results: TranslationResult[]) => void;
  oneShotProgress: { completed: number; total: number; currentLanguage?: string };
  setOneShotProgress: (progress: { completed: number; total: number; currentLanguage?: string }) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [connectedSTTCount, setConnectedSTTCount] = useState(0);
  const [totalSTTCount, setTotalSTTCount] = useState(12);
  const [isInitialConnection, setIsInitialConnection] = useState(true);

  // Language state
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(LANGUAGES[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // One shot mode state
  const [isOneShotMode, setIsOneShotMode] = useState(false);

  // Media popup state
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedMediaType, setSelectedMediaType] = useState<'text' | 'audio' | 'video' | null>('text');

  // Translation state
  const [translationResults, setTranslationResults] = useState<TranslationResult[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isWaitingForAudioChunks, setIsWaitingForAudioChunks] = useState(false);
  const [inputText, setInputText] = useState('');

  // Selected files state
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);

  // One Shot Mode state
  const [oneShotResults, setOneShotResults] = useState<TranslationResult[]>([]);
  const [oneShotProgress, setOneShotProgress] = useState<{ completed: number; total: number; currentLanguage?: string }>({ completed: 0, total: 0 });

  // Global Language Queues State
  const [hindiQueue, setHindiQueue] = useState<LanguageQueue>({
    languageCode: 'hi', languageName: 'Hindi', nativeName: 'हिंदी',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [englishQueue, setEnglishQueue] = useState<LanguageQueue>({
    languageCode: 'en', languageName: 'English', nativeName: 'English',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [tamilQueue, setTamilQueue] = useState<LanguageQueue>({
    languageCode: 'ta', languageName: 'Tamil', nativeName: 'தமிழ்',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [teluguQueue, setTeluguQueue] = useState<LanguageQueue>({
    languageCode: 'te', languageName: 'Telugu', nativeName: 'తెలుగు',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [bengaliQueue, setBengaliQueue] = useState<LanguageQueue>({
    languageCode: 'bn', languageName: 'Bengali', nativeName: 'বাংলা',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [marathiQueue, setMarathiQueue] = useState<LanguageQueue>({
    languageCode: 'mr', languageName: 'Marathi', nativeName: 'मराठी',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [gujaratiQueue, setGujaratiQueue] = useState<LanguageQueue>({
    languageCode: 'gu', languageName: 'Gujarati', nativeName: 'ગુજરાતી',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [kannadaQueue, setKannadaQueue] = useState<LanguageQueue>({
    languageCode: 'kn', languageName: 'Kannada', nativeName: 'ಕನ್ನಡ',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [malayalamQueue, setMalayalamQueue] = useState<LanguageQueue>({
    languageCode: 'ml', languageName: 'Malayalam', nativeName: 'മലയാളം',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [punjabiQueue, setPunjabiQueue] = useState<LanguageQueue>({
    languageCode: 'pa', languageName: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [urduQueue, setUrduQueue] = useState<LanguageQueue>({
    languageCode: 'ur', languageName: 'Urdu', nativeName: 'اردو',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [odiaQueue, setOdiaQueue] = useState<LanguageQueue>({
    languageCode: 'or', languageName: 'Odia', nativeName: 'ଓଡ଼ିଆ',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });
  const [assameseQueue, setAssameseQueue] = useState<LanguageQueue>({
    languageCode: 'as', languageName: 'Assamese', nativeName: 'অসমীয়া',
    chunks: [], currentPlayIndex: 0, isPlaying: false, totalChunks: 0
  });

  // Global Audio Playback Control
  const [currentlyPlayingLanguage, setCurrentlyPlayingLanguage] = useState<string | null>(null);
  const [sharedAudioPosition, setSharedAudioPosition] = useState<number>(0); // Like index.html

  // Global Video Playback Control
  const [currentlyPlayingVideo, setCurrentlyPlayingVideo] = useState<string | null>(null);
  const [sharedVideoPosition, setSharedVideoPosition] = useState<number>(0);

  // Helper functions
  const handleLanguageSelect = (language: Language) => {
    setSelectedLanguage(language);
    setIsDropdownOpen(false);
  };

  const selectMediaType = (type: string) => {
    console.log('AppContext: selectMediaType called with:', type);

    if (type === 'audio') {
      // Create file input for audio
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.wav,.m4a,.flac';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          console.log('Audio file selected:', file.name);
          setSelectedAudioFile(file);
          // Clear text input and translation results when switching to audio mode
          setInputText('');
          setTranslationResults([]);
          // Clear frontend state (don't start backend processing yet)
          clearAllQueues();
        }
      };
      input.click();
    } else if (type === 'video') {
      // Create file input for video
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*,.mp4,.mov,.avi,.mkv';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          console.log('Video file selected:', file.name);
          setSelectedVideoFile(file);
          // Clear text input and translation results when switching to video mode
          setInputText('');
          setTranslationResults([]);
          // Clear frontend state (don't start backend processing yet)
          clearAllQueues();
        }
      };
      input.click();
    } else {
      // Text mode - clear any selected media files
      setSelectedMediaType('text');
      setSelectedAudioFile(null);
      setSelectedVideoFile(null);
      // Clear language queues when switching to text mode
      clearAllQueues();
    }

    setIsPopupOpen(false);
    console.log('AppContext: Popup closed');
  };

  const toggleConnection = () => {
    setIsConnected(!isConnected);
  };

  // Global Queue Management Functions
  const getQueueSetter = (languageCode: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<LanguageQueue>> } = {
      'hi': setHindiQueue,
      'en': setEnglishQueue,
      'ta': setTamilQueue,
      'te': setTeluguQueue,
      'bn': setBengaliQueue,
      'mr': setMarathiQueue,
      'gu': setGujaratiQueue,
      'kn': setKannadaQueue,
      'ml': setMalayalamQueue,
      'pa': setPunjabiQueue,
      'ur': setUrduQueue,
      'or': setOdiaQueue,
      'as': setAssameseQueue,
    };
    return setters[languageCode];
  };

  const getLanguageQueue = (languageCode: string): LanguageQueue => {
    const queues: { [key: string]: LanguageQueue } = {
      'hi': hindiQueue,
      'en': englishQueue,
      'ta': tamilQueue,
      'te': teluguQueue,
      'bn': bengaliQueue,
      'mr': marathiQueue,
      'gu': gujaratiQueue,
      'kn': kannadaQueue,
      'ml': malayalamQueue,
      'pa': punjabiQueue,
      'ur': urduQueue,
      'or': odiaQueue,
      'as': assameseQueue,
    };
    return queues[languageCode] || queues['en']; // Fallback to English
  };

  const addChunkToQueue = (languageCode: string, chunk: AudioChunk) => {
    const setter = getQueueSetter(languageCode);
    if (!setter) {
      console.error(`No setter found for language: ${languageCode}`);
      return;
    }

    setter(prev => ({
      ...prev,
      chunks: [...prev.chunks, chunk],
      totalChunks: prev.totalChunks + 1
    }));

    console.log(`[GLOBAL] Added chunk to ${languageCode.toUpperCase()} queue: "${chunk.translated_text.substring(0, 30)}..."`);
  };

  const clearLanguageQueue = (languageCode: string) => {
    const setter = getQueueSetter(languageCode);
    if (!setter) return;

    setter(prev => ({
      ...prev,
      chunks: [],
      currentPlayIndex: 0,
      isPlaying: false,
      totalChunks: 0
    }));

    console.log(`[GLOBAL] Cleared ${languageCode.toUpperCase()} queue`);
  };

  const clearAllQueues = () => {
    const allCodes = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'or', 'as'];
    allCodes.forEach(code => clearLanguageQueue(code));
    console.log('[GLOBAL] Cleared all language queues');
  };

  const restartAudioSession = async () => {
    console.log('[GLOBAL] Restarting audio session...');
    clearAllQueues();
    setCurrentlyPlayingLanguage(null);
    setSharedAudioPosition(0);
    
    // Don't send language_settings here - just clear frontend state
    // language_settings will be sent when user presses Translate button
    console.log('[GLOBAL] Audio session restarted - cleared frontend state');
  };

  const translateText = async (text: string) => {
    if (!text.trim()) return;

    setIsTranslating(true);
    try {
      const { TranslationService } = await import('@/services/translationService');
      const results = await TranslationService.translateText(text, selectedLanguage.code);
      setTranslationResults(results);

      // Also add to global language queues for STT display
      results.forEach(result => {
        const audioChunk: AudioChunk = {
          id: `text-${result.language.code}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          audio_data: '', // No audio for text translations
          translated_text: result.translated_text,
          original_text: result.original_text,
          timestamp: Date.now(),
          latency: result.latency,
          is_final: true,
          confidence: 1.0
        };

        addChunkToQueue(result.language.code, audioChunk);
      });

      console.log(`Added ${results.length} translation results to language queues`);
    } catch (error) {
      console.error('Translation failed:', error);
      // You can add error handling UI here
    } finally {
      setIsTranslating(false);
    }
  };

  const processAudioFile = async (file: File) => {
    setIsTranslating(true);
    setIsWaitingForAudioChunks(true);

    try {
      if (isOneShotMode) {
        // One Shot Mode: Send full file to backend API - NO WebSockets
        console.log('[ONE SHOT AUDIO] Processing full audio file via REST API');
        
        // Clear all previous results and queues
        setOneShotResults([]);
        setTranslationResults([]);
        clearAllQueues();
        
        // Reset progress
        setOneShotProgress({ completed: 0, total: 13 });
        
        // Import and use the One Shot service
        const { OneShotService } = await import('@/services/oneShotService');
        
        const results = await OneShotService.processAudioFile(
          file,
          selectedLanguage.code,
          (completed, total, currentLanguage, batchResults) => {
            console.log(`[ONE SHOT AUDIO] Progress: ${completed}/${total} ${currentLanguage || ''}`);
            setOneShotProgress({ completed, total, currentLanguage });
            
            // Add batch results to queues as they complete (including failed ones)
            if (batchResults && batchResults.length > 0) {
              console.log(`[ONE SHOT AUDIO] Adding ${batchResults.length} batch results to queues`);
              batchResults.forEach(result => {
                // Add ALL results, even failed ones
                const audioChunk: AudioChunk = {
                  id: `oneshot-batch-${result.language.code}-${Date.now()}`,
                  audio_data: result.success ? (result.audio_data || '') : '',
                  translated_text: result.translated_text || `[Error: ${result.error || 'Translation failed'}]`,
                  original_text: result.original_text,
                  timestamp: Date.now(),
                  latency: result.latency,
                  is_final: true,
                  confidence: result.success ? 1.0 : 0.0
                };
                addChunkToQueue(result.language.code, audioChunk);
                console.log(`[ONE SHOT AUDIO] Added ${result.language.code} batch result: ${result.success ? 'SUCCESS' : 'FAILED'} with ${result.audio_data ? 'AUDIO' : 'NO AUDIO'} data`);
              });
            }
          }
        );
        
        console.log(`[ONE SHOT AUDIO] Completed! Received ${results.length} results`);
        
        // Convert to TranslationResult format
        const translationResults: TranslationResult[] = results.map(result => ({
          language: result.language,
          original_text: result.original_text,
          translated_text: result.translated_text,
          latency: result.latency,
        }));
        
        setOneShotResults(translationResults);
        // Don't set translationResults in One Shot Mode - only use queue results
        
        // Also add to queues for display compatibility
        results.forEach(result => {
          if (result.success && result.translated_text) {
            const audioChunk: AudioChunk = {
              id: `oneshot-${result.language.code}-${Date.now()}`,
              audio_data: result.audio_data || result.video_data || '', // Use video_data for video mode, audio_data for audio mode
              translated_text: result.translated_text,
              original_text: result.original_text,
              timestamp: Date.now(),
              latency: result.latency,
              is_final: true,
              confidence: 1.0
            };
            addChunkToQueue(result.language.code, audioChunk);
            console.log(`[ONE SHOT] Added ${result.language.code} result to queue with ${result.audio_data || result.video_data ? 'MEDIA' : 'NO MEDIA'} data`);
          }
        });
        
      } else {
        // Live Mode: Use WebSocket streaming
        const wsService = WebSocketService.getInstance();
        wsService.setAudioProcessingActive(true);

        // Force reconnect all WebSocket connections to ensure fresh start
        console.log('[AUDIO] Forcing reconnection of all WebSocket connections...');
        setIsInitialConnection(false);
        try {
          await wsService.forceReconnectAll();
          console.log('[AUDIO] WebSocket reconnection completed successfully');
        } catch (error) {
          console.warn('[AUDIO] WebSocket reconnection failed, continuing with existing connections:', error);
        }

        // Send fresh language_settings to start backend processing
        console.log('[AUDIO] Starting audio processing - sending language_settings');
        wsService.startStreaming();

        // Stream audio via existing WebSocket connections
        console.log('Live mode: Streaming audio via existing STT WebSocket connections');
        await streamAudioViaWebSockets(file);
        
        wsService.setAudioProcessingActive(false);
      }
    } catch (error) {
      console.error('Audio processing failed:', error);
      alert('Audio processing failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsTranslating(false);
      setIsWaitingForAudioChunks(false);
    }
  };

  const processAudioViaWebSockets = async (file: File) => {
    const wsService = WebSocketService.getInstance();

    // Convert audio to PCM format (like index.html One Shot mode)
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    console.log(`Audio decoded: ${audioBuffer.duration.toFixed(2)}s, processing via existing WebSocket connections`);

    // Convert entire file to PCM chunks
    const channelData = audioBuffer.getChannelData(0);
    const chunkSize = 2048;
    let currentIndex = 0;

    // Send audio chunks to all existing STT connections
    const streamInterval = setInterval(() => {
      if (currentIndex >= channelData.length) {
        clearInterval(streamInterval);
        console.log('Audio file streaming completed via WebSockets');
        return;
      }

      const chunkEnd = Math.min(currentIndex + chunkSize, channelData.length);
      const chunk = channelData.slice(currentIndex, chunkEnd);

      // Convert to PCM
      const pcmBuffer = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const sample = Math.max(-1, Math.min(1, chunk[i]));
        pcmBuffer[i] = Math.round(sample * 32767);
      }

      // Send to all existing STT WebSocket connections
      wsService.sendAudioData(pcmBuffer.buffer);

      currentIndex += chunkSize;
    }, 128); // 128ms intervals = real-time streaming
  };

  const streamAudioViaWebSockets = async (file: File) => {
    console.log('Live Mode: Starting real-time audio streaming via existing STT WebSocket connections');

    if (!isConnected) {
      throw new Error('STT WebSocket connections not ready for live streaming');
    }

    const wsService = WebSocketService.getInstance();

    try {
      // Convert audio to streaming format (like index.html live mode)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      console.log(`Live streaming: ${audioBuffer.duration.toFixed(2)}s audio file via ${connectedSTTCount} STT connections`);

      // Convert to PCM and stream in real-time chunks
      const channelData = audioBuffer.getChannelData(0);
      const chunkSize = 2048; // Same as microphone chunks
      const chunkDuration = chunkSize / 16000; // Duration per chunk in seconds
      let currentIndex = 0;

      // Update connection status to show live streaming
      setIsConnected(true); // Keep showing as connected during streaming

      // Send start streaming command to all WebSocket connections
      wsService.startStreaming();

      // Real-time streaming interval (like playing the file at normal speed)
      const streamInterval = setInterval(() => {
        if (currentIndex >= channelData.length) {
          clearInterval(streamInterval);
          console.log('Live audio streaming completed');
          return;
        }

        const chunkEnd = Math.min(currentIndex + chunkSize, channelData.length);
        const chunk = channelData.slice(currentIndex, chunkEnd);

        // Convert to 16-bit PCM (same as index.html)
        const pcmBuffer = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const sample = Math.max(-1, Math.min(1, chunk[i]));
          pcmBuffer[i] = Math.round(sample * 32767);
        }

        // Send to ALL existing STT WebSocket connections
        wsService.sendAudioData(pcmBuffer.buffer);

        // Log progress occasionally
        const progress = (currentIndex / channelData.length * 100).toFixed(1);
        if (currentIndex % (chunkSize * 10) === 0) {
          console.log(`Live streaming progress: ${progress}% (${connectedSTTCount} STT connections)`);
        }

        currentIndex += chunkSize;
      }, chunkDuration * 1000); // Stream at real-time speed (128ms intervals)

      console.log('Live audio streaming started - real-time chunks being sent to STT connections');

    } catch (error) {
      console.error('Live audio streaming setup failed:', error);
      throw error;
    }
  };

  const updateTranslationResultsFromQueues = () => {
    const queueService = STTQueueService.getInstance();
    const allLanguages = [
      { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
      { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
      { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
      { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
      { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
      { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
      { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
      { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
      { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
      { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
    ];

    const results: TranslationResult[] = [];

    // Get original text from selected language queue (for source transcription)
    const originalData = queueService.getLatestData(selectedLanguage.code);
    const originalText = originalData?.translated_text || originalData?.original_text || '';

    // Combine data from all language queues
    allLanguages.forEach(lang => {
      const latestData = queueService.getLatestData(lang.code);
      if (latestData) {
        results.push({
          language: {
            code: lang.code,
            name: lang.name,
            nativeName: lang.nativeName,
          },
          original_text: originalText, // Use original transcription for all
          translated_text: latestData.translated_text,
          latency: latestData.latency,
        });
      }
    });

    if (results.length > 0) {
      console.log(`Updated translation results from STT queues: ${results.length} languages`);
      setTranslationResults(results);
    }
  };

  const processVideoAudio = async (videoFile: File) => {
    console.log('[VIDEO] Attempting audio extraction from video file...');
    
    const wsService = WebSocketService.getInstance();
    let audioContext: AudioContext | null = null;
    
    try {
      // Use a more isolated approach - create AudioContext in an iframe context
      console.log('[VIDEO] Using direct audio decode method...');
      const arrayBuffer = await videoFile.arrayBuffer();
      
      // Create AudioContext with careful timing to avoid interference
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for any existing contexts to settle
      audioContext = new AudioContext({ sampleRate: 16000 });
      
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log(`[VIDEO] Audio decode successful! Duration: ${audioBuffer.duration.toFixed(2)}s`);
      
      // Process the audio buffer exactly like audio files
      const channelData = audioBuffer.getChannelData(0);
      const chunkSize = 2048;
      let currentIndex = 0;
      let chunksProcessed = 0;
      
      const streamInterval = setInterval(() => {
        if (currentIndex >= channelData.length) {
          clearInterval(streamInterval);
          console.log(`[VIDEO] Audio streaming completed. Processed ${chunksProcessed} chunks.`);
          return;
        }
        
        const chunkEnd = Math.min(currentIndex + chunkSize, channelData.length);
        const chunk = channelData.slice(currentIndex, chunkEnd);
        
        // Convert to PCM
        const pcmBuffer = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const sample = Math.max(-1, Math.min(1, chunk[i]));
          pcmBuffer[i] = Math.round(sample * 32767);
        }
        
        // Send to WebSocket connections
        wsService.sendAudioData(pcmBuffer.buffer);
        
        chunksProcessed++;
        if (chunksProcessed === 1) {
          console.log('[VIDEO] First audio chunk sent to WebSocket services');
        }
        if (chunksProcessed % 50 === 0) {
          console.log(`[VIDEO] Processed ${chunksProcessed} audio chunks...`);
        }
        
        currentIndex += chunkSize;
      }, 128); // 128ms intervals for real-time streaming
      
      console.log('[VIDEO] Audio streaming started via direct decode method');
      
    } catch (error) {
      console.error('[VIDEO] Audio extraction failed:', error);
      throw new Error(`Video audio extraction failed: ${error.message}`);
    } finally {
      // Ensure AudioContext is always closed with delay
      if (audioContext) {
        setTimeout(() => {
          if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
          }
        }, 500); // Delay cleanup to avoid immediate interference
      }
    }
  };

  const processVideoFile = async (file: File) => {
    setIsInitialConnection(false);
    setIsTranslating(true);
    setIsWaitingForAudioChunks(true);

    try {
      if (isOneShotMode) {
        // One Shot Mode: Send full video file to backend API - NO WebSockets
        console.log('[ONE SHOT VIDEO] Processing full video file via REST API');
        
        // Clear all previous results and queues
        setOneShotResults([]);
        setTranslationResults([]);
        clearAllQueues();
        
        // Reset progress
        setOneShotProgress({ completed: 0, total: 13 });
        
        // Import and use the One Shot service
        const { OneShotService } = await import('@/services/oneShotService');
        
        const results = await OneShotService.processVideoFile(
          file,
          selectedLanguage.code,
          (completed, total, currentLanguage, batchResults) => {
            console.log(`[ONE SHOT VIDEO] Progress: ${completed}/${total} ${currentLanguage || ''}`);
            setOneShotProgress({ completed, total, currentLanguage });
            
            // Add batch results to queues as they complete (including failed ones)
            if (batchResults && batchResults.length > 0) {
              console.log(`[ONE SHOT VIDEO] Adding ${batchResults.length} batch results to queues`);
              batchResults.forEach(result => {
                // Add ALL results, even failed ones
                const audioChunk: AudioChunk = {
                  id: `oneshot-batch-${result.language.code}-${Date.now()}`,
                  audio_data: result.success ? (result.video_data || result.audio_data || '') : '',
                  translated_text: result.translated_text || `[Error: ${result.error || 'Translation failed'}]`,
                  original_text: result.original_text,
                  timestamp: Date.now(),
                  latency: result.latency,
                  is_final: true,
                  confidence: result.success ? 1.0 : 0.0
                };
                addChunkToQueue(result.language.code, audioChunk);
                console.log(`[ONE SHOT VIDEO] Added ${result.language.code} batch result: ${result.success ? 'SUCCESS' : 'FAILED'} with ${result.video_data ? 'VIDEO' : 'NO VIDEO'} data`);
              });
            }
          }
        );
        
        console.log(`[ONE SHOT VIDEO] Completed! Received ${results.length} results`);
        
        // Convert to TranslationResult format
        const translationResults: TranslationResult[] = results.map(result => ({
          language: result.language,
          original_text: result.original_text,
          translated_text: result.translated_text,
          latency: result.latency,
        }));
        
        setOneShotResults(translationResults);
        // Don't set translationResults in One Shot Mode - only use queue results
        
        // Also add to queues for display compatibility
        results.forEach(result => {
          if (result.success && result.translated_text) {
            const audioChunk: AudioChunk = {
              id: `oneshot-${result.language.code}-${Date.now()}`,
              audio_data: result.audio_data || result.video_data || '', // Use video_data for video mode, audio_data for audio mode
              translated_text: result.translated_text,
              original_text: result.original_text,
              timestamp: Date.now(),
              latency: result.latency,
              is_final: true,
              confidence: 1.0
            };
            addChunkToQueue(result.language.code, audioChunk);
            console.log(`[ONE SHOT] Added ${result.language.code} result to queue with ${result.audio_data || result.video_data ? 'MEDIA' : 'NO MEDIA'} data`);
          }
        });
        
      } else {
        // Live Mode: Use WebSocket streaming with audio extraction
        const wsService = WebSocketService.getInstance();
        wsService.setAudioProcessingActive(true);

        // Force reconnect all WebSocket connections to ensure fresh start
        console.log('[VIDEO] Forcing reconnection of all WebSocket connections...');
        try {
          await wsService.forceReconnectAll();
          console.log('[VIDEO] WebSocket reconnection completed successfully');
        } catch (error) {
          console.warn('[VIDEO] WebSocket reconnection failed, continuing with existing connections:', error);
        }

        // Send fresh language_settings to start backend processing
        console.log('[VIDEO] Starting video processing - sending language_settings');
        wsService.startStreaming();

        // Extract audio from video file and process it
        console.log('[VIDEO] Starting video processing:', file.name);
        await processVideoAudio(file);
        
        wsService.setAudioProcessingActive(false);
      }
    } catch (error) {
      console.error('Video processing failed:', error);
      alert('Video processing failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsTranslating(false);
      setIsWaitingForAudioChunks(false);
    }
  };

  // Clear activity when switching between One Shot and Live Mode
  useEffect(() => {
    if (isOneShotMode) {
      console.log('[ONE SHOT MODE] Clearing all WebSocket activity...');
      const wsService = WebSocketService.getInstance();
      const queueService = STTQueueService.getInstance();
      const sessionService = AudioSessionService.getInstance();
      
      // Disconnect all WebSocket connections
      wsService.disconnectAll();
      
      // Clear all queues and sessions
      queueService.clearAllQueues();
      sessionService.clearAllSessions();
      clearAllQueues();
      
      // Reset connection state
      setIsConnected(false);
      setConnectedSTTCount(0);
      
      console.log('[ONE SHOT MODE] All WebSocket activity cleared');
    } else {
      // Switching back to Live Mode - clear One Shot results
      console.log('[LIVE MODE] Clearing One Shot results...');
      setOneShotResults([]);
      setOneShotProgress({ completed: 0, total: 0 });
      clearAllQueues();
      
      console.log('[LIVE MODE] One Shot results cleared');
    }
  }, [isOneShotMode]);

  // WebSocket connection and queue management (only for Live Mode)
  useEffect(() => {
    if (isOneShotMode) {
      console.log('[ONE SHOT MODE] Skipping WebSocket initialization');
      return;
    }
    
    const wsService = WebSocketService.getInstance();
    const queueService = STTQueueService.getInstance();
    const sessionService = AudioSessionService.getInstance();

    // Initialize audio sessions for all languages
    sessionService.startAllLanguageSessions();

    // Set up queue event handlers
    queueService.setEventHandlers({
      onDataReceived: (languageCode: string, data: any) => {
        console.log(`STT data queued for ${languageCode}:`, data.original_text?.substring(0, 30) + '...');
      },
      onQueueUpdated: (languageCode: string, queueLength: number) => {
        console.log(`Queue ${languageCode}: ${queueLength} items`);
      },
      onFinalTranscript: (languageCode: string, data: any) => {
        console.log(`Final transcript for ${languageCode}:`, data.translated_text);
        // TODO: Update UI with final transcript
      }
    });

    // Set up WebSocket event handlers
    wsService.setEventHandlers({
      onConnectionStatusChange: (connected: number, total: number) => {
        setConnectedSTTCount(connected);
        setTotalSTTCount(total);
        setIsConnected(connected === total); // Fully connected when all target languages are connected
        console.log(`STT Connections: ${connected}/${total}`);
        
        // If we're waiting for chunks and now have all connections, check if we can stop waiting
        if (isWaitingForAudioChunks && connected >= 13 && total >= 13) {
          console.log(`[CONNECTION] All STT connections ready (${connected}/${total}) - checking if we can stop waiting...`);
          // We'll let the next transcription chunk stop the waiting since connections are ready
        }
      },
      onTranscriptionReceived: (languageCode: string, data: any) => {
        console.log(`[ISOLATION] Processing data for ${languageCode}:`, {
          type: data.type,
          has_audio: !!data.audio_data,
          has_text: !!data.translated_text,
          sequence: data.sequence_number || 'unknown'
        });

        // Skip if no meaningful content
        if (!data.translated_text && !data.original_text) {
          console.log(`[SKIP] Empty transcription for ${languageCode}`);
          return;
        }

        // Add to global language queue
        const audioChunk: AudioChunk = {
          id: `${languageCode}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          audio_data: data.audio_data || '',
          translated_text: data.translated_text || '',
          original_text: data.original_text || '',
          timestamp: Date.now(),
          latency: data.latency || 0,
          is_final: data.is_final || false,
          confidence: data.confidence
        };

        // Add to global queue (will be stored even without audio_data for text display)
        addChunkToQueue(languageCode, audioChunk);

        // Only stop waiting for chunks when we have all 13 STT connections AND meaningful data
        if (isWaitingForAudioChunks && (data.translated_text || data.original_text)) {
          console.log(`[CHUNKS] Checking if should stop loading: connectedSTTCount=${connectedSTTCount}, totalSTTCount=${totalSTTCount}, isConnected=${isConnected}`);
          if (connectedSTTCount >= 13 && totalSTTCount >= 13) {
            console.log(`[CHUNKS] All STT connections ready (${connectedSTTCount}/${totalSTTCount}) - stopping loading state`);
            setIsWaitingForAudioChunks(false);
          } else {
            console.log(`[CHUNKS] Still waiting for all connections: ${connectedSTTCount}/${totalSTTCount}`);
          }
        }

        // Also add to session service for advanced mapping
        sessionService.addTranscriptChunk(languageCode, {
          original_text: data.original_text || '',
          translated_text: data.translated_text || '',
          latency: data.latency || 0,
          is_final: data.is_final || false,
          confidence: data.confidence
        });

        if (data.audio_data && data.audio_data.trim() !== '') {
          sessionService.addAudioChunk(languageCode, data.audio_data);
          console.log(`[${languageCode.toUpperCase()}] Added AUDIO + TRANSCRIPT to global ${languageCode.toUpperCase()}Queue`);
        } else {
          console.log(`[${languageCode.toUpperCase()}] Added TRANSCRIPT-ONLY to global ${languageCode.toUpperCase()}Queue (TTS failed)`);
        }

        // Also add to legacy queue for STT Monitor display
        const sttData = {
          id: `${languageCode}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          timestamp: Date.now(),
          original_text: data.original_text || '',
          translated_text: data.translated_text || '',
          latency: data.latency || 0,
          is_final: data.is_final || false,
          audio_data: data.audio_data && data.audio_data.trim() !== '' ? data.audio_data : undefined,
          confidence: data.confidence
        };

        queueService.addToQueue(languageCode, sttData);

        // If this is a final transcript, update translation results
        if (data.is_final && isTranslating) {
          updateTranslationResultsFromQueues();
        }
      }
    });

    // Auto-connect on app load (optional - graceful failure if STT server not available)
    wsService.connectAll(selectedLanguage.code).catch(error => {
      console.warn('STT WebSocket server not available - continuing in API-only mode:', error);
      setIsConnected(false);
      setConnectedSTTCount(0);
    });

    // Cleanup on unmount
    return () => {
      wsService.disconnectAll();
      queueService.clearAllQueues();
    };
  }, []);

  // Reconnect WebSockets when selected language changes
  useEffect(() => {
    const wsService = WebSocketService.getInstance();

    // Only reconnect if we have events set up (after initial load)
    if (connectedSTTCount > 0 || isConnected) {
      console.log(`Language changed to ${selectedLanguage.name}, reconnecting STT WebSockets...`);
      wsService.connectAll(selectedLanguage.code).catch(error => {
        console.warn('Failed to reconnect STT WebSockets after language change:', error);
      });
    }
  }, [selectedLanguage.code]);

  const value: AppContextType = {
    // Connection state
    isConnected,
    setIsConnected,
    connectedSTTCount,
    totalSTTCount,
    isInitialConnection,
    setIsInitialConnection,

    // Language state
    selectedLanguage,
    setSelectedLanguage,
    isDropdownOpen,
    setIsDropdownOpen,

    // One shot mode state
    isOneShotMode,
    setIsOneShotMode,

    // Media popup state
    isPopupOpen,
    setIsPopupOpen,
    selectedMediaType,
    setSelectedMediaType,

    // Translation results
    translationResults,
    setTranslationResults,
    isTranslating,
    setIsTranslating,
    isWaitingForAudioChunks,
    setIsWaitingForAudioChunks,
    inputText,
    setInputText,

    // Selected files
    selectedAudioFile,
    setSelectedAudioFile,
    selectedVideoFile,
    setSelectedVideoFile,

    // Global Language Queues
    hindiQueue,
    englishQueue,
    tamilQueue,
    teluguQueue,
    bengaliQueue,
    marathiQueue,
    gujaratiQueue,
    kannadaQueue,
    malayalamQueue,
    punjabiQueue,
    urduQueue,
    odiaQueue,
    assameseQueue,

    // Global Audio Playback Control
    currentlyPlayingLanguage,
    setCurrentlyPlayingLanguage,
    sharedAudioPosition,
    setSharedAudioPosition,

    // Global Video Playback Control
    currentlyPlayingVideo,
    setCurrentlyPlayingVideo,
    sharedVideoPosition,
    setSharedVideoPosition,

    // Queue Management Functions
    addChunkToQueue,
    getLanguageQueue,
    clearLanguageQueue,
    clearAllQueues,
    restartAudioSession,

    // Helper functions
    handleLanguageSelect,
    selectMediaType,
    toggleConnection,
    translateText,
    processAudioFile,
    processVideoFile,
    
    // One Shot Mode state
    oneShotResults,
    setOneShotResults,
    oneShotProgress,
    setOneShotProgress,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};