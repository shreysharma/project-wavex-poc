'use client';

import { useState, useEffect } from 'react';
import { STTQueueService } from '@/services/sttQueueService';

interface STTData {
  id: string;
  timestamp: number;
  original_text: string;
  translated_text: string;
  latency: number;
  is_final: boolean;
  audio_data?: string;
  confidence?: number;
}

const STTMonitor = () => {
  const [queueData, setQueueData] = useState<{ [languageCode: string]: STTData[] }>({});
  const [queueStats, setQueueStats] = useState<{ [languageCode: string]: number }>({});
  const [currentPlayingLanguage, setCurrentPlayingLanguage] = useState<string | null>(null);
  const [audioQueues, setAudioQueues] = useState<{ [languageCode: string]: STTData[] }>({});
  const [currentlyPlaying, setCurrentlyPlaying] = useState<{ [languageCode: string]: boolean }>({});
  const [currentAudioElements, setCurrentAudioElements] = useState<{ [languageCode: string]: HTMLAudioElement | null }>({});
  const [currentPlayIndex, setCurrentPlayIndex] = useState<{ [languageCode: string]: number }>({});

  const targetLanguages = [
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

  const playNextInQueue = async (languageCode: string) => {
    // Check if this language should still be playing
    if (currentPlayingLanguage !== languageCode) {
      console.log(`[${languageCode.toUpperCase()}] Not active language, stopping queue`);
      return;
    }

    const queue = audioQueues[languageCode] || [];
    const currentIndex = currentPlayIndex[languageCode] || 0;

    if (currentIndex >= queue.length) {
      setCurrentlyPlaying(prev => ({ ...prev, [languageCode]: false }));
      console.log(`[${languageCode.toUpperCase()}] Reached end of audio queue - waiting for new chunks`);
      return;
    }

    const nextChunk = queue[currentIndex];
    if (!nextChunk.audio_data) {
      // Skip chunks without audio, move to next
      setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: currentIndex + 1 }));
      playNextInQueue(languageCode);
      return;
    }

    setCurrentlyPlaying(prev => ({ ...prev, [languageCode]: true }));

    try {
      // Decode and play audio (like index.html) - DON'T remove from queue
      const binaryString = atob(nextChunk.audio_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      // Store audio element for proper cleanup
      setCurrentAudioElements(prev => ({ ...prev, [languageCode]: audio }));

      // Set up event handlers (like index.html)
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl);
        setCurrentAudioElements(prev => ({ ...prev, [languageCode]: null }));
        console.log(`[${languageCode.toUpperCase()}] Finished playing chunk #${currentIndex + 1}: "${nextChunk.translated_text.substring(0, 30)}..."`);

        // Move to next chunk index (KEEP chunks stored)
        setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: currentIndex + 1 }));

        // Only continue if this language is still the active one
        if (currentPlayingLanguage === languageCode) {
          playNextInQueue(languageCode);
        }
      });

      audio.addEventListener('error', (error) => {
        URL.revokeObjectURL(audioUrl);
        setCurrentAudioElements(prev => ({ ...prev, [languageCode]: null }));
        console.error(`[${languageCode.toUpperCase()}] Audio error:`, error);

        // Move to next chunk even on error (KEEP chunks stored)
        setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: currentIndex + 1 }));

        // Only continue if this language is still the active one
        if (currentPlayingLanguage === languageCode) {
          playNextInQueue(languageCode);
        }
      });

      // Play audio
      audio.play().then(() => {
        console.log(`[${languageCode.toUpperCase()}] Playing chunk #${currentIndex + 1}/${queue.length}: "${nextChunk.translated_text.substring(0, 30)}..."`);
      }).catch(error => {
        console.error(`[${languageCode.toUpperCase()}] Playback failed:`, error);
        URL.revokeObjectURL(audioUrl);
        setCurrentAudioElements(prev => ({ ...prev, [languageCode]: null }));

        // Move to next chunk even on error
        setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: currentIndex + 1 }));

        if (currentPlayingLanguage === languageCode) {
          playNextInQueue(languageCode);
        }
      });

    } catch (error) {
      console.error(`[${languageCode.toUpperCase()}] Audio processing failed:`, error);
      setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: currentIndex + 1 }));
      if (currentPlayingLanguage === languageCode) {
        playNextInQueue(languageCode);
      }
    }
  };

  const playQueueAudio = (languageCode: string) => {
    const queue = queueData[languageCode] || [];
    const audioChunks = queue.filter(data => data.audio_data && data.audio_data.length > 0);

    if (audioChunks.length === 0) {
      console.log(`[${languageCode.toUpperCase()}] No audio data available`);
      alert(`No audio data available for ${languageCode}. TTS may be failing on backend.`);
      return;
    }

    // Stop any currently playing language before starting new one
    if (currentPlayingLanguage && currentPlayingLanguage !== languageCode) {
      console.log(`[${currentPlayingLanguage.toUpperCase()}] Stopping to play ${languageCode.toUpperCase()}`);
      stopQueueAudio(currentPlayingLanguage);
    }

    console.log(`[${languageCode.toUpperCase()}] Starting exclusive audio playback`);

    // Set this language as the only playing language
    setCurrentPlayingLanguage(languageCode);

    // Initialize audio queue with existing chunks (STORE them, don't clear)
    setAudioQueues(prev => ({
      ...prev,
      [languageCode]: [...audioChunks]
    }));

    // Reset play index to start from beginning
    setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: 0 }));

    // Start playing the queue from index 0
    playNextInQueue(languageCode);
  };

  const stopQueueAudio = (languageCode: string) => {
    console.log(`[${languageCode.toUpperCase()}] FORCE STOPPING continuous audio playback`);

    // Stop current audio element immediately
    const currentAudio = currentAudioElements[languageCode];
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = '';
      console.log(`[${languageCode.toUpperCase()}] Force stopped HTML audio element`);
    }

    // Clear audio element reference
    setCurrentAudioElements(prev => ({ ...prev, [languageCode]: null }));

    // Disable all playback states for this language
    setCurrentlyPlaying(prev => ({ ...prev, [languageCode]: false }));

    // DON'T clear the audio queue - just reset play index
    setCurrentPlayIndex(prev => ({ ...prev, [languageCode]: 0 }));

    // Clear global playing language if this was the active one
    if (currentPlayingLanguage === languageCode) {
      setCurrentPlayingLanguage(null);
      console.log(`[${languageCode.toUpperCase()}] Cleared as global playing language`);
    }

    console.log(`[${languageCode.toUpperCase()}] FULLY STOPPED - no more audio will play`);
  };

  useEffect(() => {
    const queueService = STTQueueService.getInstance();

    // Set up real-time queue monitoring
    queueService.setEventHandlers({
      onDataReceived: (languageCode: string, data: STTData) => {
        // Update queue data for specific language
        setQueueData(prev => ({
          ...prev,
          [languageCode]: queueService.getQueue(languageCode)
        }));

        // Auto-queue new chunks if this language is currently playing
        if (currentPlayingLanguage === languageCode && data.audio_data) {
          setAudioQueues(prev => ({
            ...prev,
            [languageCode]: [...(prev[languageCode] || []), data]
          }));

          console.log(`[${languageCode.toUpperCase()}] Added new chunk to playing queue - auto-continuing`);

          // If not currently playing a chunk, resume playing
          if (!currentlyPlaying[languageCode]) {
            playNextInQueue(languageCode);
          }
        }
      },
      onQueueUpdated: (languageCode: string, queueLength: number) => {
        // Update queue stats
        setQueueStats(prev => ({
          ...prev,
          [languageCode]: queueLength
        }));
      },
      onFinalTranscript: (languageCode: string, data: STTData) => {
        console.log(`Final transcript for ${languageCode}:`, data.translated_text);
      }
    });

    // Initialize queue data
    const initialData: { [languageCode: string]: STTData[] } = {};
    const initialStats: { [languageCode: string]: number } = {};

    targetLanguages.forEach(lang => {
      initialData[lang.code] = queueService.getQueue(lang.code);
      initialStats[lang.code] = 0;
    });

    setQueueData(initialData);
    setQueueStats(initialStats);

    // Real-time updates every 500ms
    const interval = setInterval(() => {
      const stats = queueService.getQueueStats();
      setQueueStats(stats);

      // Update queue data for all languages
      const updatedData: { [languageCode: string]: STTData[] } = {};
      targetLanguages.forEach(lang => {
        updatedData[lang.code] = queueService.getQueue(lang.code);
      });
      setQueueData(updatedData);
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [currentPlayingLanguage, currentlyPlaying]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const clearLanguageQueue = (languageCode: string) => {
    const queueService = STTQueueService.getInstance();
    queueService.clearQueue(languageCode);
  };

  return (
    <div className="w-full p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">STT Real-time Monitor</h2>
        <div className="flex items-center gap-4">
          {currentPlayingLanguage && (
            <span className="text-sm text-green-600 font-medium">
              🔊 Playing: {targetLanguages.find(l => l.code === currentPlayingLanguage)?.name}
            </span>
          )}
          <button
            onClick={() => {
              const queueService = STTQueueService.getInstance();
              queueService.clearAllQueues();
            }}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
          >
            Clear All Queues
          </button>
        </div>
      </div>

      {/* 13 STT Queue Containers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {targetLanguages.map((lang) => {
          const languageQueue = queueData[lang.code] || [];
          const queueLength = queueStats[lang.code] || 0;
          const isCurrentlyPlaying = currentPlayingLanguage === lang.code;

          return (
            <div
              key={lang.code}
              className={`
                bg-white border rounded-lg p-4 flex flex-col h-80 transition-all duration-200
                ${isCurrentlyPlaying ? 'border-green-400 shadow-lg' : 'border-gray-200'}
              `}
            >
              {/* Queue Header */}
              <div className="flex justify-between items-center mb-3 pb-2 border-b">
                <div>
                  <h3 className="font-medium text-gray-800">{lang.name}</h3>
                  <p className="text-xs text-gray-500">{lang.nativeName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`
                    px-2 py-1 rounded text-xs font-medium
                    ${queueLength > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                  `}>
                    {queueLength} items
                  </span>

                  {/* Play/Stop Audio Button - Only show if queue has audio data */}
                  {(() => {
                    const queue = queueData[lang.code] || [];
                    const hasAudio = queue.some(item => item.audio_data && item.audio_data.length > 0);

                    if (!hasAudio) {
                      return (
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center bg-gray-200 text-gray-400"
                          title={`No audio data available for ${lang.name} (TTS may be failing)`}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      );
                    }

                    return (
                      <button
                        onClick={() =>
                          currentPlayingLanguage === lang.code
                            ? stopQueueAudio(lang.code)
                            : playQueueAudio(lang.code)
                        }
                        className={`
                          w-6 h-6 rounded flex items-center justify-center transition-colors
                          ${currentPlayingLanguage === lang.code
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-[#3840EB] hover:bg-blue-600 text-white'
                          }
                        `}
                        title={`${currentPlayingLanguage === lang.code ? 'Stop' : 'Play'} ${lang.name} audio queue`}
                      >
                        {currentPlayingLanguage === lang.code ? (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                            <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
                          </svg>
                        ) : (
                          <svg width="8" height="8" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.916 3.328C2.916 2.761 2.916 2.478 3.034 2.322C3.137 2.186 3.294 2.102 3.465 2.091C3.66 2.08 3.896 2.237 4.367 2.551L10.501 6.64C10.891 6.9 11.085 7.03 11.153 7.194C11.213 7.337 11.213 7.497 11.153 7.64C11.085 7.804 10.891 7.934 10.501 8.194L4.367 12.283C3.896 12.597 3.66 12.754 3.465 12.743C3.294 12.733 3.137 12.648 3.034 12.512C2.916 12.356 2.916 12.073 2.916 11.507V3.328Z" fill="currentColor"/>
                          </svg>
                        )}
                      </button>
                    );
                  })()}

                  <button
                    onClick={() => clearLanguageQueue(lang.code)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title={`Clear ${lang.name} queue`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Real-time STT Data Stream */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {languageQueue.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-8">
                    <p>No STT data yet</p>
                    <p className="text-xs mt-1">Waiting for real-time transcriptions...</p>
                  </div>
                ) : (
                  languageQueue.slice(-10).reverse().map((data, index) => (
                    <div
                      key={data.id}
                      className={`
                        p-2 rounded text-xs border-l-2 transition-all duration-200
                        ${data.is_final
                          ? 'bg-blue-50 border-blue-400'
                          : 'bg-gray-50 border-gray-300'
                        }
                      `}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-1">
                          <span className={`
                            text-xs font-medium
                            ${data.is_final ? 'text-blue-600' : 'text-gray-600'}
                          `}>
                            {data.is_final ? 'FINAL' : 'PARTIAL'}
                          </span>
                          {/* Audio indicator */}
                          {data.audio_data ? (
                            <span className="text-xs bg-green-100 text-green-600 px-1 rounded" title="Has TTS audio">
                              🔊
                            </span>
                          ) : (
                            <span className="text-xs bg-red-100 text-red-600 px-1 rounded" title="No TTS audio (backend TTS failed)">
                              🔇
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatTime(data.timestamp)}
                        </span>
                      </div>

                      {/* Original Text */}
                      {data.original_text && (
                        <div className="mb-1">
                          <p className="text-xs text-gray-500">Original:</p>
                          <p className="text-xs text-gray-700 truncate" title={data.original_text}>
                            {data.original_text}
                          </p>
                        </div>
                      )}

                      {/* Translated Text */}
                      <div>
                        <p className="text-xs text-gray-500">Translation:</p>
                        <p className="text-xs text-gray-800 font-medium" title={data.translated_text}>
                          {data.translated_text || '[No translation]'}
                        </p>
                      </div>

                      {/* Latency & Confidence */}
                      <div className="flex justify-between mt-1 text-xs text-gray-400">
                        {data.latency > 0 && <span>{data.latency.toFixed(0)}ms</span>}
                        {data.confidence && <span>{(data.confidence * 100).toFixed(0)}%</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default STTMonitor;