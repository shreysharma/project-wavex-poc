// Audio service for playing TTS audio responses
// Simplified version from DivyaDarshak

interface AudioPlaybackQueue {
  base64Audio: string
  chunkNumber?: number
}

class AudioPlaybackService {
  private audioQueue: AudioPlaybackQueue[] = []
  private isPlaying = false
  private isProcessingQueue = false
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null

  // Get or create shared audio context
  private async getAudioContext(): Promise<AudioContext> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      this.audioContext = new AudioContextClass()
    }
    
    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume()
      } catch (error) {
        console.error('Failed to resume audio context:', error)
      }
    }
    
    return this.audioContext
  }

  // Play audio chunk from base64 data
  async playAudioChunk(base64Audio: string, chunkNumber?: number): Promise<void> {
    // Add to queue
    this.audioQueue.push({ base64Audio, chunkNumber })
    
    // Process queue immediately
    if (!this.isProcessingQueue) {
      this.processQueue()
    }
  }

  // Process audio queue sequentially
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.audioQueue.length === 0) {
      return
    }
    
    this.isProcessingQueue = true
    
    while (this.audioQueue.length > 0) {
      const audioData = this.audioQueue.shift()
      if (!audioData) continue
      
      // Wait for any current audio to finish
      let waitCount = 0
      while (this.isPlaying) {
        await new Promise(resolve => setTimeout(resolve, 50))
        waitCount++
        if (waitCount > 100) { // 5 seconds timeout
          console.error('Audio playback timeout - force stopping')
          this.isPlaying = false
          this.currentSource = null
          break
        }
      }
      
      // Play the next audio chunk
      try {
        await this.playAudioImmediately(audioData.base64Audio)
      } catch (error) {
        console.error('Error playing audio chunk:', error)
        this.isPlaying = false
      }
    }
    
    this.isProcessingQueue = false
  }

  // Play audio immediately using Web Audio API
  private async playAudioImmediately(base64Audio: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Decode base64 to bytes
        const audioBytes = atob(base64Audio)
        const audioArray = new Uint8Array(audioBytes.length)
        for (let i = 0; i < audioBytes.length; i++) {
          audioArray[i] = audioBytes.charCodeAt(i)
        }
        
        // Get audio context
        const audioContext = await this.getAudioContext()
        
        // Force resume if suspended
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }
        
        // For PCM 24kHz 16-bit mono (Gemini Live output format)
        const sampleRate = 24000
        const channels = 1
        const frameCount = audioArray.length / 2 // 16-bit = 2 bytes per sample
        
        if (frameCount === 0) {
          console.warn('No audio frames to play')
          resolve()
          return
        }
        
        const audioBuffer = audioContext.createBuffer(channels, frameCount, sampleRate)
        const channelData = audioBuffer.getChannelData(0)
        
        // Convert 16-bit PCM to float32
        for (let i = 0; i < frameCount; i++) {
          const sample = (audioArray[i * 2] | (audioArray[i * 2 + 1] << 8))
          // Convert from signed 16-bit to float32 (-1 to 1)
          channelData[i] = sample < 32768 ? sample / 32768 : (sample - 65536) / 32768
        }
        
        // Create and configure audio source
        this.currentSource = audioContext.createBufferSource()
        this.currentSource.buffer = audioBuffer
        this.currentSource.connect(audioContext.destination)
        
        // Set playing state
        this.isPlaying = true
        
        this.currentSource.onended = () => {
          this.isPlaying = false
          this.currentSource = null
          resolve()
        }
        
        // Start playback
        this.currentSource.start(0)
        
      } catch (error) {
        console.error('Audio playback error:', error)
        this.isPlaying = false
        this.currentSource = null
        reject(error)
      }
    })
  }

  // Stop current audio and clear queue
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null
    }

    this.audioQueue = []
    this.isPlaying = false
    this.isProcessingQueue = false
  }

  // Check if audio is currently playing
  get playing(): boolean {
    return this.isPlaying
  }
}

// Export singleton instance
export const audioService = new AudioPlaybackService()
