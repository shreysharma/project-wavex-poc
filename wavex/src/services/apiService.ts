/* eslint-disable @typescript-eslint/no-explicit-any */
// API service for Gemini Live backend integration
// Handles all communication with the Python backend

import { fetchEventSource } from "@microsoft/fetch-event-source";

interface ConnectRequest {
  response_modalities: string[];
  system_instructions: string;
}

interface SendTextRequest {
  text: string;
}

interface SendAudioRequest {
  audio_data: string;
}

interface SendImageRequest {
  image_data: string;
}

export interface ProductLink {
  url: string;
  title: string;
  company?: string;
  companyName?: string;
  city?: string;
  rating?: string;
  supplier_rating?: number;
  source?: string;
  image_url?: string;
  product_url?: string;
}

export interface StreamResponse {
  type: string;
  text?: string;
  audio_data?: string;
  chunk_number?: number;
  chunk_size?: number;
  function_name?: string;
  links?: ProductLink[];
  has_text?: boolean;
  timestamp?: number;
}

class ApiService {
  private baseUrl: string;
  private isConnected = false;
  private streamConnectionChecker: (() => boolean) | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    // Use environment variable or default
    this.baseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  }

  // Set stream connection checker function
  setStreamConnectionChecker(checker: () => boolean) {
    this.streamConnectionChecker = checker;
  }

  // Check if stream is connected
  private canMakeApiCalls(): boolean {
    if (!this.streamConnectionChecker) return true;
    return this.streamConnectionChecker();
  }

  // Get headers with JWT token and API key
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Add API key if available
    if (process.env.NEXT_PUBLIC_API_KEY) {
      headers["x-api-key"] = process.env.NEXT_PUBLIC_API_KEY;
    }

    // Add JWT token if available
    const token = typeof window !== 'undefined' ? localStorage.getItem('wavex_jwt_token') : null;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  // Health check for API availability
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Connect to Gemini Live API
  async connect(
    responseModality: "AUDIO" | "TEXT" = "AUDIO"
  ): Promise<boolean> {
    try {
      const systemInstructions = this.getSystemInstructionsForModality(responseModality);

      const response = await fetch(`${this.baseUrl}/connect`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          response_modalities: [responseModality],
          system_instructions: systemInstructions,
        } as ConnectRequest),
      });

      if (response.status === 401) {
        const errorData = await response.json();
        if (errorData?.detail) {
          console.error('Authentication error:', errorData.detail);
          return false;
        }
      }

      if (response.ok) {
        this.isConnected = true;
        return true;
      } else {
        console.error('Connection failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }

  // Disconnect from API
  async disconnect(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/disconnect`, {
        method: "POST",
        headers: this.getHeaders(),
      });

      if (response.status === 401) {
        const errorData = await response.json();
        if (errorData?.detail) {
          console.error('Disconnect auth error:', errorData.detail);
        }
      }

      this.isConnected = false;

      // Close SSE connection
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  // Send text message
  async sendText(text: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error("Not connected to API");
    }
    if (!this.canMakeApiCalls()) {
      throw new Error("Stream disconnected");
    }

    try {
      const response = await fetch(`${this.baseUrl}/send_text`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ text } as SendTextRequest),
      });

      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            const errorData = JSON.parse(errorBody);
            errorDetail = errorData.detail || errorBody;
          }
        } catch {
          // Use status text if parsing fails
        }
        console.error('Send text error:', errorDetail);
      }
    } catch (error) {
      console.error('Send text failed:', error);
    }
  }

  // Send audio chunk
  async sendAudio(pcmData: Int16Array): Promise<void> {
    console.log('sendAudio called, isConnected:', this.isConnected, 'canMakeApiCalls:', this.canMakeApiCalls());
    
    if (!this.isConnected) {
      console.warn('⚠️ Cannot send audio - not connected!');
      return;
    }
    if (!this.canMakeApiCalls()) {
      console.warn('⚠️ Cannot send audio - stream disconnected!');
      return;
    }

    try {
      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(pcmData.buffer))
      );

      console.log('📤 Sending audio chunk to backend, size:', pcmData.length);

      const response = await fetch(`${this.baseUrl}/send_audio`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ audio_data: base64Audio } as SendAudioRequest),
      });

      if (response.status === 401) {
        const errorData = await response.json();
        if (errorData?.detail) {
          console.error('Audio auth error:', errorData.detail);
          return;
        }
      }

      if (!response.ok && response.status !== 500) {
        console.error('Audio send error:', response.status);
      } else {
        console.log('✅ Audio chunk sent successfully');
      }
    } catch (error) {
      // Silently handle audio errors to avoid spam
      console.error('❌ Audio send failed:', error);
    }
  }

  // Send image frame
  async sendImage(base64Image: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const response = await fetch(`${this.baseUrl}/send_image`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ image_data: base64Image } as SendImageRequest),
      });

      if (!response.ok) {
        console.debug('Image send error:', response.status);
      }
    } catch (error) {
      console.debug('Image send failed:', error);
    }
  }

  // Start Server-Sent Events stream
  startEventStream(onMessage: (data: StreamResponse) => void): void {
    // Close any existing stream first
    this.closeEventStream();
    
    // Create new abort controller for this stream
    this.abortController = new AbortController();
    
    const headers = this.getHeaders() as Record<string, string>;
    const token = typeof window !== 'undefined' ? localStorage.getItem('wavex_jwt_token') : null;

    // Add token and API key as query parameters
    const url = new URL(`${this.baseUrl}/stream_responses`);
    if (token) {
      url.searchParams.append('token', token);
    }
    if (process.env.NEXT_PUBLIC_API_KEY) {
      url.searchParams.append('api_key', process.env.NEXT_PUBLIC_API_KEY);
    }

    // Store reference to this for callback context
    const self = this;

    fetchEventSource(url.toString(), {
      signal: this.abortController.signal,
      headers: {
        Authorization: headers.Authorization || "",
      },
      method: "GET",
      async onopen(res) {
        if (
          res.ok &&
          res.headers.get("content-type")?.includes("text/event-stream")
        ) {
          console.log('SSE stream opened');
        } else {
          throw new Error(`Unexpected response: ${res.status}`);
        }
      },
      onmessage(msg) {
        try {
          const data = JSON.parse(msg.data) as StreamResponse;
          onMessage(data);
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      },
      onclose() {
        console.log('SSE stream closed');
      },
      onerror(err) {
        console.error('SSE connection error:', err);
        // Auto-reconnect after delay
        setTimeout(() => {
          console.log('Reconnecting SSE...');
          self.startEventStream(onMessage);
        }, 2000);
      },
    });
  }

  // Close event stream
  closeEventStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // Get system instructions based on modality
  private getSystemInstructionsForModality(modality: "AUDIO" | "TEXT"): string {
    const baseInstructions = `You are VidyaSetu, a helpful AI assistant for education and learning support. Your role is to help users with their questions and provide clear, accurate information.

WORKFLOW:
1. Listen to the user's question or request
2. Provide helpful, accurate responses
3. Be conversational and friendly
4. Keep responses concise and to the point

CRITICAL LANGUAGE REQUIREMENTS - FOLLOW STRICTLY:
- You MUST respond ONLY in Hindi or English - NEVER use any other language
- If user speaks in Hindi → You MUST respond in Hindi ONLY
- If user speaks in English → You MUST respond in English ONLY
- NEVER mix languages or respond in a different language than the user
- If user speaks any other language → Politely ask them to communicate in Hindi or English only
- This is a strict requirement - NO EXCEPTIONS`;

    if (modality === "AUDIO") {
      return (
        baseInstructions +
        `

AUDIO RESPONSE GUIDELINES:
- Since your response will be spoken aloud, keep it conversational and natural
- Avoid special characters, bullet points, asterisks, or complex formatting
- Use simple punctuation only (periods, commas, question marks)
- Keep responses concise and to the point while being helpful
- Use natural speech patterns and transitions
- When listing items, use words like "first", "second", "also", "and" instead of symbols
- Speak numbers clearly (say "twenty dollars" not "$20")
- Avoid multiple questions in one response
- Be warm and professional in your tone as if speaking to a student or learner
- IMPORTANT: Always provide clear, readable transcription with your audio responses for subtitle display`
      );
    } else {
      return baseInstructions;
    }
  }

  // Check if connected
  get connected(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
export const apiService = new ApiService();
