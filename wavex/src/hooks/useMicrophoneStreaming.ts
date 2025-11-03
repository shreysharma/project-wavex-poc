import { useState, useRef, useCallback, useEffect } from 'react'

interface MicrophoneStreamingOptions {
  sampleRate?: number
  chunkSize?: number
  onChunk?: (pcmData: Int16Array) => void
  onError?: (error: Error) => void
  onPermissionGranted?: () => void
  onPermissionDenied?: () => void
}

export const useMicrophoneStreaming = (options: MicrophoneStreamingOptions = {}) => {
  const {
    sampleRate = 16000,
    chunkSize = 2048,
    onChunk,
    onError,
    onPermissionGranted,
    onPermissionDenied
  } = options

  const [isRecording, setIsRecording] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const isRecordingRef = useRef<boolean>(false) // Use ref to avoid closure issues in onaudioprocess

  // Check if microphone permission is already granted
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then(permissionStatus => {
          setHasPermission(permissionStatus.state === 'granted')
          
          // Listen for permission changes
          permissionStatus.onchange = () => {
            setHasPermission(permissionStatus.state === 'granted')
          }
        })
        .catch(err => {
          console.warn('Could not query microphone permission:', err)
        })
    }
  }, [])

  // Request microphone permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      const error = new Error('Media devices not supported in this browser')
      setPermissionError(error.message)
      onError?.(error)
      onPermissionDenied?.()
      return false
    }

    setIsRequestingPermission(true)
    setPermissionError(null)

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Permission granted
      setHasPermission(true)
      setIsRequestingPermission(false)
      onPermissionGranted?.()

      // Stop the stream immediately - we'll create a new one when starting recording
      stream.getTracks().forEach(track => track.stop())

      return true
    } catch (error) {
      const err = error as Error
      let errorMessage = 'Microphone permission denied'
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.'
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.'
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Microphone is already in use by another application.'
      }

      setPermissionError(errorMessage)
      setHasPermission(false)
      setIsRequestingPermission(false)
      onError?.(new Error(errorMessage))
      onPermissionDenied?.()
      
      return false
    }
  }, [sampleRate, onError, onPermissionGranted, onPermissionDenied])

  // Convert Float32Array to Int16Array PCM
  const float32ToInt16 = useCallback((float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]))
      int16Array[i] = Math.round(sample * 32767)
    }
    return int16Array
  }, [])

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    // Check permission first
    if (hasPermission === false || hasPermission === null) {
      const granted = await requestPermission()
      if (!granted) {
        return false
      }
    }

    try {
      // Create new audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      mediaStreamRef.current = stream

      // Create audio context
      const audioContext = new AudioContext({ sampleRate })
      audioContextRef.current = audioContext

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source

      // Create script processor for audio chunks
      const processor = audioContext.createScriptProcessor(chunkSize, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return // Use ref instead of state to avoid closure issues

        const inputData = event.inputBuffer.getChannelData(0)
        const pcmData = float32ToInt16(inputData)
        
        // Send chunk via callback
        onChunk?.(pcmData)
      }

      // Connect the audio graph
      source.connect(processor)
      processor.connect(audioContext.destination)

      setIsRecording(true)
      isRecordingRef.current = true // Also set ref for onaudioprocess callback
      console.log('Microphone recording started')
      return true
    } catch (error) {
      const err = error as Error
      console.error('Failed to start recording:', err)
      onError?.(err)
      return false
    }
  }, [hasPermission, requestPermission, sampleRate, chunkSize, float32ToInt16, onChunk, onError, isRecording])

  // Stop recording
  const stopRecording = useCallback(() => {
    setIsRecording(false)
    isRecordingRef.current = false // Also clear ref

    // Disconnect audio nodes
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current.onaudioprocess = null
      processorRef.current = null
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    console.log('Microphone recording stopped')
  }, [])

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording()
      return false
    } else {
      return await startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording()
      }
    }
  }, [isRecording, stopRecording])

  return {
    isRecording,
    hasPermission,
    isRequestingPermission,
    permissionError,
    startRecording,
    stopRecording,
    toggleRecording,
    requestPermission
  }
}
