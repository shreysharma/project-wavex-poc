'use client';

import { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';

const VideoComponent = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const { selectedLanguage } = useAppContext();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create video preview URL
      const videoUrl = URL.createObjectURL(file);
      setVideoPreview(videoUrl);
    }
  };


  const handleRemoveFile = () => {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }
    setSelectedFile(null);
    setVideoPreview(null);
  };

  const handleProcessVideo = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    try {
      // TODO: Integrate with translation service for video processing
      console.log('Processing video file:', selectedFile.name);
      // Add your video processing logic here
    } catch (error) {
      console.error('Video processing failed:', error);
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

  const formatDuration = (duration: number) => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full border border-[#D9D9D9] rounded-[12px] p-6 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10.0003 18.3337V1.66699M5.83366 18.3337V14.167M5.83366 5.83366V1.66699M14.167 18.3337V14.167M14.167 5.83366V1.66699M1.66699 5.83366H18.3337M1.66699 14.167H18.3337M18.3337 14.3337V5.66699C18.3337 4.26686 18.3337 3.5668 18.0612 3.03202C17.8215 2.56161 17.439 2.17916 16.9686 1.93948C16.4339 1.66699 15.7338 1.66699 14.3337 1.66699L5.66699 1.66699C4.26686 1.66699 3.5668 1.66699 3.03202 1.93948C2.56161 2.17916 2.17916 2.56161 1.93948 3.03202C1.66699 3.5668 1.66699 4.26686 1.66699 5.66699L1.66699 14.3337C1.66699 15.7338 1.66699 16.4339 1.93948 16.9686C2.17916 17.439 2.56161 17.8215 3.03202 18.0612C3.5668 18.3337 4.26686 18.3337 5.66699 18.3337H14.3337C15.7338 18.3337 16.4339 18.3337 16.9686 18.0612C17.439 17.8215 17.8215 17.439 18.0612 16.9686C18.3337 16.4339 18.3337 15.7338 18.3337 14.3337Z" stroke="#3840EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 className="text-xl font-semibold text-gray-800">Video Processing</h2>
      </div>

      {/* File Selection Area */}
      {!selectedFile ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V7.5L14.5 2Z" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 15.5L12 17.5L16 13.5" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-lg text-gray-700 mb-1">Select Video File</p>
              <p className="text-sm text-gray-500">Choose a video file to process</p>
              <p className="text-xs text-gray-400 mt-2">Supported: MP4, MOV, AVI, MKV</p>
            </div>
            <input
              type="file"
              accept="video/*,.mp4,.mov,.avi,.mkv"
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
        /* Video Preview */
        <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          {/* Video Preview */}
          <div className="bg-black rounded-lg overflow-hidden">
            <video
              src={videoPreview || undefined}
              controls
              className="w-full h-48 object-contain"
              preload="metadata"
            />
          </div>

          {/* File Info */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#3840EB] rounded-lg flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10.0003 18.3337V1.66699M5.83366 18.3337V14.167M5.83366 5.83366V1.66699M14.167 18.3337V14.167M14.167 5.83366V1.66699M1.66699 5.83366H18.3337M1.66699 14.167H18.3337M18.3337 14.3337V5.66699C18.3337 4.26686 18.3337 3.5668 18.0612 3.03202C17.8215 2.56161 17.439 2.17916 16.9686 1.93948C16.4339 1.66699 15.7338 1.66699 14.3337 1.66699L5.66699 1.66699C4.26686 1.66699 3.5668 1.66699 3.03202 1.93948C2.56161 2.17916 2.17916 2.56161 1.93948 3.03202C1.66699 3.5668 1.66699 4.26686 1.66699 5.66699L1.66699 14.3337C1.66699 15.7338 1.66699 16.4339 1.93948 16.9686C2.17916 17.439 2.56161 17.8215 3.03202 18.0612C3.5668 18.3337 4.26686 18.3337 5.66699 18.3337H14.3337C15.7338 18.3337 16.4339 18.3337 16.9686 18.0612C17.439 17.8215 17.8215 17.439 18.0612 16.9686C18.3337 16.4339 18.3337 15.7338 18.3337 14.3337Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
        </div>
      )}


      {/* Process Button */}
      {selectedFile && (
        <div className="mt-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          <button
            onClick={handleProcessVideo}
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
              {isProcessing ? 'Processing Video...' : `Process Video (${selectedLanguage.name})`}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoComponent;