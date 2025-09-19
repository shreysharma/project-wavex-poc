interface STTConnection {
  ws: WebSocket;
  language: {
    code: string;
    name: string;
  };
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

interface WebSocketServiceEvents {
  onConnectionStatusChange: (connected: number, total: number) => void;
  onTranscriptionReceived: (language: string, data: any) => void;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private connections: STTConnection[] = [];
  private events: WebSocketServiceEvents | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  private readonly allLanguages = [
    { code: 'hi', name: 'Hindi' },
    { code: 'en', name: 'English' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'bn', name: 'Bengali' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'ur', name: 'Urdu' },
    { code: 'or', name: 'Odia' },
    { code: 'as', name: 'Assamese' },
  ];

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  setEventHandlers(events: WebSocketServiceEvents) {
    this.events = events;
  }

  async connectAll(inputLanguage: string): Promise<void> {
    console.log(`Starting STT WebSocket connections with input language: ${inputLanguage}`);

    // Close existing connections
    this.disconnectAll();

    // Get all languages (including input language for original transcription)
    const targetLanguages = this.allLanguages; // Include ALL 13 languages
    console.log(`Connecting to ${targetLanguages.length} languages (including input):`, targetLanguages.map(l => l.name).join(', '));

    // Create new connections for target languages
    const connectionPromises = targetLanguages.map(async (lang) => {
      return this.createConnection(lang, inputLanguage);
    });

    await Promise.all(connectionPromises);
    console.log(`STT WebSocket initialization complete. Connected: ${this.getConnectedCount()}/${targetLanguages.length}`);
  }

  private async createConnection(language: { code: string; name: string }, inputLanguage: string): Promise<void> {
    try {
      // Use the same WebSocket URL pattern as index.html
      const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:8000/stt-test`;
      console.log(`Connecting to STT WebSocket for ${language.name}: ${wsUrl}`);

      const ws = new WebSocket(wsUrl);

      const connection: STTConnection = {
        ws,
        language,
        status: 'connecting'
      };

      this.connections.push(connection);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          connection.status = 'error';
          reject(new Error(`Connection timeout for ${language.name}`));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          connection.status = 'connected';
          console.log(`STT WebSocket connected for ${language.name}`);

          // Send language settings immediately (like index.html)
          ws.send(JSON.stringify({
            type: 'language_settings',
            input_language: inputLanguage,
            output_language: language.code
          }));
          console.log(`Sent language settings for ${language.name}: ${inputLanguage} → ${language.code}`);

          this.updateConnectionStatus();
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log(`STT data received from ${language.name}:`, data);
            this.events?.onTranscriptionReceived(language.code, data);
          } catch (error) {
            console.error(`Error parsing STT message from ${language.name}:`, error);
          }
        };

        ws.onclose = (event) => {
          connection.status = 'disconnected';
          console.log(`STT WebSocket disconnected for ${language.name}:`, event.code, event.reason);
          this.updateConnectionStatus();

          // Auto-reconnect for Deepgram timeout errors (1011) only if we have active audio processing
          if (event.code === 1011) {
            console.log(`[${language.name}] Deepgram timeout detected`);

            // Only reconnect if we're actively processing audio
            if (this.hasActiveAudioProcessing()) {
              console.log(`[${language.name}] Active audio processing detected - auto-reconnecting in 2 seconds`);
              setTimeout(() => {
                this.reconnectLanguage(language, inputLanguage);
              }, 2000);
            } else {
              console.log(`[${language.name}] No active audio processing - skipping reconnection`);
            }
          }
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          connection.status = 'error';
          console.error(`STT WebSocket error for ${language.name}:`, error);
          this.updateConnectionStatus();
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Failed to create STT connection for ${language.name}:`, error);
      throw error;
    }
  }

  private async reconnectLanguage(language: { code: string; name: string }, inputLanguage: string) {
    console.log(`Attempting to reconnect ${language.name} after Deepgram timeout`);

    // Remove old connection
    this.connections = this.connections.filter(conn => conn.language.code !== language.code);

    try {
      await this.createConnection(language, inputLanguage);
      console.log(`[${language.name}] Successfully reconnected after timeout`);
    } catch (error) {
      console.error(`[${language.name}] Reconnection failed:`, error);
    }
  }

  private updateConnectionStatus() {
    const connectedCount = this.getConnectedCount();
    const totalCount = this.connections.length; // Use actual connection count instead of fixed 12
    this.events?.onConnectionStatusChange(connectedCount, totalCount);
  }

  getConnectedCount(): number {
    return this.connections.filter(conn => conn.status === 'connected').length;
  }

  getConnectionStatus(): { connected: number; total: number; isFullyConnected: boolean } {
    const connected = this.getConnectedCount();
    const total = this.targetLanguages.length;
    return {
      connected,
      total,
      isFullyConnected: connected === total
    };
  }

  sendAudioData(audioData: ArrayBuffer): void {
    const connectedSockets = this.connections.filter(conn =>
      conn.status === 'connected' && conn.ws.readyState === WebSocket.OPEN
    );

    connectedSockets.forEach(({ ws, language }) => {
      try {
        ws.send(audioData);
      } catch (error) {
        console.error(`Failed to send audio data to ${language.name}:`, error);
      }
    });
  }

  disconnectAll(): void {
    console.log('Disconnecting all STT WebSocket connections...');
    this.connections.forEach(({ ws, language }) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        console.log(`Disconnected STT WebSocket for ${language.name}`);
      }
    });
    this.connections = [];
    this.updateConnectionStatus();
  }

  getConnections(): STTConnection[] {
    return [...this.connections];
  }

  private hasActiveAudioProcessing(): boolean {
    // Check if there's any active audio streaming or processing
    // This could be based on whether audio files are selected or streaming is active
    return typeof window !== 'undefined' &&
           (document.querySelector('audio:not([paused])') !== null ||
            document.querySelector('[data-audio-processing="active"]') !== null);
  }

  setAudioProcessingActive(active: boolean): void {
    if (typeof window !== 'undefined') {
      if (active) {
        document.body.setAttribute('data-audio-processing', 'active');
      } else {
        document.body.removeAttribute('data-audio-processing');
      }
    }
  }
}