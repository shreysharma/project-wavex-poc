'use client';

import { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';

const AudioComponent = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { selectedLanguage } = useAppContext();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };


  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const handleProcessAudio = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    try {
      // TODO: Integrate with translation service for audio processing
      console.log('Processing audio file:', selectedFile.name);
      // Add your audio processing logic here
    } catch (error) {
      console.error('Audio processing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full border border-[#D9D9D9] rounded-[12px] p-6 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.5 15V10C17.5 5.85786 14.1421 2.5 10 2.5C5.85787 2.5 2.5 5.85786 2.5 10V15M4.58333 17.5C3.43274 17.5 2.5 16.5673 2.5 15.4167V13.75C2.5 12.5994 3.43274 11.6667 4.58333 11.6667C5.73393 11.6667 6.66667 12.5994 6.66667 13.75V15.4167C6.66667 16.5673 5.73393 17.5 4.58333 17.5ZM15.4167 17.5C14.2661 17.5 13.3333 16.5673 13.3333 15.4167V13.75C13.3333 12.5994 14.2661 11.6667 15.4167 11.6667C16.5673 11.6667 17.5 12.5994 17.5 13.75V15.4167C17.5 16.5673 16.5673 17.5 15.4167 17.5Z" stroke="#3840EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 className="text-xl font-semibold text-gray-800">Audio Processing</h2>
      </div>

      {/* File Selection Area */}
      {!selectedFile ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-lg text-gray-700 mb-1">Select Audio File</p>
              <p className="text-sm text-gray-500">Choose an audio file to process</p>
              <p className="text-xs text-gray-400 mt-2">Supported: MP3, WAV, M4A, FLAC</p>
            </div>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.flac"
              onChange={handleFileSelect}
              className="
                mt-4 px-6 py-3 bg-[#3840EB] text-white rounded-lg hover:bg-blue-600
                transition-all duration-200 transform hover:scale-105 active:scale-95
                file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
                file:text-sm file:font-semibold file:bg-white file:text-[#3840EB]
                file:hover:bg-gray-50 file:cursor-pointer cursor-pointer
              "
            />
          </div>
        </div>
      ) : (
        /* File Preview */
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#3840EB] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.5 15V10C17.5 5.85786 14.1421 2.5 10 2.5C5.85787 2.5 2.5 5.85786 2.5 10V15M4.58333 17.5C3.43274 17.5 2.5 16.5673 2.5 15.4167V13.75C2.5 12.5994 3.43274 11.6667 4.58333 11.6667C5.73393 11.6667 6.66667 12.5994 6.66667 13.75V15.4167C6.66667 16.5673 5.73393 17.5 4.58333 17.5ZM15.4167 17.5C14.2661 17.5 13.3333 16.5673 13.3333 15.4167V13.75C13.3333 12.5994 14.2661 11.6667 15.4167 11.6667C16.5673 11.6667 17.5 12.5994 17.5 13.75V15.4167C17.5 16.5673 16.5673 17.5 15.4167 17.5Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={handleRemoveFile}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}


      {/* Process Button */}
      {selectedFile && (
        <div className="mt-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          <button
            onClick={handleProcessAudio}
            disabled={isProcessing}
            className={`
              w-full px-6 py-3 rounded-lg font-semibold transition-all duration-300 ease-in-out transform
              ${isProcessing
                ? 'bg-gray-400 cursor-not-allowed scale-95'
                : 'bg-[#3840EB] hover:bg-blue-600 hover:scale-105 active:scale-95'
              } text-white
            `}
          >
            <div className={`flex items-center justify-center gap-2 ${isProcessing ? 'animate-pulse' : ''}`}>
              {isProcessing && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              {isProcessing ? 'Processing Audio...' : `Process Audio (${selectedLanguage.name})`}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioComponent;