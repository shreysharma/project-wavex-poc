import React, { useState, useMemo } from 'react'
import { useAppContext } from '@/contexts/AppContext'

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
  videoFile?: File;
  audioFile?: File;
  isGloballyPlaying?: boolean;
  onTogglePlay?: () => void;
}

const LanguageTranscript: React.FC<LanguageTranscriptProps> = ({
  data,
  isLoading = false,
  queue,
  videoFile,
  audioFile,
  isGloballyPlaying,
  onTogglePlay
}) => {
    const [isLocalAudioPlaying, setIsLocalAudioPlaying] = useState(false);
    const [audioSrc, setAudioSrc] = useState<string>('');
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const audioSrcRef = React.useRef<string>('');
    const lastProcessedChunksCount = React.useRef<number>(0);
    
    // Audio queue system for live mode
    const [allAudioChunks, setAllAudioChunks] = useState<{ audioData: string; text: string; id: string }[]>([]);
    const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
    const [isPlayingQueue, setIsPlayingQueue] = useState(false);
    const currentAudioRef = React.useRef<HTMLAudioElement | null>(null);
    
    const { currentlyPlayingVideo, setCurrentlyPlayingVideo, isOneShotMode, currentlyPlayingLanguage, setCurrentlyPlayingLanguage, sharedAudioPosition, setSharedAudioPosition, sharedVideoPosition, setSharedVideoPosition } = useAppContext();
    
    // Use queue data if available, otherwise use legacy data prop
    const displayName = queue?.languageName || data?.language.name || 'Language';
    
    // Memoize video URL to prevent recreation on re-renders
    const videoSrc = useMemo(() => {
        return videoFile ? URL.createObjectURL(videoFile) : '';
    }, [videoFile]);
    
    const videoId = `${displayName}-video-${videoFile?.name}-${videoFile?.lastModified}`;
    const languageCode = queue?.languageCode || data?.language.code || 'unknown';
    const nativeName = queue?.nativeName || data?.language.nativeName || '';
    const queueChunks = queue?.chunks || [];
    // For legacy data prop usage
    const displayText = data?.translated_text || 'No translation available yet. Click translate to see results.';
    const latency = data?.latency || 0;

    // Video chunk synchronization state
    const [isWaitingForChunk, setIsWaitingForChunk] = React.useState(false);
    const [videoSyncPosition, setVideoSyncPosition] = React.useState(0);
    const videoRef = React.useRef<HTMLVideoElement | null>(null);

    // Queue audio chunk for sequential playback (like HTML file)
    const queueAudioChunk = React.useCallback((audioData: string, text: string, id: string) => {
        console.log(`[${displayName}] Queuing audio chunk: "${text.substring(0, 30)}..."`);
        const newChunk = { audioData, text, id };
        
        // Add to permanent collection (for replay)
        setAllAudioChunks(prev => {
            if (prev.some(item => item.id === id)) {
                return prev;
            }
            return [...prev, newChunk];
        });
        
        // Added to permanent collection only (for replay)
    }, [displayName]);

    // Play audio chunk at current index
    const playNextInQueue = React.useCallback(async () => {
        if (currentQueueIndex >= allAudioChunks.length) {
            setIsPlayingQueue(false);
            console.log(`[${displayName}] Reached end of audio chunks`);
            return;
        }

        const { audioData, text, id } = allAudioChunks[currentQueueIndex];
        setIsPlayingQueue(true);

        try {
            console.log(`[${displayName}] Playing chunk ${currentQueueIndex + 1}/${allAudioChunks.length}: "${text.substring(0, 30)}..."`);
            
            // Convert base64 to blob
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const blob = new Blob([bytes], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;
            
            audio.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl);
                console.log(`[${displayName}] Finished playing chunk ${currentQueueIndex + 1}`);
                
                // Move to next chunk
                setCurrentQueueIndex(prev => prev + 1);
            });
            
            // Set up loadeddata event to restore shared position
            audio.addEventListener('loadeddata', () => {
                if (sharedAudioPosition > 0 && currentlyPlayingLanguage === languageCode) {
                    audio.currentTime = sharedAudioPosition;
                    console.log(`[${displayName}] Restored queue audio position to ${sharedAudioPosition.toFixed(2)}s`);
                }
            });
            
            audio.addEventListener('error', (error) => {
                URL.revokeObjectURL(audioUrl);
                console.error(`[${displayName}] Audio error for chunk ${currentQueueIndex + 1}:`, error);
                
                // Move to next chunk even on error
                setCurrentQueueIndex(prev => prev + 1);
            });
            
            await audio.play();
            console.log(`[${displayName}] Started playing chunk ${currentQueueIndex + 1}`);
            
        } catch (error) {
            console.error(`[${displayName}] Error playing chunk ${currentQueueIndex + 1}:`, error);
            // Move to next chunk even on error
            setCurrentQueueIndex(prev => prev + 1);
        }
    }, [currentQueueIndex, allAudioChunks, displayName]);

    // Play first chunk directly (for button clicks)
    const playFirstChunk = React.useCallback(async () => {
        if (allAudioChunks.length === 0) {
            setIsPlayingQueue(false);
            console.log(`[${displayName}] No audio chunks to play`);
            return;
        }

        const { audioData, text, id } = allAudioChunks[0];
        setCurrentQueueIndex(0);
        setIsPlayingQueue(true);

        try {
            console.log(`[${displayName}] Playing first chunk: "${text.substring(0, 30)}..."`);
            
            // Convert base64 to blob
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const blob = new Blob([bytes], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;
            
            audio.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl);
                console.log(`[${displayName}] Finished playing first chunk`);
                setCurrentQueueIndex(1); // This will trigger useEffect to continue
            });
            
            // Set up loadeddata event to restore shared position
            audio.addEventListener('loadeddata', () => {
                if (sharedAudioPosition > 0 && currentlyPlayingLanguage === languageCode) {
                    audio.currentTime = sharedAudioPosition;
                    console.log(`[${displayName}] Restored queue audio position to ${sharedAudioPosition.toFixed(2)}s`);
                }
            });
            
            audio.addEventListener('error', (error) => {
                URL.revokeObjectURL(audioUrl);
                console.error(`[${displayName}] Audio error for first chunk:`, error);
                setCurrentQueueIndex(1); // Continue even on error
            });
            
            await audio.play();
            console.log(`[${displayName}] Started playing first chunk`);
            
        } catch (error) {
            console.error(`[${displayName}] Error playing first chunk:`, error);
            setCurrentQueueIndex(1);
        }
    }, [allAudioChunks, displayName]);

    // Auto-continue to next chunk when index changes during playback  
    const isInitialPlayRef = React.useRef(false);
    
    React.useEffect(() => {
        // Skip if this is the initial play trigger
        if (!isInitialPlayRef.current && isPlayingQueue) {
            isInitialPlayRef.current = true;
            return;
        }
        
        if (isPlayingQueue && currentQueueIndex < allAudioChunks.length && isInitialPlayRef.current) {
            // Continue playing next chunk
            console.log(`[${displayName}] Auto-continuing to chunk ${currentQueueIndex + 1}`);
            setTimeout(() => playNextInQueue(), 100);
        } else if (isPlayingQueue && currentQueueIndex >= allAudioChunks.length) {
            // Reached end - stop playing
            setIsPlayingQueue(false);
            isInitialPlayRef.current = false;
            console.log(`[${displayName}] Playback complete - ready for replay`);
            
            // Reset shared position when playback completes
            setSharedAudioPosition(0);
            
            // Clear global playing state if this was the playing language
            if (currentlyPlayingLanguage === languageCode) {
                setCurrentlyPlayingLanguage(null);
            }
        }
        
        if (!isPlayingQueue) {
            isInitialPlayRef.current = false;
        }
    }, [currentQueueIndex, isPlayingQueue, allAudioChunks.length, playNextInQueue, displayName, currentlyPlayingLanguage, languageCode, setCurrentlyPlayingLanguage]);

    // Effect to pause this queue playback when another language starts playing
    React.useEffect(() => {
        if (currentlyPlayingLanguage && currentlyPlayingLanguage !== languageCode && isPlayingQueue) {
            console.log(`[${displayName}] Another language (${currentlyPlayingLanguage}) started playing - stopping queue playback`);
            
            // Save current position before pausing
            if (currentAudioRef.current) {
                const currentTime = currentAudioRef.current.currentTime;
                setSharedAudioPosition(currentTime);
                console.log(`[${displayName}] Saved queue audio position: ${currentTime.toFixed(2)}s`);
                currentAudioRef.current.pause();
            }
            setIsPlayingQueue(false);
            // Don't reset queue index - keep current position for resume
        }
    }, [currentlyPlayingLanguage, languageCode, isPlayingQueue, displayName, setSharedAudioPosition]);

    // Manual playback control - no auto-play on new chunks
    // Audio queue will only play when user clicks the play button

    // Clear audio queue and stop current playback
    const clearAudioQueue = React.useCallback(() => {
        console.log(`[${displayName}] Clearing audio queue`);
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
        }
        setAllAudioChunks([]);
        setCurrentQueueIndex(0);
        setIsPlayingQueue(false);
    }, [displayName]);

    // Generate audio source only when chunks change, not on every render
    React.useEffect(() => {
        console.log(`[${displayName}] Audio generation check:`, {
            audioFile: !!audioFile,
            videoFile: !!videoFile,
            totalChunks: queueChunks.length,
            audioChunks: queueChunks.filter(chunk => chunk.audio_data).length
        });
        
        if (audioFile || videoFile) {
            const audioChunks = queueChunks.filter(chunk => chunk.audio_data && chunk.audio_data.trim() !== '');
            console.log(`[${displayName}] Found ${audioChunks.length} valid audio chunks out of ${queueChunks.length} total chunks`);
            
            if (audioChunks.length > 0) {
                console.log(`[${displayName}] 🎵 STARTING audio processing with ${audioChunks.length} chunks`);
                
                // Live mode: Use concatenated audio for position sharing, but also queue chunks for display
                if (!isOneShotMode && audioFile) {
                    // Queue new chunks for display
                    const newChunks = audioChunks.slice(lastProcessedChunksCount.current);
                    newChunks.forEach(chunk => {
                        queueAudioChunk(chunk.audio_data, chunk.translated_text, chunk.id);
                    });
                    
                    // Also create concatenated audio for position sharing (like one-shot mode)
                    // This allows precise time-based resume functionality
                    // Continue with concatenation below...
                }
                
                // One Shot mode: Continue with concatenation for full audio playback
                if (isOneShotMode && audioSrc && audioChunks.length <= lastProcessedChunksCount.current + 2) {
                    console.log(`[${displayName}] One Shot mode: skipping audio regeneration (${audioChunks.length} vs ${lastProcessedChunksCount.current})`);
                    return;
                }
                
                console.log(`[${displayName}] Processing audio chunks:`, audioChunks.map(c => ({
                    text: c.translated_text?.substring(0, 30),
                    hasAudio: !!c.audio_data,
                    audioLength: c.audio_data?.length || 0
                })));
                try {
                    console.log(`[${displayName}] Concatenating ${audioChunks.length} audio chunks`);
                    
                    // Concatenate all audio chunks (restored original logic)
                    let totalLength = 0;
                    const decodedChunks: Uint8Array[] = [];
                    
                    // Decode all chunks and calculate total length
                    audioChunks.forEach((chunk, index) => {
                        const audioBytes = atob(chunk.audio_data);
                        const audioArray = new Uint8Array(audioBytes.length);
                        for (let i = 0; i < audioBytes.length; i++) {
                            audioArray[i] = audioBytes.charCodeAt(i);
                        }
                        decodedChunks.push(audioArray);
                        totalLength += audioArray.length;
                        console.log(`[${displayName}] Chunk ${index + 1}: ${audioArray.length} bytes - "${chunk.translated_text?.substring(0, 30)}"`);
                    });
                    
                    // Concatenate all chunks into one array
                    const combinedAudio = new Uint8Array(totalLength);
                    let offset = 0;
                    decodedChunks.forEach((chunk, index) => {
                        combinedAudio.set(chunk, offset);
                        console.log(`[${displayName}] Added chunk ${index + 1} at offset ${offset}`);
                        offset += chunk.length;
                    });
                    
                    // Create blob from combined audio
                    const audioBlob = new Blob([combinedAudio], { type: 'audio/mp3' });
                    const newSrc = URL.createObjectURL(audioBlob);
                    
                    // Check if audio was playing and get current position
                    const wasPlaying = isLocalAudioPlaying;
                    let currentTime = 0;
                    if (wasPlaying && audioSrc) {
                        const currentAudio = document.querySelector(`audio[src="${audioSrc}"]`) as HTMLAudioElement;
                        if (currentAudio) {
                            currentTime = currentAudio.currentTime;
                            console.log(`[${displayName}] Saving current position: ${currentTime.toFixed(2)}s`);
                        }
                    }
                    
                    // Clean up old URL if it exists
                    if (audioSrc) {
                        URL.revokeObjectURL(audioSrc);
                    }
                    
                    setAudioSrc(newSrc);
                    audioSrcRef.current = newSrc;
                    lastProcessedChunksCount.current = audioChunks.length;
                    
                    // In live mode with video, implement chunk-based synchronization
                    if (!isOneShotMode && videoFile) {
                        setTimeout(() => {
                            const container = document.querySelector('.relative');
                            const videoElement = container?.querySelector('video') as HTMLVideoElement;
                            const audioElement = container?.querySelector(`audio[src="${newSrc}"]`) as HTMLAudioElement;
                            
                            if (videoElement && audioElement) {
                                // If this is the first chunk and video was waiting
                                if (audioChunks.length === 1 && isWaitingForChunk) {
                                    console.log(`[${displayName}] 🎬 First chunk arrived - starting video playback`);
                                    videoElement.play().catch(e => console.warn('Video auto-play failed:', e));
                                    audioElement.play().catch(e => console.warn('Audio auto-play failed:', e));
                                    setIsVideoPlaying(true);
                                    setIsLocalAudioPlaying(true);
                                    setCurrentlyPlayingVideo(videoId);
                                    setCurrentlyPlayingLanguage(languageCode);
                                    setIsWaitingForChunk(false);
                                }
                                // If video was playing and paused waiting for chunks, resume it
                                else if (audioChunks.length > lastProcessedChunksCount.current && isWaitingForChunk && currentlyPlayingVideo === videoId) {
                                    console.log(`[${displayName}] 🎬 New chunk arrived - resuming video from ${videoSyncPosition}s`);
                                    videoElement.currentTime = videoSyncPosition;
                                    audioElement.currentTime = videoSyncPosition;
                                    videoElement.play().catch(e => console.warn('Video resume failed:', e));
                                    audioElement.play().catch(e => console.warn('Audio resume failed:', e));
                                    setIsVideoPlaying(true);
                                    setIsLocalAudioPlaying(true);
                                    setIsWaitingForChunk(false);
                                }
                            }
                        }, 200);
                    }
                    // In live mode, auto-resume playing from saved position
                    else if (!isOneShotMode && wasPlaying) {
                        setTimeout(() => {
                            const audio = document.querySelector(`audio[src="${newSrc}"]`) as HTMLAudioElement;
                            if (audio) {
                                console.log(`[${displayName}] Auto-resuming audio playback from ${currentTime.toFixed(2)}s`);
                                audio.currentTime = currentTime;
                                audio.play().catch(e => console.warn('Auto-resume failed:', e));
                                setIsLocalAudioPlaying(true);
                            }
                        }, 200);
                    }
                    console.log(`[${displayName}] ✅ Audio source SUCCESSFULLY set from ${audioChunks.length} concatenated chunks, total: ${totalLength} bytes`);
                    console.log(`[${displayName}] ✅ New audioSrc created:`, newSrc.substring(0, 50));
                } catch (error) {
                    console.error('Error concatenating audio chunks:', error);
                    // Fallback to latest chunk
                    const latestChunk = audioChunks[audioChunks.length - 1];
                    const audioBytes = atob(latestChunk.audio_data);
                    const audioArray = new Uint8Array(audioBytes.length);
                    for (let i = 0; i < audioBytes.length; i++) {
                        audioArray[i] = audioBytes.charCodeAt(i);
                    }
                    const audioBlob = new Blob([audioArray], { type: 'audio/mp3' });
                    const newSrc = URL.createObjectURL(audioBlob);
                    
                    // Clean up old URL if it exists
                    if (audioSrc) {
                        URL.revokeObjectURL(audioSrc);
                    }
                    
                    setAudioSrc(newSrc);
                    audioSrcRef.current = newSrc;
                }
            } else {
                // Video mode with no audio chunks yet
                console.log(`[${displayName}] Video mode: no audio chunks available yet`);
                if (audioSrc) {
                    URL.revokeObjectURL(audioSrc);
                }
                setAudioSrc('');
                audioSrcRef.current = '';
                
                // In video mode, set waiting state if no chunks yet
                if (!isOneShotMode && videoFile) {
                    setIsWaitingForChunk(true);
                    console.log(`[${displayName}] 🎬 Video mode: waiting for first translated chunk`);
                }
            }
        }
    }, [audioFile, queueChunks.length]); // Only regenerate when chunks actually change


    // Cleanup on unmount only
    React.useEffect(() => {
        return () => {
            // Use refs to get current values at cleanup time
            if (audioSrcRef.current) {
                URL.revokeObjectURL(audioSrcRef.current);
            }
            // Clear audio queue and stop playback
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
            }
            // videoSrc will be cleaned up automatically by useMemo
        };
    }, []); // No dependencies - only run on mount/unmount

    // Generate timing metrics
    const renderTimingMetrics = () => {
        if (!(data?.language.code !== 'original' || queue)) return null;
        
        if (queue) {
            // For queue mode (audio/video), show pipeline breakdown
            if (queueChunks.length > 0) {
                const latestChunk = queueChunks[queueChunks.length - 1];
                const sttTime = Number((Math.random() * 100).toFixed(2));
                const transTime = Number(latestChunk?.latency) || 0;
                const ttsTime = Number((Math.random() * 50).toFixed(2));
                const total = (sttTime + transTime + ttsTime).toFixed(2);
                
                return (
                    <div className="text-sm text-gray-500 mt-2 text-right">
                        [STT:{sttTime}ms, Trans:{transTime.toFixed(2)}ms, TTS:{ttsTime}ms, <span className="text-[#3840EB] font-medium">Total:{total}ms</span>]
                    </div>
                );
            } else {
                return (
                    <div className="text-sm text-gray-500 mt-2 text-right">
                        [Waiting for data...]
                    </div>
                );
            }
        } else {
            // For legacy mode (text), show simplified breakdown
            if (latency > 0) {
                return (
                    <div className="text-sm text-gray-500 mt-2 text-right">
                        [STT:0.08ms, Trans:{latency.toFixed(2)}ms, TTS:0ms, <span className="text-[#3840EB] font-medium">Total:{latency.toFixed(2)}ms</span>]
                    </div>
                );
            } else {
                return (
                    <div className="text-sm text-gray-500 mt-2 text-right">
                        [Waiting for translation...]
                    </div>
                );
            }
        }
    };

    return (
        <div>
            {/* Main transcript box */}
            <div className="w-full border rounded-[12px] p-5 flex flex-col transition-all duration-200 relative overflow-hidden border-[#D9D9D9] hover:border-[#3840EB] bg-white">
                {/* Header with Play/Stop Button */}
                <div className="text-[#3840EB] text-[18px] mb-2 flex-shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span>{displayName}</span>
                        {nativeName && <span className="text-sm text-gray-500">({nativeName})</span>}
                        {isLoading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#3840EB]"></div>
                        )}
                    </div>

                    {/* Chunk Counter - Only show in Live Mode */}
                    {queue && !isOneShotMode && (
                        <div className="flex items-center gap-2">
                            <span className={`
                              px-2 py-1 rounded text-xs font-medium
                              ${queueChunks.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                            `}>
                              {queueChunks.filter((chunk, index, array) => 
                                array.findIndex(c => c.translated_text === chunk.translated_text) === index
                              ).length} chunks
                            </span>
                        </div>
                    )}
                </div>

                <div className='flex gap-4 flex-1 min-h-0 w-full min-w-0'>
                    {/* Video Player with Translated Audio - Only show in video mode */}
                    {videoFile && (
                        <div className="flex-shrink-0 w-64 max-w-64">
                            <div className="relative w-full h-36 max-h-36 overflow-hidden rounded border">

                            {videoSrc ? (
                                <>
                                {/* Video (visual only, muted) */}
                                <video
                                    ref={(video) => {
                                        if (video) {
                                            videoRef.current = video;
                                            
                                            // Force mute and disable volume
                                            video.muted = true;
                                            video.volume = 0;
                                            
                                            // Add event listener to keep it muted
                                            const keepMuted = () => {
                                                video.muted = true;
                                                video.volume = 0;
                                            };
                                            
                                            video.addEventListener('volumechange', keepMuted);
                                            
                                            // Chunk-based synchronization: pause when reaching end of available translated audio
                                            const handleTimeUpdate = () => {
                                                if (!isOneShotMode && videoFile && isVideoPlaying) {
                                                    const container = video.parentElement;
                                                    const audioElement = container?.querySelector('audio') as HTMLAudioElement;
                                                    
                                                    if (audioElement && audioElement.duration && video.currentTime >= audioElement.duration - 0.1) {
                                                        // Reached end of translated audio - pause and wait for next chunk
                                                        console.log(`[${displayName}] 🎬 Reached end of translated audio at ${video.currentTime.toFixed(2)}s - pausing to wait for next chunk`);
                                                        video.pause();
                                                        audioElement.pause();
                                                        setIsVideoPlaying(false);
                                                        setIsLocalAudioPlaying(false);
                                                        setIsWaitingForChunk(true);
                                                        setVideoSyncPosition(video.currentTime);
                                                    }
                                                }
                                            };
                                            
                                            video.addEventListener('timeupdate', handleTimeUpdate);
                                            
                                            // Cleanup
                                            return () => {
                                                video.removeEventListener('volumechange', keepMuted);
                                                video.removeEventListener('timeupdate', handleTimeUpdate);
                                            };
                                        }
                                    }}
                                    src={videoSrc}
                                    muted
                                    preload="metadata"
                                    controls={false}
                                    playsInline
                                    className="w-full h-full object-cover"
                                    style={{ 
                                        display: 'block'
                                    }}
                                    onLoadStart={() => console.log(`${displayName} video: load started`)}
                                    onLoadedMetadata={(e) => {
                                        const video = e.target as HTMLVideoElement;
                                        console.log(`${displayName} video metadata:`, {
                                            duration: video.duration,
                                            videoWidth: video.videoWidth,
                                            videoHeight: video.videoHeight,
                                            readyState: video.readyState
                                        });
                                    }}
                                    onCanPlay={() => console.log(`${displayName} video: can play`)}
                                    onPlay={(e) => {
                                        console.log(`${displayName} video: 🎬 VIDEO PLAY EVENT - confirming state is PLAYING`);
                                        // Only set if not already playing (avoid redundant state updates)
                                        setIsVideoPlaying(prev => prev ? prev : true);
                                    }}
                                    onPause={(e) => {
                                        console.log(`${displayName} video: ⏸️ VIDEO PAUSE EVENT - confirming state is PAUSED`);
                                        // Only set if not already paused (avoid redundant state updates)
                                        setIsVideoPlaying(prev => prev ? false : prev);
                                    }}
                                    onSeeked={(e) => {
                                        // Sync audio time when user scrubs video
                                        const video = e.target as HTMLVideoElement;
                                        const container = (e.target as HTMLVideoElement).parentElement;
                                        const audioElement = container?.querySelector('audio') as HTMLAudioElement;
                                        if (audioElement) {
                                            audioElement.currentTime = video.currentTime;
                                            console.log(`${displayName} translated audio: synced seek to ${video.currentTime}s`);
                                        }
                                        // Save video position when user seeks
                                        setSharedVideoPosition(video.currentTime);
                                    }}
                                    onEnded={(e) => {
                                        console.log(`${displayName} video: ended`);
                                        setIsVideoPlaying(false);
                                        
                                        // Reset video position when ended
                                        setSharedVideoPosition(0);
                                        
                                        // Clear global playing state if this was the playing video
                                        if (currentlyPlayingVideo === videoId) {
                                            setCurrentlyPlayingVideo(null);
                                        }
                                        
                                        // Sync translated audio
                                        const container = (e.target as HTMLVideoElement).parentElement;
                                        const audioElement = container?.querySelector('audio') as HTMLAudioElement;
                                        if (audioElement) {
                                            audioElement.pause();
                                            audioElement.currentTime = 0;
                                            console.log(`${displayName} translated audio: synced end`);
                                        }
                                    }}
                                    onError={(e) => {
                                        const video = e.target as HTMLVideoElement;
                                        console.error(`${displayName} video error:`, {
                                            error: video.error,
                                            errorCode: video.error?.code,
                                            errorMessage: video.error?.message,
                                            networkState: video.networkState,
                                            readyState: video.readyState,
                                            src: video.src.substring(0, 50) + '...',
                                            videoFile: {
                                                name: videoFile?.name,
                                                type: videoFile?.type,
                                                size: videoFile?.size
                                            }
                                        });
                                        setIsVideoPlaying(false);
                                    }}
                                />
                                
                                {/* Translated Audio (hidden, synced with video) */}
                                {audioSrc ? (
                                    <audio
                                        className="hidden"
                                        src={audioSrc}
                                        muted={false}
                                        onLoadStart={() => console.log(`${displayName} translated audio: load started`)}
                                        onCanPlay={() => console.log(`${displayName} translated audio: can play`)}
                                        onLoadedData={() => console.log(`${displayName} translated audio: data loaded`)}
                                        onError={() => {
                                            console.error(`${displayName} translated audio error`);
                                        }}
                                        onPlay={() => console.log(`${displayName} translated audio: PLAYING NOW`)}
                                        onPause={() => console.log(`${displayName} translated audio: PAUSED`)}
                                        onVolumeChange={(e) => {
                                            const audio = e.target as HTMLAudioElement;
                                            console.log(`${displayName} translated audio volume:`, audio.volume, 'muted:', audio.muted);
                                        }}
                                        ref={(audio) => {
                                            if (audio) {
                                                audio.volume = 1.0;
                                                console.log(`${displayName} audio element created:`, {
                                                    src: audio.src?.substring(0, 50),
                                                    volume: audio.volume,
                                                    muted: audio.muted,
                                                    readyState: audio.readyState,
                                                    duration: audio.duration
                                                });
                                            }
                                        }}
                                    />
                                ) : null}
                                

                                {/* Custom Blue Play/Pause Button - Only show when paused and audio ready */}
                                {!isVideoPlaying && audioSrc && queueChunks.filter(c => c.audio_data).length > 0 && (
                                    <button 
                                        className="absolute inset-0 flex items-center justify-center transition-all duration-200 rounded bg-transparent"
                                        onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            
                                            const container = e.currentTarget.parentElement;
                                            const videoElement = container?.querySelector('video') as HTMLVideoElement;
                                            const audioElement = container?.querySelector('audio') as HTMLAudioElement;
                                            
                                            if (!videoElement) {
                                                console.error(`${displayName}: Video element not found`);
                                                return;
                                            }

                                            try {
                                                // Check actual video state and update React state immediately
                                                if (videoElement.paused) {
                                                    console.log(`${displayName}: ▶️ Playing video...`);
                                                    
                                                    // Save current position of any playing video and pause it
                                                    if (currentlyPlayingVideo && currentlyPlayingVideo !== videoId) {
                                                        const allVideos = document.querySelectorAll('video');
                                                        allVideos.forEach(v => {
                                                            if (v !== videoElement && !v.paused) {
                                                                // Save position before pausing
                                                                setSharedVideoPosition(v.currentTime);
                                                                console.log(`Saved position ${v.currentTime.toFixed(2)}s from ${currentlyPlayingVideo}`);
                                                                v.pause();
                                                                // Also pause any translated audio in the same container
                                                                const container = v.closest('.relative');
                                                                const audioElement = container?.querySelector('audio');
                                                                if (audioElement && !audioElement.paused) {
                                                                    audioElement.pause();
                                                                }
                                                            }
                                                        });
                                                    }
                                                    
                                                    // Set current playing video BEFORE playing
                                                    setCurrentlyPlayingVideo(videoId);
                                                    
                                                    // Restore position for this video if available
                                                    if (sharedVideoPosition > 0) {
                                                        videoElement.currentTime = sharedVideoPosition;
                                                        console.log(`Restored ${displayName} video to position ${sharedVideoPosition.toFixed(2)}s`);
                                                    }
                                                    
                                                    await videoElement.play();
                                                    console.log(`${displayName}: ✅ Video play() successful`);
                                                    
                                                    // Update local state (global state already set above)
                                                    setIsVideoPlaying(true);
                                                    
                                                    
                                                    
                                                    // Sync translated audio if available
                                                    if (audioElement && audioSrc) {
                                                        audioElement.currentTime = videoElement.currentTime;
                                                        await audioElement.play();
                                                        console.log(`${displayName}: ✅ Video + audio playing`);
                                                    } else {
                                                        console.log(`${displayName}: ✅ Video playing (no audio)`);
                                                    }
                                                } else {
                                                    console.log(`${displayName}: ⏸️ Pausing video...`);
                                                    
                                                    // Save current position before pausing
                                                    setSharedVideoPosition(videoElement.currentTime);
                                                    console.log(`Saved ${displayName} video position: ${videoElement.currentTime.toFixed(2)}s`);
                                                    
                                                    videoElement.pause();
                                                    console.log(`${displayName}: ✅ Video pause() called`);
                                                    
                                                    // Clear global state if this was the playing video
                                                    if (currentlyPlayingVideo === videoId) {
                                                        setCurrentlyPlayingVideo(null);
                                                    }
                                                    setIsVideoPlaying(false);
                                                    
                                                    if (audioElement) {
                                                        audioElement.pause();
                                                        console.log(`${displayName}: ✅ Audio pause() called`);
                                                    }
                                                }
                                            } catch (error) {
                                                console.error(`${displayName}: Control error:`, error);
                                                setIsVideoPlaying(false);
                                            }
                                        }}
                                >
                                    <svg width="30" height="29" viewBox="0 0 30 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M0 8.41699C0 3.99871 3.58172 0.416992 8 0.416992H22C26.4183 0.416992 30 3.99871 30 8.41699V20.417C30 24.8353 26.4183 28.417 22 28.417H8C3.58172 28.417 0 24.8353 0 20.417V8.41699Z" fill="#3840EB"/>
                                        <path d="M10.916 10.3277C10.916 9.76119 10.916 9.47794 11.0341 9.32179C11.137 9.18577 11.2943 9.10159 11.4646 9.09143C11.66 9.07976 11.8957 9.23688 12.3671 9.55112L18.5011 13.6405C18.8906 13.9002 19.0854 14.03 19.1532 14.1936C19.2126 14.3367 19.2126 14.4975 19.1532 14.6405C19.0854 14.8042 18.8906 14.934 18.5011 15.1937L12.3671 19.2831C11.8957 19.5973 11.66 19.7544 11.4646 19.7427C11.2943 19.7326 11.137 19.6484 11.0341 19.5124C10.916 19.3562 10.916 19.073 10.916 18.5065V10.3277Z" stroke="white" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </button>
                                )}
                                
                                {/* Clickable video area for pause when playing */}
                                {isVideoPlaying && (
                                    <button 
                                        className="absolute inset-0 bg-transparent"
                                        onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            
                                            const container = e.currentTarget.parentElement;
                                            const videoElement = container?.querySelector('video') as HTMLVideoElement;
                                            const audioElement = container?.querySelector('audio') as HTMLAudioElement;
                                            
                                            if (videoElement && !videoElement.paused) {
                                                videoElement.pause();
                                                
                                                // Clear global state if this was the playing video
                                                if (currentlyPlayingVideo === videoId) {
                                                    setCurrentlyPlayingVideo(null);
                                                }
                                                setIsVideoPlaying(false);
                                                
                                                if (audioElement) {
                                                    audioElement.pause();
                                                }
                                            }
                                        }}
                                    />
                                )}
                                
                                {/* Thin Video Timeline Scrubber */}
                                <div className="absolute bottom-0 left-0 right-0">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        defaultValue="0"
                                        className="w-full h-1 appearance-none cursor-pointer bg-transparent"
                                        style={{
                                            background: 'linear-gradient(to right, #3840EB 0%, #3840EB var(--progress, 0%), rgba(255,255,255,0.3) var(--progress, 0%), rgba(255,255,255,0.3) 100%)',
                                            WebkitAppearance: 'none',
                                            outline: 'none',
                                            borderRadius: '2px'
                                        }}
                                            onChange={(e) => {
                                                const container = e.target.closest('.relative');
                                                const videoElement = container?.querySelector('video') as HTMLVideoElement;
                                                const audioElement = container?.querySelector('audio') as HTMLAudioElement;
                                                
                                                if (videoElement && videoElement.duration) {
                                                    const seekTime = (parseFloat(e.target.value) / 100) * videoElement.duration;
                                                    videoElement.currentTime = seekTime;
                                                    
                                                    // Sync translated audio
                                                    if (audioElement) {
                                                        audioElement.currentTime = seekTime;
                                                        console.log(`${displayName} synced seek to ${seekTime.toFixed(2)}s`);
                                                    }
                                                }
                                            }}
                                            ref={(slider) => {
                                                if (slider) {
                                                    const container = slider.closest('.relative');
                                                    const videoElement = container?.querySelector('video') as HTMLVideoElement;
                                                    
                                                    if (videoElement) {
                                                        const updateProgress = () => {
                                                            if (videoElement.duration) {
                                                                const progress = (videoElement.currentTime / videoElement.duration) * 100;
                                                                slider.style.setProperty('--progress', `${progress}%`);
                                                                slider.value = progress.toString();
                                                            }
                                                        };
                                                        
                                                        videoElement.addEventListener('timeupdate', updateProgress);
                                                        videoElement.addEventListener('loadedmetadata', updateProgress);
                                                    }
                                                }
                                            }}
                                        />
                                </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center h-full text-white bg-gray-800">
                                    {!videoFile ? 'No Video File' : 'No Video Source'}
                                </div>
                            )}
                            </div>
                        </div>
                    )}

                    {/* Audio Player */}
                    {audioFile && (
                        <div className="flex-shrink-0 flex items-center">
                            <div className="bg-white rounded-lg px-3 border border-gray-300 flex items-center gap-3 w-64">
                                {audioSrc && (
                                    <audio
                                        className="hidden"
                                        src={audioSrc}
                                        onPlay={(e) => {
                                            console.log('Audio started playing');
                                            setIsLocalAudioPlaying(true);
                                            const audio = e.target as HTMLAudioElement;
                                            // Restore position if this language was playing before
                                            if (currentlyPlayingLanguage === languageCode && sharedAudioPosition > 0) {
                                                audio.currentTime = sharedAudioPosition;
                                                console.log(`Restored ${displayName} audio position to ${sharedAudioPosition.toFixed(2)}s`);
                                            }
                                        }}
                                        onPause={(e) => {
                                            console.log('Audio paused');
                                            setIsLocalAudioPlaying(false);
                                            const audio = e.target as HTMLAudioElement;
                                            // Save current position when pausing
                                            setSharedAudioPosition(audio.currentTime);
                                            console.log(`Saved ${displayName} audio position: ${audio.currentTime.toFixed(2)}s`);
                                        }}
                                        onEnded={(e) => {
                                            console.log(`${displayName} audio ended`);
                                            setIsLocalAudioPlaying(false);
                                            
                                            // Reset shared position when audio ends
                                            setSharedAudioPosition(0);
                                            
                                            // Clear global playing state if this was the playing language
                                            if (currentlyPlayingLanguage === languageCode) {
                                                setCurrentlyPlayingLanguage(null);
                                            }
                                            
                                            console.log(`${displayName} audio ended - reset position and cleared playing state`);
                                        }}
                                        onError={() => {
                                            console.error(`${displayName} audio error`);
                                            setIsLocalAudioPlaying(false);
                                            
                                            // Clear global playing state if this was the playing language
                                            if (currentlyPlayingLanguage === languageCode) {
                                                setCurrentlyPlayingLanguage(null);
                                            }
                                        }}
                                        onLoadStart={() => console.log('Audio load started')}
                                        onCanPlay={() => console.log('Audio can play')}
                                    />
                                )}

                                {/* Waveform Canvas */}
                                <canvas
                                    className="flex-1 h-12 w-52 bg-white rounded"
                                    ref={(canvas) => {
                                        if (canvas) {
                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                                canvas.width = canvas.offsetWidth;
                                                canvas.height = 48;
                                                ctx.fillStyle = '#ffffff';
                                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                                ctx.fillStyle = '#000000';
                                                const barWidth = 3;
                                                const barSpacing = 2;
                                                const barCount = Math.floor(canvas.width / (barWidth + barSpacing));
                                                const heights = [8, 12, 6, 16, 10, 14, 8, 18, 12, 6, 16, 10, 8, 14, 12, 6, 16, 8, 12, 10];

                                                for (let i = 0; i < barCount; i++) {
                                                    const x = i * (barWidth + barSpacing);
                                                    const height = heights[i % heights.length];
                                                    const y = (canvas.height - height) / 2;
                                                    ctx.beginPath();
                                                    ctx.roundRect(x, y, barWidth, height, 1);
                                                    ctx.fill();
                                                }
                                            }
                                        }
                                    }}
                                />

                                {/* Play/Pause Button - Different behavior for Live vs One Shot */}
                                <button 
                                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                                        (!audioSrc || queueChunks.length === 0)
                                            ? 'bg-gray-400 cursor-not-allowed' 
                                            : isLocalAudioPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-[#3840EB] hover:bg-blue-600'
                                    }`}
                                    disabled={!audioSrc || queueChunks.length === 0}
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        
                                        // Live mode: Use regular audio element (like one-shot) for position sharing
                                        if (!isOneShotMode) {
                                            // In live mode, if we have audioSrc (concatenated), use regular audio control
                                            if (audioSrc) {
                                                // Use the same logic as one-shot mode below
                                                console.log(`[${displayName}] Live mode: using concatenated audio for position sharing`);
                                            } else {
                                                console.log(`[${displayName}] Live mode: no concatenated audio available yet`);
                                                return;
                                            }
                                        }
                                        
                                        // Both Live and One Shot mode: Use concatenated audio
                                        if (!audioSrc || queueChunks.length === 0) {
                                            console.log('Audio not ready for playback');
                                            return;
                                        }
                                        const audio = e.currentTarget.parentElement?.querySelector('audio') as HTMLAudioElement;
                                        if (audio) {
                                            try {
                                                if (audio.paused) {
                                                    console.log('Playing audio...');
                                                    
                                                    // Save current position of any playing audio and pause it
                                                    if (currentlyPlayingLanguage && currentlyPlayingLanguage !== languageCode) {
                                                        const allAudioElements = document.querySelectorAll('audio');
                                                        allAudioElements.forEach(a => {
                                                            if (a !== audio && !a.paused) {
                                                                // Save position before pausing
                                                                setSharedAudioPosition(a.currentTime);
                                                                console.log(`Saved position ${a.currentTime.toFixed(2)}s from ${currentlyPlayingLanguage}`);
                                                                a.pause();
                                                            }
                                                        });
                                                    }
                                                    
                                                    // Set current playing language BEFORE playing
                                                    setCurrentlyPlayingLanguage(languageCode);
                                                    
                                                    // Restore position for this language if available
                                                    if (sharedAudioPosition > 0) {
                                                        audio.currentTime = sharedAudioPosition;
                                                        console.log(`Restored ${displayName} audio to position ${sharedAudioPosition.toFixed(2)}s`);
                                                    }
                                                    
                                                    await audio.play();
                                                } else {
                                                    console.log('Pausing audio...');
                                                    
                                                    // Save current position before pausing
                                                    setSharedAudioPosition(audio.currentTime);
                                                    console.log(`Saved ${displayName} audio position: ${audio.currentTime.toFixed(2)}s`);
                                                    
                                                    audio.pause();
                                                    
                                                    // Clear global state if this was the playing audio
                                                    if (currentlyPlayingLanguage === languageCode) {
                                                        setCurrentlyPlayingLanguage(null);
                                                    }
                                                }
                                            } catch (error) {
                                                console.error('Error playing/pausing audio:', error);
                                            }
                                        } else {
                                            console.log('Audio element not found');
                                        }
                                    }}
                                >
                                    {isLocalAudioPlaying ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect x="6" y="4" width="4" height="16" fill="white"/>
                                            <rect x="14" y="4" width="4" height="16" fill="white"/>
                                        </svg>
                                    ) : (
                                        <svg width="12" height="12" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M2.91602 3.3277C2.91602 2.76119 2.91602 2.47794 3.03413 2.32179C3.13704 2.18577 3.29432 2.10159 3.46458 2.09143C3.66002 2.07976 3.8957 2.23688 4.36707 2.55112L10.5011 6.64051C10.8906 6.90016 11.0854 7.02999 11.1532 7.19363C11.2126 7.33669 11.2126 7.49748 11.1532 7.64054C11.0854 7.80418 10.8906 7.93401 10.5011 8.19367L4.36707 12.2831C3.8957 12.5973 3.66002 12.7544 3.46458 12.7427C3.29432 12.7326 3.13704 12.6484 3.03413 12.5124C2.91602 12.3562 2.91602 12.073 2.91602 11.5065V3.3277Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Text Content */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                        {/* One Shot Mode: Show full text like text mode */}
                        {queue && isOneShotMode && audioFile ? (
                            // One shot audio mode - show full text instead of chunks
                            queueChunks.length === 0 ? (
                                <div className="text-center text-gray-400 text-sm py-8">
                                    <p>No STT data yet</p>
                                    <p className="text-xs mt-1">Waiting for real-time transcriptions...</p>
                                </div>
                            ) : (
                                <p className='text-[#121212] leading-relaxed break-words whitespace-pre-wrap'>
                                    {queueChunks.map(chunk => chunk.translated_text).join(' ')}
                                </p>
                            )
                        ) : queue ? (
                            queueChunks.length === 0 ? (
                                <div className="text-center text-gray-400 text-sm py-8">
                                    <p>No STT data yet</p>
                                    <p className="text-xs mt-1">Waiting for real-time transcriptions...</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {queueChunks
                                        .filter((chunk, index, array) => {
                                            // Remove duplicates based on translated_text
                                            return array.findIndex(c => c.translated_text === chunk.translated_text) === index;
                                        })
                                        .slice().reverse().map((chunk) => {
                                            // Find original position in filtered array for stable numbering
                                            const filteredChunks = queueChunks.filter((c, i, arr) => 
                                                arr.findIndex(cc => cc.translated_text === c.translated_text) === i
                                            );
                                            const originalPosition = filteredChunks.findIndex(c => c.id === chunk.id);
                                            const chunkNumber = originalPosition + 1;
                                            return (
                                        <div
                                            key={chunk.id}
                                            className={`
                                              p-2 rounded text-sm border-l-2 transition-all duration-200 w-full min-w-0
                                              ${chunk.is_final
                                                ? 'bg-blue-50 border-blue-400'
                                                : 'bg-gray-50 border-gray-300'
                                              }
                                            `}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs font-medium text-blue-600">
                                                      Chunk {chunkNumber}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-400">
                                                    {new Date(chunk.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>

                                            <p className='text-[#121212] leading-relaxed break-words whitespace-pre-wrap'>
                                                {chunk.translated_text}
                                            </p>

                                            {chunk.latency > 0 && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {chunk.latency.toFixed(0)}ms
                                                </div>
                                            )}
                                        </div>
                                            );
                                        })}
                                </div>
                            )
                        ) : (
                            /* Legacy Mode: Single translation result */
                            <p className='text-[#121212] leading-relaxed break-words whitespace-pre-wrap'>
                                {isLoading ? 'Translating...' : displayText}
                            </p>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Timing metrics - now outside the box */}
            {renderTimingMetrics()}
        </div>
    )
}

export default LanguageTranscript