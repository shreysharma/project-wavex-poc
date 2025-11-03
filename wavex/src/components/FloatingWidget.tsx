"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./FloatingWidget.module.css";
import orbGif from "../../assets/orbe-blue.gif";
import { useMicrophoneStreaming } from "../hooks/useMicrophoneStreaming";
import { useGlobalConversation } from "../providers/ConversationProvider";
import { apiService } from "../services/apiService";
import { audioService } from "../services/audioService";
import type { StreamResponse } from "../services/apiService";

const FloatingWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [botResponse, setBotResponse] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showChatView, setShowChatView] = useState(false); // Toggle between voice and chat view
  const [textInput, setTextInput] = useState(""); // Text input for chat
  const [isBotTyping, setIsBotTyping] = useState(false); // Show typing indicator
  const panelRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null); // Ref for auto-scrolling chat
  const transcriptRef = useRef<string>(""); // Track transcript to avoid stale closure
  const showChatViewRef = useRef<boolean>(false); // Track chat view state to avoid stale closure

  // Get conversation hook
  const { 
    messages,
    addHumanMessage, 
    updateOrAddBotMessage, 
    finalizeStreamingMessage 
  } = useGlobalConversation();

  // Get microphone streaming hook
  const {
    isRecording: micIsRecording,
    hasPermission,
    isRequestingPermission,
    permissionError,
    startRecording: startMic,
    stopRecording: stopMic,
    requestPermission
  } = useMicrophoneStreaming({
    sampleRate: 16000,
    chunkSize: 2048,
    onChunk: (pcmData) => {
      // Send audio chunk to backend
      console.log('🎤 Sending audio chunk, size:', pcmData.length);
      apiService.sendAudio(pcmData);
    },
    onError: (error) => {
      console.error('Microphone error:', error);
      setRecording(false);
    },
    onPermissionGranted: () => {
      setShowPermissionModal(false);
    },
    onPermissionDenied: () => {
      setShowPermissionModal(true);
    }
  });

  // Close the widget when clicking/tapping outside the panel
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  // Auto-scroll chat to bottom when messages change or typing indicator changes
  useEffect(() => {
    if (showChatView && chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages, isBotTyping, showChatView]);

  // SSE stream message handler
  const handleStreamMessage = (data: StreamResponse) => {
    console.log('📨 SSE EVENT:', JSON.stringify(data, null, 2));

    switch (data.type) {
      case 'connected':
        console.log('✅ Connected to backend');
        setLiveTranscript('');
        transcriptRef.current = '';
        break;

      case 'text_chunk':
        // Streaming text response from bot (for TEXT mode)
        console.log('📝 TEXT_CHUNK received:', data);
        if (data.text) {
          console.log('📝 Text chunk content:', data.text);
          setLiveTranscript(prev => {
            const newText = prev + data.text;
            updateOrAddBotMessage(newText, false);
            return newText;
          });
        }
        break;

      case 'audio_chunk':
        // Play audio response
        console.log('🔊 AUDIO_CHUNK received, length:', data.audio_data?.length || 0);
        if (data.audio_data) {
          audioService.playAudioChunk(data.audio_data);
        }
        break;

      case 'input_transcription':
        // User's speech transcribed - switch to voice view if in chat
        console.log('🎤 INPUT_TRANSCRIPTION:', data);
        console.log('🎤 Current showChatView state:', showChatView);
        console.log('🎤 Current showChatViewRef.current:', showChatViewRef.current);
        if (data.text && data.text.trim()) {
          console.log('🎤 User said:', data.text);
          const userText = data.text.trim();
          
          // Schedule state update outside of render cycle
          setTimeout(() => {
            addHumanMessage(userText);
          }, 0);
          
          setLiveTranscript(''); // Clear for bot response
          setIsBotTyping(true); // Show typing indicator
          
          // Switch to voice view when user starts speaking (use ref to avoid stale closure)
          if (showChatViewRef.current) {
            console.log('✅ Switching from CHAT view to VOICE view');
            setShowChatView(false);
            showChatViewRef.current = false;
          } else {
            console.log('ℹ️ Already in voice view, no switch needed');
          }
        }
        break;

      case 'output_transcription':
        // Bot's audio response transcribed - SHOW THIS TEXT!
        console.log('💬 OUTPUT_TRANSCRIPTION received:', data);
        setIsBotTyping(false); // Hide typing indicator when text starts appearing
        if (data.text && data.text.trim() && data.text !== 'null') {
          console.log('💬 Bot transcription TEXT:', data.text);
          transcriptRef.current += data.text;
          console.log('💬 Accumulated transcript:', transcriptRef.current);
          
          const newText = transcriptRef.current;
          setLiveTranscript(newText);
          
          // Schedule state update outside of render cycle
          setTimeout(() => {
            updateOrAddBotMessage(newText, true);
          }, 0);
        } else {
          console.log('⚠️ Skipping output_transcription - text is:', data.text);
        }
        break;

      case 'turn_complete':
        // Response complete, finalize message
        const finalTranscript = transcriptRef.current;
        console.log('✅ TURN_COMPLETE received');
        console.log('✅ Final transcript from ref:', finalTranscript);
        console.log('✅ has_text flag:', data.has_text);
        if (finalTranscript && finalTranscript.trim() && finalTranscript !== 'null') {
          console.log('✅ Finalizing message with:', finalTranscript);
          
          // Schedule state update outside of render cycle
          setTimeout(() => {
            finalizeStreamingMessage(finalTranscript, true);
          }, 0);
          
          // Keep bot response visible after turn completes
          setBotResponse(finalTranscript);
        } else {
          console.log('⚠️ NOT finalizing - transcript is empty or null');
        }
        setLiveTranscript(''); // Clear live transcript for next turn
        transcriptRef.current = ''; // Reset ref for next turn
        break;

      default:
        console.log('❓ Unknown event type:', data.type);
    }
  };

  // Handle mic toggle
  const handleMicToggle = async () => {
    if (recording) {
      // Stop recording
      stopMic();
      setRecording(false);
      setLiveTranscript("");
      
      // Disconnect from API
      await apiService.disconnect();
      audioService.stop();
    } else {
      // Check permission first
      if (hasPermission === false || hasPermission === null) {
        setShowPermissionModal(true);
        const granted = await requestPermission();
        if (!granted) {
          return;
        }
      }

      setIsConnecting(true);
      
      // Connect to backend with AUDIO mode
      const connected = await apiService.connect('AUDIO');
      if (!connected) {
        console.error('Failed to connect to backend');
        setIsConnecting(false);
        return;
      }

      // Start SSE stream with the SAME handler as text chat
      await apiService.startEventStream(handleStreamMessage);

      // Clear transcript for new recording
      setLiveTranscript("");
      setBotResponse("");
      transcriptRef.current = "";

      // Start microphone - audio chunks will be sent via onChunk callback
      const started = await startMic();
      if (started) {
        setRecording(true);
        console.log('🎤 Microphone started, audio chunks will be sent to backend');
      }
      
      setIsConnecting(false);
    }
  };

  // Handle text input send
    const handleTextSend = async () => {
    const trimmedText = textInput.trim();
    if (!trimmedText) return;

    // Add user message to conversation
    addHumanMessage(trimmedText);

    // Clear input
    setTextInput("");

    // Switch to chat view to show conversation
    setShowChatView(true);
    showChatViewRef.current = true; // Update ref too
    setIsBotTyping(true); // Show typing indicator immediately

    try {
      // Always disconnect and reconnect to ensure fresh session
      if (apiService.connected) {
        await apiService.disconnect();
      }
      
      // Connect with AUDIO mode - it sends BOTH audio AND transcription!
      setIsConnecting(true);
      const connected = await apiService.connect("AUDIO"); // AUDIO mode includes transcriptions!
      
      if (!connected) {
        console.error('Failed to connect to backend');
        setIsConnecting(false);
        return;
      }
      
      // Start SSE event stream to receive responses
      await apiService.startEventStream(handleStreamMessage);
      setIsConnecting(false);

      // Clear any existing transcript
      setLiveTranscript("");
      setBotResponse("");
      transcriptRef.current = "";

      // Send text to backend - response will come through SSE stream
      await apiService.sendText(trimmedText);
      console.log('Text message sent, waiting for response...');

      // Start microphone automatically after sending text
      // This allows the user to speak next without clicking mic button
      
      // Check and request permission if needed
      if (hasPermission === false || hasPermission === null) {
        console.log('🎤 Requesting microphone permission for auto-start...');
        const granted = await requestPermission();
        if (!granted) {
          console.log('⚠️ Microphone permission denied, cannot auto-start');
          return;
        }
      }

      const started = await startMic();
      if (started) {
        setRecording(true);
        console.log('🎤 Microphone auto-started after text send, recording:', true);
      } else {
        console.log('❌ Failed to auto-start microphone');
      }

    } catch (error) {
      console.error("Error sending text:", error);
      setIsConnecting(false);
    }
  };

  // Handle input key press
  const handleInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTextSend();
    }
  };

  // Handle clear input
  const handleClearInput = () => {
    setTextInput('');
  };

  // Display text in widget
  const getDisplayText = () => {
    if (isConnecting) return "Connecting...";
    if (recording && liveTranscript) return liveTranscript;
    if (botResponse) return botResponse;
    return "Namaste, main VidyaSetu hu. Sun raha hoon — ab bolen.";
  };

  return (
    <div className={styles.floatingWidget}>
      {!open && (
        <button
          className={styles.widgetButton}
          onClick={() => setOpen(true)}
          aria-label="Open chat widget"
          title="Open chat"
        >
          <span className={styles.vsText}>VS</span>
        </button>
      )}

      <div
        ref={panelRef}
        className={`${styles.panel} ${open ? styles.panelVisible : styles.panelHidden}`}
        role="dialog"
        aria-hidden={!open}
      >
        <div className={styles.panelHeader}>
          <div className={styles.panelHeaderLeft}>
            <div className={styles.panelHeaderText}>VidyaSetu</div>
          </div>

          <div className={styles.panelHeaderRight}>
            <div className={styles.panelHeaderLogo} aria-hidden="true">
              {/* Provided 50x28 logo SVG (blue rounded rect with white type) */}
              <svg width="50" height="28" viewBox="0 0 50 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M0 8C0 3.58172 3.58172 0 8 0H42C46.4183 0 50 3.58172 50 8V20C50 24.4183 46.4183 28 42 28H8C3.58172 28 0 24.4183 0 20V8Z" fill="#3840EB"/>
                <path d="M13.082 19H11.542V10.334H8.266V8.948H16.358V10.334H13.082V19ZM21.4004 15.948V11.58H22.8144V19H21.4984V17.824C21.1064 18.594 20.2384 19.14 19.2304 19.14C17.7324 19.14 16.6964 18.258 16.6964 16.354V11.58H18.1104V16.074C18.1104 17.362 18.7544 17.894 19.6784 17.894C20.6304 17.894 21.4004 17.11 21.4004 15.948ZM28.6841 17.628V18.874C28.2501 19.07 27.8721 19.14 27.4241 19.14C26.0521 19.14 25.1001 18.398 25.1001 16.76V12.784H23.4621V11.58H25.1001V9.382H26.5141V11.58H28.7541V12.784H26.5141V16.438C26.5141 17.46 27.0041 17.824 27.7601 17.824C28.0961 17.824 28.3901 17.768 28.6841 17.628ZM32.7265 19.14C30.6265 19.14 29.0865 17.488 29.0865 15.29C29.0865 13.092 30.6265 11.44 32.7265 11.44C34.8265 11.44 36.3665 13.092 36.3665 15.29C36.3665 17.488 34.8265 19.14 32.7265 19.14ZM32.7265 17.894C33.9445 17.894 34.9105 16.914 34.9105 15.29C34.9105 13.666 33.9445 12.7 32.7265 12.7C31.5085 12.7 30.5565 13.666 30.5565 15.29C30.5565 16.914 31.5085 17.894 32.7265 17.894ZM38.942 15.206V19H37.528V11.58H38.844V13.148C39.362 12.126 40.482 11.482 41.7 11.482V12.952C40.104 12.868 38.942 13.568 38.942 15.206Z" fill="white"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Main content area - toggle between voice view and chat view */}
        {!showChatView ? (
          /* Voice View */
          <>
            <div className={styles.avatarWrapper}>
              {/* Purple ring SVG placed behind the GIF */}
              <div className={styles.orbRing} aria-hidden="true">
                <svg width="181" height="181" viewBox="0 0 181 181" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
                  <mask id="path-1-inside-1_122_1752" fill="white">
                    <path d="M181 90.5C181 140.482 140.482 181 90.5 181C40.5182 181 0 140.482 0 90.5C0 40.5182 40.5182 0 90.5 0C140.482 0 181 40.5182 181 90.5ZM9.955 90.5C9.955 134.984 46.0162 171.045 90.5 171.045C134.984 171.045 171.045 134.984 171.045 90.5C171.045 46.0162 134.984 9.955 90.5 9.955C46.0162 9.955 9.955 46.0162 9.955 90.5Z"/>
                  </mask>
                  <path d="M181 90.5C181 140.482 140.482 181 90.5 181C40.5182 181 0 140.482 0 90.5C0 40.5182 40.5182 0 90.5 0C140.482 0 181 40.5182 181 90.5ZM9.955 90.5C9.955 134.984 46.0162 171.045 90.5 171.045C134.984 171.045 171.045 134.984 171.045 90.5C171.045 46.0162 134.984 9.955 90.5 9.955C46.0162 9.955 9.955 46.0162 9.955 90.5Z" fill="#705EFB" stroke="#989CFF" strokeWidth="4" mask="url(#path-1-inside-1_122_1752)"/>
                </svg>
              </div>

              <div className={styles.avatarInner}>
                {/* GIF placed inside the circular avatar. Handle Next static import object shape. */}
                {(() => {
                  const src = typeof orbGif === 'string' ? orbGif : (orbGif && (orbGif as any).src) || '';
                  return <img src={src} alt="orb" className={styles.avatarImg} />;
                })()}
              </div>
            </div>

            <div className={styles.helperText}>
              {getDisplayText()}
            </div>
          </>
        ) : (
          /* Chat View */
          <div className={styles.chatContainer}>
            <div ref={chatMessagesRef} className={styles.chatMessages}>
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={msg.type === 'human' ? styles.messageHuman : styles.messageBot}
                >
                  <div className={styles.messageBubble}>
                    {msg.content}
                  </div>
                </div>
              ))}
              
              {/* Typing indicator */}
              {isBotTyping && (
                <div className={styles.messageBot}>
                  <div className={styles.messageBubble}>
                    <div className={styles.typingIndicator}>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.footer}>
          <button 
            className={styles.iconBtn} 
            onClick={handleClearInput}
            aria-label="Clear input" 
            title="Clear input"
          >
            {/* small cross icon, reusing same cross box scaled down */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 6L18 18M6 18L18 6" stroke="#747474" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div className={styles.inputBox}>
            <input 
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type here" 
              aria-label="Message input"
              onKeyPress={handleInputKeyPress}
            />
          </div>

          <button
            className={`${styles.micAction} ${recording ? styles.micActionActive : ""}`}
            onClick={textInput.trim() ? handleTextSend : handleMicToggle}
            disabled={isConnecting}
            aria-label={textInput.trim() ? "Send message" : (recording ? "Stop voice input" : "Start voice input")}
            aria-pressed={recording}
            title={textInput.trim() ? "Send" : (recording ? "Stop" : "Voice")}
          >
            {textInput.trim() ? (
              /* Send icon (paper plane) when there's text */
              <svg width="43" height="43" viewBox="0 0 43 43" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="0.542987" y="0.542987" width="41.6718" height="41.6718" rx="9.45701" fill="white"/>
                <path d="M29.5 13.5L19 21.5M29.5 13.5L24.5 29.5L19 21.5M29.5 13.5L13.5 18.5L19 21.5" stroke="#3840EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              /* Mic icon when no text */
              <svg width="43" height="43" viewBox="0 0 43 43" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="0.542987" y="0.542987" width="41.6718" height="41.6718" rx="9.45701" fill="white"/>
                <rect x="0.542987" y="0.542987" width="41.6718" height="41.6718" rx="9.45701" stroke="none" strokeWidth="1.08597"/>
                <path d="M28.3789 19.3789V21.3789C28.3789 25.2449 25.2449 28.3789 21.3789 28.3789M14.3789 19.3789V21.3789C14.3789 25.2449 17.5129 28.3789 21.3789 28.3789M21.3789 28.3789V31.3789M17.3789 31.3789H25.3789M21.3789 24.3789C19.722 24.3789 18.3789 23.0358 18.3789 21.3789V14.3789C18.3789 12.7221 19.722 11.3789 21.3789 11.3789C23.0357 11.3789 24.3789 12.7221 24.3789 14.3789V21.3789C24.3789 23.0358 23.0357 24.3789 21.3789 24.3789Z" stroke="#747474" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        {/* Microphone Permission Modal */}
        {showPermissionModal && (
          <div className={styles.permissionModal}>
            <div className={styles.permissionContent}>
              <h3 className={styles.permissionTitle}>
                🎤 Microphone Access Required
              </h3>
              <p className={styles.permissionText}>
                {permissionError || "VidyaSetu needs access to your microphone to listen to your voice commands."}
              </p>
              <div className={styles.permissionButtons}>
                <button
                  className={styles.permissionButtonPrimary}
                  onClick={async () => {
                    const granted = await requestPermission();
                    if (granted) {
                      setShowPermissionModal(false);
                    }
                  }}
                  disabled={isRequestingPermission}
                >
                  {isRequestingPermission ? "Requesting..." : "Allow Microphone"}
                </button>
                <button
                  className={styles.permissionButtonSecondary}
                  onClick={() => setShowPermissionModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FloatingWidget;
