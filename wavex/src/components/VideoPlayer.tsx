'use client';

import { useState } from 'react';

interface VideoPlayerProps {
  file: File;
  onRemove: () => void;
  className?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ file, onRemove, className = '' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.preventDefault();
    const video = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
    const playIcon = e.currentTarget.querySelector('.video-play-icon');
    const pauseIcon = e.currentTarget.querySelector('.video-pause-icon');

    if (video.paused) {
      video.play();
      setIsPlaying(true);
      setShowControls(false);
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
    } else {
      video.pause();
      setIsPlaying(false);
      setShowControls(true);
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
    }
  };

  const drawVideoWaveform = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = 24;

    // White background (like index.html)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Black waveform bars (like index.html)
    ctx.fillStyle = '#000000';
    const barWidth = 3;
    const barSpacing = 2;
    const barCount = Math.floor(canvas.width / (barWidth + barSpacing));
    const heights = [6, 9, 4, 12, 7, 10, 5, 14, 8, 4, 12, 7, 5, 10, 9, 4, 12, 6, 9, 7];

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + barSpacing);
      const height = heights[i % heights.length];
      const y = (canvas.height - height) / 2;

      // Draw rounded rectangle for waveform bars
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, height, 1);
      ctx.fill();
    }
  };

  return (
    <div className={`p-3 ${className}`}>
      <div className="flex flex-col gap-3">
        {/* Video Element with Overlay (like index.html) */}
        <div className="relative w-full">
          <video
            className="w-[400px] h-48 rounded object-cover"
            src={URL.createObjectURL(file)}
            muted
            preload="metadata"
            onPlay={() => setShowControls(false)}
            onPause={() => setShowControls(true)}
            onEnded={() => {
              setIsPlaying(false);
              setShowControls(true);
            }}
          />

          {/* Overlay Play Button (matches index.html design) */}
          <button
            className={`
              absolute inset-0 flex items-center justify-center transition-all duration-200 rounded
              ${showControls ? 'bg-black bg-opacity-30 hover:bg-opacity-40' : 'bg-transparent pointer-events-none opacity-0'}
            `}
            onClick={handlePlayPause}
          >
            <div className="w-16 h-16 bg-[#3840EB] rounded-[24px] flex items-center justify-center">
              <svg className="video-play-icon" width="25" height="25" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.91602 3.3277C2.91602 2.76119 2.91602 2.47794 3.03413 2.32179C3.13704 2.18577 3.29432 2.10159 3.46458 2.09143C3.66002 2.07976 3.8957 2.23688 4.36707 2.55112L10.5011 6.64051C10.8906 6.90016 11.0854 7.02999 11.1532 7.19363C11.2126 7.33669 11.2126 7.49748 11.1532 7.64054C11.0854 7.80418 10.8906 7.93401 10.5011 8.19367L4.36707 12.2831C3.8957 12.5973 3.66002 12.7544 3.46458 12.7427C3.29432 12.7326 3.13704 12.6484 3.03413 12.5124C2.91602 12.3562 2.91602 12.073 2.91602 11.5065V3.3277Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <svg className="video-pause-icon hidden" width="25" height="25" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5V15M12 5V15" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
};

export default VideoPlayer;