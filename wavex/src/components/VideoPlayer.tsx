'use client';

import { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';

interface VideoPlayerProps {
  file: File;
  onRemove: () => void;
  className?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ file, onRemove, className = '' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const { currentlyPlayingVideo, setCurrentlyPlayingVideo } = useAppContext();
  
  // Memoize URL to prevent recreation on re-renders
  const videoUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const videoId = `input-video-${file.name}-${file.lastModified}`;
  
  console.log('VideoPlayer render: isPlaying =', isPlaying, 'videoUrl =', videoUrl.substring(0, 30));

  const handlePlayPause = async (e: React.MouseEvent) => {
    console.log('VideoPlayer: Button clicked');
    e.preventDefault();
    e.stopPropagation();
    
    const video = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
    if (!video) {
      console.log('VideoPlayer: No video found');
      return;
    }

    console.log('VideoPlayer: Video found, paused:', video.paused);

    try {
      if (video.paused) {
        console.log('VideoPlayer: Attempting play...');
        
        // Pause any currently playing video and their audio
        if (currentlyPlayingVideo && currentlyPlayingVideo !== videoId) {
          // Find and pause other videos and their translated audio
          const allVideos = document.querySelectorAll('video');
          allVideos.forEach(v => {
            if (v !== video && !v.paused) {
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
        
        await video.play();
        console.log('VideoPlayer: Play successful');
        
        // Update global and local state
        setCurrentlyPlayingVideo(videoId);
        setIsPlaying(true);
      } else {
        console.log('VideoPlayer: Pausing...');
        video.pause();
        
        // Clear global state if this was the playing video
        if (currentlyPlayingVideo === videoId) {
          setCurrentlyPlayingVideo(null);
        }
        setIsPlaying(false);
      }
    } catch (error) {
      console.warn('VideoPlayer: Play/pause failed:', error);
      setIsPlaying(false);
    }
  };

  return (
    <div className={`p-3 ${className}`}>
      <div className="flex flex-col gap-3">
        {/* Video Element */}
        <div className="relative w-64 h-36">
          <video
            className="w-64 h-36 rounded object-cover"
            src={videoUrl}
            preload="metadata"
            playsInline
            onPlay={() => {
              console.log('VideoPlayer: onPlay event fired');
            }}
            onPause={() => {
              console.log('VideoPlayer: onPause event fired - something paused the video!');
              console.trace('VideoPlayer: Stack trace for pause event');
              setIsPlaying(false);
            }}
            onEnded={() => {
              setIsPlaying(false);
            }}
          />

          {/* Remove Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors duration-200 z-10"
            title="Remove video"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Play Button - Only show when paused */}
          {!isPlaying && (
            <button
              className="absolute inset-0 flex items-center justify-center transition-all duration-200 rounded bg-transparent"
              onClick={handlePlayPause}
            >
              <svg width="30" height="29" viewBox="0 0 30 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 8.41699C0 3.99871 3.58172 0.416992 8 0.416992H22C26.4183 0.416992 30 3.99871 30 8.41699V20.417C30 24.8353 26.4183 28.417 22 28.417H8C3.58172 28.417 0 24.8353 0 20.417V8.41699Z" fill="#3840EB"/>
                <path d="M10.916 10.3277C10.916 9.76119 10.916 9.47794 11.0341 9.32179C11.137 9.18577 11.2943 9.10159 11.4646 9.09143C11.66 9.07976 11.8957 9.23688 12.3671 9.55112L18.5011 13.6405C18.8906 13.9002 19.0854 14.03 19.1532 14.1936C19.2126 14.3367 19.2126 14.4975 19.1532 14.6405C19.0854 14.8042 18.8906 14.934 18.5011 15.1937L12.3671 19.2831C11.8957 19.5973 11.66 19.7544 11.4646 19.7427C11.2943 19.7326 11.137 19.6484 11.0341 19.5124C10.916 19.3562 10.916 19.073 10.916 18.5065V10.3277Z" stroke="white" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          
          {/* Clickable video area for pause when playing */}
          {isPlaying && (
            <button 
              className="absolute inset-0 bg-transparent"
              onClick={handlePlayPause}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;