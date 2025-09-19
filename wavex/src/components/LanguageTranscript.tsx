import React from 'react'

interface TranslationData {
  language: {
    code: string;
    name: string;
    nativeName: string;
  };
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

interface LanguageTranscriptProps {
  data?: TranslationData;
  isLoading?: boolean;
  queue?: LanguageQueue;
  isGloballyPlaying?: boolean;
  sharedAudioPosition?: number;
  onTogglePlay?: (currentPosition?: number) => void;
}

const LanguageTranscript: React.FC<LanguageTranscriptProps> = ({
  data,
  isLoading = false,
  queue,
  isGloballyPlaying = false,
  onTogglePlay
}) => {
    // Use queue data if available, otherwise use legacy data prop
    const displayName = queue?.languageName || data?.language.name || 'Language';
    const nativeName = queue?.nativeName || data?.language.nativeName || '';
    const queueChunks = queue?.chunks || [];
    const hasAudio = queueChunks.some(chunk => chunk.audio_data && chunk.audio_data.length > 0);

    // For legacy data prop usage
    const displayText = data?.translated_text || 'No translation available yet. Click translate to see results.';
    const latency = data?.latency || 0;

    const handlePlayToggle = () => {
        if (!queue || !onTogglePlay) return;

        const audioChunks = queueChunks.filter(chunk => chunk.audio_data && chunk.audio_data.length > 0);

        if (audioChunks.length === 0) {
            alert(`No audio data available for ${displayName}. TTS may be failing.`);
            return;
        }

        console.log(`[${queue.languageCode.toUpperCase()}] Toggle play clicked`);
        onTogglePlay();
    };

    return (
        <div className={`
          w-full border rounded-[12px] p-5 flex flex-col transition-all duration-200
          ${isGloballyPlaying
            ? 'border-green-400 shadow-lg bg-green-50'
            : 'border-[#D9D9D9] hover:border-[#3840EB] bg-white'
          }
        `}>
            {/* Header with Play/Stop Button */}
            <div className="text-[#3840EB] text-[18px] mb-2 flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span>{displayName}</span>
                    {nativeName && <span className="text-sm text-gray-500">({nativeName})</span>}
                    {isLoading && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#3840EB]"></div>
                    )}
                </div>

                {/* Play/Stop Button for Queue Mode */}
                {queue && onTogglePlay && (
                    <div className="flex items-center gap-2">
                        <span className={`
                          px-2 py-1 rounded text-xs font-medium
                          ${queueChunks.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                        `}>
                          {queueChunks.length} chunks
                        </span>

                        {hasAudio ? (
                          <button
                            onClick={handlePlayToggle}
                            className={`
                              w-8 h-8 rounded flex items-center justify-center transition-colors
                              ${isGloballyPlaying
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-[#3840EB] hover:bg-blue-600 text-white'
                              }
                            `}
                            title={`${isGloballyPlaying ? 'Stop' : 'Play'} ${displayName} audio queue`}
                          >
                            {isGloballyPlaying ? (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                                <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
                              </svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.916 3.328C2.916 2.761 2.916 2.478 3.034 2.322C3.137 2.186 3.294 2.102 3.465 2.091C3.66 2.08 3.896 2.237 4.367 2.551L10.501 6.64C10.891 6.9 11.085 7.03 11.153 7.194C11.213 7.337 11.213 7.497 11.153 7.64C11.085 7.804 10.891 7.934 10.501 8.194L4.367 12.283C3.896 12.597 3.66 12.754 3.465 12.743C3.294 12.733 3.137 12.648 3.034 12.512C2.916 12.356 2.916 12.073 2.916 11.507V3.328Z" fill="currentColor"/>
                              </svg>
                            )}
                          </button>
                        ) : (
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center bg-gray-200 text-gray-400"
                            title={`No audio data available for ${displayName}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                    </div>
                )}
            </div>

            <div className='flex flex-col gap-3 flex-1 overflow-y-auto min-h-0'>
                {/* Queue Mode: Show real-time chunks */}
                {queue ? (
                    queueChunks.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-8">
                            <p>No STT data yet</p>
                            <p className="text-xs mt-1">Waiting for real-time transcriptions...</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {queueChunks.slice().reverse().map((chunk) => (
                                <div
                                    key={chunk.id}
                                    className={`
                                      p-2 rounded text-sm border-l-2 transition-all duration-200
                                      ${chunk.is_final
                                        ? 'bg-blue-50 border-blue-400'
                                        : 'bg-gray-50 border-gray-300'
                                      }
                                    `}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-1">
                                            <span className={`
                                              text-xs font-medium
                                              ${chunk.is_final ? 'text-blue-600' : 'text-gray-600'}
                                            `}>
                                              {chunk.is_final ? 'FINAL' : 'PARTIAL'}
                                            </span>
                                            {chunk.audio_data ? (
                                                <span className="text-xs bg-green-100 text-green-600 px-1 rounded" title="Has TTS audio">
                                                  🔊
                                                </span>
                                            ) : (
                                                <span className="text-xs bg-red-100 text-red-600 px-1 rounded" title="No TTS audio">
                                                  🔇
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {new Date(chunk.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>

                                    <p className='text-[#121212] leading-relaxed'>
                                        {chunk.translated_text}
                                    </p>

                                    {chunk.latency > 0 && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            {chunk.latency.toFixed(0)}ms
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    /* Legacy Mode: Single translation result */
                    <p className='text-[#121212] leading-relaxed'>
                        {isLoading ? 'Translating...' : displayText}
                    </p>
                )}
            </div>

            {/* Legacy latency display */}
            {data?.language.code !== 'original' && !queue && (
                <div className="text-sm text-gray-500 mt-2 flex-shrink-0">
                    {latency > 0 ? `[Trans: ${latency.toFixed(2)}ms]` : '[Waiting for translation...]'}
                </div>
            )}
        </div>
    )
}

export default LanguageTranscript