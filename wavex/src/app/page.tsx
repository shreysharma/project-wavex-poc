'use client';

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '@/contexts/AppContext';
import LanguageTranscript from '@/components/LanguageTranscript';
import AudioPlayer from '@/components/AudioPlayer';
import VideoPlayer from '@/components/VideoPlayer';
import ConnectionOverlay from '@/components/ConnectionOverlay';

export default function Home() {
  const {
    isPopupOpen,
    setIsPopupOpen,
    selectMediaType,
    translationResults,
    isTranslating,
    inputText,
    setInputText,
    translateText,
    selectedAudioFile,
    setSelectedAudioFile,
    selectedVideoFile,
    setSelectedVideoFile,
    processAudioFile,
    processVideoFile,
    selectedLanguage,
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
    currentlyPlayingLanguage,
    setCurrentlyPlayingLanguage,
    sharedAudioPosition,
    setSharedAudioPosition,
    clearAllQueues,
    restartAudioSession,
    isOneShotMode,
    setIsTranslating,
    setIsWaitingForAudioChunks,
    setTranslationResults,
    setOneShotResults,
    setOneShotProgress,
    isConnected,
    connectedSTTCount,
    totalSTTCount,
    oneShotProgress,
    isWaitingForAudioChunks,
    clearAllHistoryAndStopProcesses
  } = useAppContext();
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTogglePopup = () => {
    console.log('Plus button clicked, popup is currently:', isPopupOpen);
    if (!isPopupOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const position = {
        top: rect.bottom + 40,
        left: rect.left
      };
      console.log('Setting popup position:', position);
      setPopupPosition(position);
    }
    setIsPopupOpen(!isPopupOpen);
    console.log('Setting popup open to:', !isPopupOpen);
  };

  const handleTranslate = async () => {
    if (selectedAudioFile) {
      await processAudioFile(selectedAudioFile);
    } else if (selectedVideoFile) {
      await processVideoFile(selectedVideoFile);
    } else if (inputText.trim()) {
      await translateText(inputText);
    } else {
      alert('Please enter text or select a file to process');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    setInputText(target.value);

    // Auto-resize logic
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, window.innerHeight * 0.3 - 8) + 'px';
    
    // Force scroll to top after a brief delay to ensure DOM updates
    setTimeout(() => {
      target.scrollTop = 0;
    }, 0);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    // After paste completes, scroll to top
    setTimeout(() => {
      target.scrollTop = 0;
    }, 10);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Escape key or Ctrl+C to cancel when files are selected
    if ((e.key === 'Escape' || (e.ctrlKey && e.key === 'c')) && (selectedAudioFile || selectedVideoFile)) {
      e.preventDefault();
      console.log('[CANCEL] File cancellation triggered by keyboard shortcut');
      await clearAllHistoryAndStopProcesses();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const popup = document.getElementById('mediaPopup');

      // Don't close if clicking on the button or inside the popup
      if (buttonRef.current?.contains(target) || popup?.contains(target)) {
        return;
      }

      console.log('Clicking outside, closing popup');
      setIsPopupOpen(false);
    };

    if (isPopupOpen) {
      // Add a small delay to prevent immediate closing
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopupOpen, setIsPopupOpen]);

  // Global keyboard event listener for file cancellation
  useEffect(() => {
    const handleGlobalKeyDown = async (event: KeyboardEvent) => {
      // Handle Escape key or Ctrl+C to cancel when files are selected
      if ((event.key === 'Escape' || (event.ctrlKey && event.key === 'c')) && (selectedAudioFile || selectedVideoFile)) {
        event.preventDefault();
        console.log('[CANCEL] File cancellation triggered by global keyboard shortcut');
        await clearAllHistoryAndStopProcesses();
      }
    };

    // Only add listener when files are selected
    if (selectedAudioFile || selectedVideoFile) {
      document.addEventListener('keydown', handleGlobalKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [selectedAudioFile, selectedVideoFile, clearAllHistoryAndStopProcesses]);

  const PopupContent = () => {
    console.log('PopupContent is rendering at position:', popupPosition);
    return (
      <div
        id="mediaPopup"
        className="fixed bg-white shadow-2xl border border-gray-200 rounded-lg p-4 z-50 min-w-[200px] animate-in fade-in-0 zoom-in-95 duration-200"
        style={{
          boxShadow: '0 0 20px rgba(0, 0, 0, 0.15)',
          top: popupPosition.top,
          left: popupPosition.left,
          animation: 'slideInUp 0.2s ease-out forwards'
        }}
      >
        <div className="space-y-2">
          {['audio', 'video'/*, 'text'*/].map((type, index) => (
            <button
              key={type}
              className="w-full text-left p-2 hover:bg-gray-100 rounded flex items-center gap-2 transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Popup: ${type} button clicked - about to call selectMediaType`);
                selectMediaType(type);
                console.log(`Popup: selectMediaType(${type}) called`);
              }}
              type="button"
              style={{
                animationDelay: `${index * 50}ms`,
                animation: 'fadeInUp 0.3s ease-out forwards'
              }}
            >
              {type === 'audio' && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.5 15V10C17.5 5.85786 14.1421 2.5 10 2.5C5.85787 2.5 2.5 5.85786 2.5 10V15M4.58333 17.5C3.43274 17.5 2.5 16.5673 2.5 15.4167V13.75C2.5 12.5994 3.43274 11.6667 4.58333 11.6667C5.73393 11.6667 6.66667 12.5994 6.66667 13.75V15.4167C6.66667 16.5673 5.73393 17.5 4.58333 17.5ZM15.4167 17.5C14.2661 17.5 13.3333 16.5673 13.3333 15.4167V13.75C13.3333 12.5994 14.2661 11.6667 15.4167 11.6667C16.5673 11.6667 17.5 12.5994 17.5 13.75V15.4167C17.5 16.5673 16.5673 17.5 15.4167 17.5Z" stroke="#101012" strokeWidth="0.833333" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {type === 'video' && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10.0003 18.3337V1.66699M5.83366 18.3337V14.167M5.83366 5.83366V1.66699M14.167 18.3337V14.167M14.167 5.83366V1.66699M1.66699 5.83366H18.3337M1.66699 14.167H18.3337M18.3337 14.3337V5.66699C18.3337 4.26686 18.3337 3.5668 18.0612 3.03202C17.8215 2.56161 17.439 2.17916 16.9686 1.93948C16.4339 1.66699 15.7338 1.66699 14.3337 1.66699L5.66699 1.66699C4.26686 1.66699 3.5668 1.66699 3.03202 1.93948C2.56161 2.17916 2.17916 2.56161 1.93948 3.03202C1.66699 3.5668 1.66699 4.26686 1.66699 5.66699L1.66699 14.3337C1.66699 15.7338 1.66699 16.4339 1.93948 16.9686C2.17916 17.439 2.56161 17.8215 3.03202 18.0612C3.5668 18.3337 4.26686 18.3337 5.66699 18.3337H14.3337C15.7338 18.3337 16.4339 18.3337 16.9686 18.0612C17.439 17.8215 17.8215 17.439 18.0612 16.9686C18.3337 16.4339 18.3337 15.7338 18.3337 14.3337Z" stroke="#101012" strokeWidth="0.833333" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {type === 'text' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2.26953V6.40007C14 6.96012 14 7.24015 14.109 7.45406C14.2049 7.64222 14.3578 7.7952 14.546 7.89108C14.7599 8.00007 15.0399 8.00007 15.6 8.00007H19.7305M16 13H8M16 17H8M10 9H8M14 2H8.8C7.11984 2 6.27976 2 5.63803 2.32698C5.07354 2.6146 4.6146 3.07354 4.32698 3.63803C4 4.27976 4 5.11984 4 6.8V17.2C4 18.8802 4 19.7202 4.32698 20.362C4.6146 20.9265 5.07354 21.3854 5.63803 21.673C6.27976 22 7.11984 22 8.8 22H15.2C16.8802 22 17.7202 22 18.362 21.673C18.9265 21.3854 19.3854 20.9265 19.673 20.362C20 19.7202 20 18.8802 20 17.2V8L14 2Z" stroke="#101012" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span className="capitalize">{type}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-screen pt-40 px-20 pb-4 flex flex-col">
      <div className="w-full h-full flex flex-col">
        {/* Sticky Input Section */}
        <div className="sticky top-0 bg-white z-30 pb-4">
          <h1 className="text-[24px] font-switzer mb-2">
            Input
          </h1>

          {/* Input Area - Everything in one horizontal line */}
          <div className={`w-full ${selectedVideoFile || selectedAudioFile ? 'min-h-[15vh]' : 'min-h-[8vh]'} max-h-[40vh] bg-[#F4F4F4] rounded-[14px] flex items-center p-1 gap-2`}>
          {/* Plus Icon */}
          <button
            ref={buttonRef}
            id="addMediaBtn"
            className="w-[50px] h-[50px] text-gray-600 rounded-full flex items-center justify-center flex-shrink-0"
            onClick={handleTogglePopup}
          >
            <svg width="24" height="24" viewBox="0 0 31 31" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.6094 6.36035V23.8604M6.85938 15.1104H24.3594" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Audio Player Component */}
          {selectedAudioFile && (
            <AudioPlayer
              file={selectedAudioFile}
              onRemove={async () => {
                console.log('[REMOVE AUDIO] Clearing all history and stopping processes');
                await clearAllHistoryAndStopProcesses();
              }}
              className="flex-shrink-0 animate-in fade-in-0 slide-in-from-left-4 duration-300"
            />
          )}

          {/* Video Player Component */}
          {selectedVideoFile && (
            <VideoPlayer
              file={selectedVideoFile}
              onRemove={async () => {
                console.log('[REMOVE VIDEO] Clearing all history and stopping processes');
                await clearAllHistoryAndStopProcesses();
              }}
              className="flex-shrink-0 animate-in fade-in-0 slide-in-from-left-4 duration-300"
            />
          )}

          {/* Textarea - Disabled when audio/video files are selected */}
          <textarea
            ref={textareaRef}
            name=""
            id=""
            placeholder={selectedVideoFile || selectedAudioFile ? "" : "Type here"}
            value={inputText}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            disabled={!!(selectedVideoFile || selectedAudioFile)}
            className={`bg-transparent rounded-lg  resize-none flex-1 ${selectedVideoFile || selectedAudioFile ? 'min-h-[calc(15vh-8px)] opacity-50 cursor-not-allowed' : 'min-h-[calc(8vh-8px)]'} focus:outline-none overflow-y-auto`}
            style={{ 
              lineHeight: '1.5',
              paddingTop: '24px',
              paddingLeft: '8px',
              paddingRight: '8px',
              paddingBottom: '8px'
            }}
          />


          <button
            id="translateBtn"
            onClick={handleTranslate}
            disabled={
              isTranslating || 
              isWaitingForAudioChunks || 
              (!inputText.trim() && !selectedAudioFile && !selectedVideoFile)
            }
            className={`
              px-6 py-2 rounded-[10px] font-semibold flex-shrink-0 h-fit
              transition-all duration-300 ease-in-out transform
              ${isTranslating || 
                isWaitingForAudioChunks || 
                (!inputText.trim() && !selectedAudioFile && !selectedVideoFile)
                ? 'bg-gray-400 cursor-not-allowed scale-95'
                : 'bg-[#3840EB] hover:bg-[#3840EB] hover:scale-105 active:scale-95'
              } text-white
            `}
          >
            <div className={`flex items-center gap-2 transition-all duration-200 ${isTranslating || isWaitingForAudioChunks ? 'animate-pulse' : ''}`}>
              {(isTranslating || isWaitingForAudioChunks) && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              {isOneShotMode && isTranslating && oneShotProgress.total > 0
                ? `Processing ${oneShotProgress.completed}/${oneShotProgress.total}${oneShotProgress.currentLanguage ? ` (${oneShotProgress.currentLanguage})` : ''}...`
                : !isOneShotMode && (selectedAudioFile || selectedVideoFile) && isTranslating
                  ? connectedSTTCount === totalSTTCount && connectedSTTCount === 13
                    ? isWaitingForAudioChunks 
                      ? 'Processing...' 
                      : 'Processing 13/13...'
                    : `Connecting ${connectedSTTCount}/${totalSTTCount}...`
                  : isWaitingForAudioChunks 
                    ? 'Processing...' 
                    : 'Translate'
              }
            </div>
          </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Output Section */}
        {(translationResults.length > 0 || selectedVideoFile || selectedAudioFile) && (
          <div className="w-full mt-6">
            <h2 className="text-[24px] font-switzer mb-4">Output</h2>
          </div>
        )}

        {/* Translation Results Area - Show for text translations OR One Shot Mode */}
        <div className='w-full pb-4'>
          {translationResults.length > 0 && (!selectedVideoFile && !selectedAudioFile || isOneShotMode) && (
            <div className={`
              transition-all duration-500 ease-in-out
              ${translationResults.length > 0
                ? 'opacity-100 transform translate-y-0'
                : 'opacity-0 transform translate-y-4 pointer-events-none'
              }
            `}>
              <LanguageTranscript
                data={{
                  language: {
                    code: 'original',
                    name: selectedLanguage.name,
                    nativeName: selectedLanguage.nativeName
                  },
                  original_text: translationResults[0]?.original_text || '',
                  translated_text: translationResults[0]?.original_text || '',
                  latency: 0
                }}
                isLoading={false}
              />
              <div className='h-4'></div>
              {translationResults.map((result, index) => (
                <div
                  key={result.language.code}
                  className={`
                    transition-all duration-300 ease-in-out mb-4
                    ${index * 50}ms
                  `}
                  style={{
                    animationDelay: `${index * 50}ms`,
                    animation: translationResults.length > 0 ? 'slideInUp 0.4s ease-out forwards' : 'none'
                  }}
                >
                  <LanguageTranscript
                    data={result}
                    isLoading={isTranslating && index === 0}
                    videoFile={selectedVideoFile || undefined}
                    audioFile={selectedAudioFile || undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Real-time Language Transcripts - Only show for audio/video processing */}
        {(selectedAudioFile || selectedVideoFile) && (
          <div className="mt-4">

          <div className="flex flex-col gap-4">
            {/* English Queue - First */}
            <LanguageTranscript
              queue={englishQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'en'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'en'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('en')
              }
            />

            {/* Hindi Queue - Second */}
            <LanguageTranscript
              queue={hindiQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'hi'}
              sharedAudioPosition={sharedAudioPosition}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={(currentPosition?: number) => {
                if (currentlyPlayingLanguage === 'hi') {
                  // Save current position before stopping
                  if (currentPosition !== undefined) {
                    setSharedAudioPosition(currentPosition);
                  }
                  setCurrentlyPlayingLanguage(null);
                } else {
                  // Stop other language and start this one
                  setCurrentlyPlayingLanguage('hi');
                }
              }}
            />

            {/* Punjabi Queue - Third */}
            <LanguageTranscript
              queue={punjabiQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'pa'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'pa'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('pa')
              }
            />

            {/* Urdu Queue - Fourth */}
            <LanguageTranscript
              queue={urduQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'ur'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'ur'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('ur')
              }
            />

            {/* Marathi Queue - Fifth */}
            <LanguageTranscript
              queue={marathiQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'mr'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'mr'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('mr')
              }
            />

            {/* Tamil Queue */}
            <LanguageTranscript
              queue={tamilQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'ta'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'ta'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('ta')
              }
            />

            {/* Telugu Queue */}
            <LanguageTranscript
              queue={teluguQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'te'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'te'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('te')
              }
            />

            {/* Bengali Queue */}
            <LanguageTranscript
              queue={bengaliQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'bn'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'bn'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('bn')
              }
            />

            {/* Gujarati Queue */}
            <LanguageTranscript
              queue={gujaratiQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'gu'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'gu'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('gu')
              }
            />

            {/* Kannada Queue */}
            <LanguageTranscript
              queue={kannadaQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'kn'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'kn'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('kn')
              }
            />

            {/* Malayalam Queue */}
            <LanguageTranscript
              queue={malayalamQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'ml'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'ml'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('ml')
              }
            />

            {/* Odia Queue */}
            <LanguageTranscript
              queue={odiaQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'or'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'or'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('or')
              }
            />

            {/* Assamese Queue */}
            <LanguageTranscript
              queue={assameseQueue}
              isGloballyPlaying={currentlyPlayingLanguage === 'as'}
              videoFile={selectedVideoFile || undefined}
              audioFile={selectedAudioFile || undefined}
              onTogglePlay={() =>
                currentlyPlayingLanguage === 'as'
                  ? setCurrentlyPlayingLanguage(null)
                  : setCurrentlyPlayingLanguage('as')
              }
            />
          </div>
        </div>
        )}
        </div>
      </div>

      {/* Connection Overlay - Blocks app until STT connections are ready */}
      <ConnectionOverlay />

      {/* Portal for popup */}
      {(() => {
        console.log('Portal render check - isPopupOpen:', isPopupOpen, 'window exists:', typeof window !== 'undefined');
        return isPopupOpen && typeof window !== 'undefined' && createPortal(
          <PopupContent />,
          document.body
        );
      })()}
    </div>
  );
}
