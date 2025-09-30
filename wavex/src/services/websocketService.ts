interface STTConnection {
  ws: WebSocket;
  language: {
    code: string;
    name: string;
  };
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectAttempts: number;
  lastConnectTime: number;
  isReconnecting: boolean;
}

interface WebSocketServiceEvents {
  onConnectionStatusChange: (connected: number, total: number) => void;
  onTranscriptionReceived: (language: string, data: any) => void;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private connections: STTConnection[] = [];
  private events: WebSocketServiceEvents | null = null;
  private maxReconnectAttempts = 10; // Increased from 5 to 10
  private baseReconnectDelay = 1000; // 1 second
  private maxReconnectDelay = 30000; // 30 seconds max
  private currentInputLanguage = 'hi';
  private isAutoReconnectEnabled = true;
  private connectionHealthCheckInterval: NodeJS.Timeout | null = null;

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
    
    this.currentInputLanguage = inputLanguage;
    this.isAutoReconnectEnabled = true; // Enable auto-reconnect when connecting

    // Close existing connections
    this.disconnectAll();

    // Start connection health check
    this.startConnectionHealthCheck();

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
      const wsUrl = `${protocol}//wavex-poc-infra-dev-l2clzohaha-uc.a.run.app/stt-test`;
      console.log(`Connecting to STT WebSocket for ${language.name}: ${wsUrl}`);

      const ws = new WebSocket(wsUrl);

      const connection: STTConnection = {
        ws,
        language,
        status: 'connecting',
        reconnectAttempts: 0,
        lastConnectTime: Date.now(),
        isReconnecting: false
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

          // Auto-reconnect for connection issues
          if (this.shouldReconnect(event.code, connection)) {
            console.log(`[${language.name}] Connection lost (code: ${event.code}) - initiating reconnection`);
            this.scheduleReconnection(connection);
          }
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          connection.status = 'error';
          console.error(`STT WebSocket error for ${language.name}:`, error);
          this.updateConnectionStatus();
          
          // Schedule reconnection on error if not already reconnecting
          if (!connection.isReconnecting && connection.reconnectAttempts < this.maxReconnectAttempts) {
            console.log(`[${language.name}] Error occurred - scheduling reconnection`);
            this.scheduleReconnection(connection);
          }
          
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Failed to create STT connection for ${language.name}:`, error);
      throw error;
    }
  }

  private shouldReconnect(closeCode: number, connection: STTConnection): boolean {
    // Don't reconnect if auto-reconnect is disabled
    if (!this.isAutoReconnectEnabled) {
      return false;
    }

    // Don't reconnect if already reconnecting or max attempts reached
    if (connection.isReconnecting || connection.reconnectAttempts >= this.maxReconnectAttempts) {
      return false;
    }

    // Don't reconnect if user manually closed (code 1000)
    if (closeCode === 1000) {
      return false;
    }

    // Reconnect for these codes (expanded list for better coverage):
    // 1011 - Internal server error (Deepgram timeout)
    // 1006 - Abnormal closure (network issues)
    // 1001 - Going away (server restart)
    // 1005 - No status code (unexpected close)
    // 1002 - Protocol error
    // 1003 - Unsupported data
    const reconnectCodes = [1011, 1006, 1001, 1005, 1002, 1003];
    const shouldReconnect = reconnectCodes.includes(closeCode);
    
    console.log(`[${connection.language.name}] Should reconnect for close code ${closeCode}: ${shouldReconnect}`);
    return shouldReconnect;
  }

  private scheduleReconnection(connection: STTConnection): void {
    if (connection.isReconnecting || !this.isAutoReconnectEnabled) {
      return;
    }

    connection.isReconnecting = true;
    connection.reconnectAttempts++;

    // Exponential backoff with jitter and max cap: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const baseDelay = this.baseReconnectDelay * Math.pow(2, connection.reconnectAttempts - 1);
    const cappedDelay = Math.min(baseDelay, this.maxReconnectDelay);
    // Add jitter (±25%) to avoid thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    const delay = Math.max(1000, cappedDelay + jitter);
    
    console.log(`[${connection.language.name}] Scheduling reconnection attempt ${connection.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms`);

    setTimeout(async () => {
      try {
        await this.reconnectLanguage(connection);
      } catch (error) {
        console.error(`[${connection.language.name}] Reconnection attempt ${connection.reconnectAttempts} failed:`, error);
        connection.isReconnecting = false;
        
        // Schedule next attempt if we haven't exceeded max attempts and auto-reconnect is still enabled
        if (connection.reconnectAttempts < this.maxReconnectAttempts && this.isAutoReconnectEnabled) {
          this.scheduleReconnection(connection);
        } else {
          console.error(`[${connection.language.name}] Max reconnection attempts reached or auto-reconnect disabled. Stopping.`);
        }
      }
    }, delay);
  }

  private async reconnectLanguage(connection: STTConnection): Promise<void> {
    console.log(`[${connection.language.name}] Attempting reconnection (attempt ${connection.reconnectAttempts}/${this.maxReconnectAttempts})`);

    // Close old connection if still open
    if (connection.ws.readyState === WebSocket.OPEN || connection.ws.readyState === WebSocket.CONNECTING) {
      connection.ws.close();
    }

    // Remove old connection from array
    const connectionIndex = this.connections.findIndex(conn => conn.language.code === connection.language.code);
    if (connectionIndex !== -1) {
      this.connections.splice(connectionIndex, 1);
    }

    try {
      await this.createConnection(connection.language, this.currentInputLanguage);
      console.log(`[${connection.language.name}] Successfully reconnected on attempt ${connection.reconnectAttempts}`);
      
      // Reset reconnect attempts on successful connection
      const newConnection = this.connections.find(conn => conn.language.code === connection.language.code);
      if (newConnection) {
        newConnection.reconnectAttempts = 0;
        newConnection.isReconnecting = false;
      }
    } catch (error) {
      console.error(`[${connection.language.name}] Reconnection attempt failed:`, error);
      throw error;
    }
  }

  private updateConnectionStatus() {
    const connectedCount = this.getConnectedCount();
    const totalCount = this.allLanguages.length; // Use target language count (13)
    this.events?.onConnectionStatusChange(connectedCount, totalCount);
  }

  getConnectedCount(): number {
    return this.connections.filter(conn => conn.status === 'connected').length;
  }

  getConnectionStatus(): { connected: number; total: number; isFullyConnected: boolean } {
    const connected = this.getConnectedCount();
    const total = this.allLanguages.length;
    return {
      connected,
      total,
      isFullyConnected: connected === total
    };
  }

  startStreaming(): void {
    const connectedSockets = this.connections.filter(conn =>
      conn.status === 'connected' && conn.ws.readyState === WebSocket.OPEN
    );

    connectedSockets.forEach(({ ws, language }) => {
      try {
        // Send language_settings to trigger streaming start (this is what backend expects)
        ws.send(JSON.stringify({
          type: 'language_settings',
          input_language: 'hi', // Hindi input
          output_language: language.code // Target language for this connection
        }));
        console.log(`Sent language_settings to start streaming for ${language.name}: hi → ${language.code}`);
      } catch (error) {
        console.error(`Failed to send language_settings to ${language.name}:`, error);
      }
    });
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
    
    // Disable auto-reconnect during manual disconnect
    this.isAutoReconnectEnabled = false;
    
    // Stop health check
    this.stopConnectionHealthCheck();
    
    this.connections.forEach(({ ws, language }) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Manual disconnect'); // Use code 1000 for clean close
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

  // Force reconnect all connections (useful for translate button in audio mode)
  async forceReconnectAll(): Promise<void> {
    console.log('[FORCE RECONNECT] Restarting all WebSocket connections...');
    
    // Reset reconnect attempts for all connections
    this.connections.forEach(conn => {
      conn.reconnectAttempts = 0;
      conn.isReconnecting = false;
    });
    
    // Reconnect with current language
    await this.connectAll(this.currentInputLanguage);
  }

  // Connection health check - periodically check and reconnect dead connections
  private startConnectionHealthCheck(): void {
    this.stopConnectionHealthCheck(); // Clear any existing interval
    
    this.connectionHealthCheckInterval = setInterval(() => {
      if (!this.isAutoReconnectEnabled) return;
      
      const deadConnections = this.connections.filter(conn => 
        conn.ws.readyState === WebSocket.CLOSED && 
        !conn.isReconnecting && 
        conn.reconnectAttempts < this.maxReconnectAttempts
      );
      
      if (deadConnections.length > 0) {
        console.log(`[HEALTH CHECK] Found ${deadConnections.length} dead connections, attempting to revive...`);
        deadConnections.forEach(conn => {
          this.scheduleReconnection(conn);
        });
      }
    }, 15000); // Check every 15 seconds
  }

  private stopConnectionHealthCheck(): void {
    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
      this.connectionHealthCheckInterval = null;
    }
  }

  // Get connection health status
  getConnectionHealth(): { healthy: number; dead: number; reconnecting: number } {
    const healthy = this.connections.filter(conn => conn.status === 'connected').length;
    const dead = this.connections.filter(conn => conn.status === 'disconnected' || conn.status === 'error').length;
    const reconnecting = this.connections.filter(conn => conn.isReconnecting).length;
    
    return { healthy, dead, reconnecting };
  }
}