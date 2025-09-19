'use client';

import { useState } from 'react';

interface AudioPlayerProps {
  file: File;
  onRemove: () => void;
  className?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ file, onRemove, className = '' }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.preventDefault();
    const audio = e.currentTarget.parentElement?.querySelector('audio') as HTMLAudioElement;
    const playIcon = e.currentTarget.querySelector('.play-icon');
    const pauseIcon = e.currentTarget.querySelector('.pause-icon');

    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
    } else {
      audio.pause();
      setIsPlaying(false);
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
    }
  };

  const drawWaveform = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = 48;

    // White background (like index.html)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Black waveform bars (like index.html)
    ctx.fillStyle = '#000000';
    const barWidth = 3;
    const barSpacing = 2;
    const barCount = Math.floor(canvas.width / (barWidth + barSpacing));
    const heights = [8, 12, 6, 16, 10, 14, 8, 18, 12, 6, 16, 10, 8, 14, 12, 6, 16, 8, 12, 10];

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
    <div className={`bg-white rounded-lg px-3 border border-gray-300 flex items-center gap-3 ${className}`}>
      <audio
        className="hidden"
        src={URL.createObjectURL(file)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Waveform Canvas */}
      <canvas
        className="flex-1 h-12 w-52 bg-white rounded"
        ref={(canvas) => {
          if (canvas) {
            drawWaveform(canvas);
          }
        }}
      />

      {/* Play/Pause Button */}
      <button
        className="w-8 h-8 bg-[#3840EB] rounded flex items-center justify-center hover:bg-blue-600 transition-colors flex-shrink-0"
        onClick={handlePlayPause}
      >
        <svg className="play-icon" width="12" height="12" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.91602 3.3277C2.91602 2.76119 2.91602 2.47794 3.03413 2.32179C3.13704 2.18577 3.29432 2.10159 3.46458 2.09143C3.66002 2.07976 3.8957 2.23688 4.36707 2.55112L10.5011 6.64051C10.8906 6.90016 11.0854 7.02999 11.1532 7.19363C11.2126 7.33669 11.2126 7.49748 11.1532 7.64054C11.0854 7.80418 10.8906 7.93401 10.5011 8.19367L4.36707 12.2831C3.8957 12.5973 3.66002 12.7544 3.46458 12.7427C3.29432 12.7326 3.13704 12.6484 3.03413 12.5124C2.91602 12.3562 2.91602 12.073 2.91602 11.5065V3.3277Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <svg className="pause-icon hidden" width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5V15M12 5V15" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

    </div>
  );
};

export default AudioPlayer;