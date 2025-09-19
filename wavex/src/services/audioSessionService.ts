interface AudioChunk {
  id: string;
  sessionId: string;
  languageCode: string;
  sequenceNumber: number;
  audio_data: string;
  timestamp: number;
}

interface TranscriptChunk {
  id: string;
  sessionId: string;
  languageCode: string;
  sequenceNumber: number;
  original_text: string;
  translated_text: string;
  latency: number;
  is_final: boolean;
  confidence?: number;
  timestamp: number;
}

interface AudioSession {
  id: string;
  languageCode: string;
  languageName: string;
  startTime: number;
  isActive: boolean;
  audioChunks: AudioChunk[];
  transcriptChunks: TranscriptChunk[];
  lastSequenceNumber: number;
}

interface AudioSessionEvents {
  onAudioChunkAdded: (sessionId: string, languageCode: string, chunk: AudioChunk) => void;
  onTranscriptChunkAdded: (sessionId: string, languageCode: string, chunk: TranscriptChunk) => void;
  onSessionComplete: (sessionId: string, languageCode: string) => void;
}

export class AudioSessionService {
  private static instance: AudioSessionService;
  private sessions: Map<string, AudioSession> = new Map();
  private languageSessions: Map<string, string> = new Map(); // languageCode -> current sessionId
  private events: AudioSessionEvents | null = null;

  private constructor() {}

  static getInstance(): AudioSessionService {
    if (!AudioSessionService.instance) {
      AudioSessionService.instance = new AudioSessionService();
    }
    return AudioSessionService.instance;
  }

  setEventHandlers(events: AudioSessionEvents) {
    this.events = events;
  }

  createSession(languageCode: string, languageName: string): string {
    const sessionId = `session-${languageCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: AudioSession = {
      id: sessionId,
      languageCode,
      languageName,
      startTime: Date.now(),
      isActive: true,
      audioChunks: [],
      transcriptChunks: [],
      lastSequenceNumber: 0
    };

    this.sessions.set(sessionId, session);
    this.languageSessions.set(languageCode, sessionId);

    console.log(`[AUDIO SESSION] Created session ${sessionId} for ${languageName}`);
    return sessionId;
  }

  addAudioChunk(languageCode: string, audioData: string): void {
    const sessionId = this.languageSessions.get(languageCode);
    if (!sessionId) {
      console.error(`[AUDIO SESSION] No active session for ${languageCode}`);
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[AUDIO SESSION] Session ${sessionId} not found`);
      return;
    }

    const chunk: AudioChunk = {
      id: `audio-${sessionId}-${session.lastSequenceNumber + 1}`,
      sessionId,
      languageCode,
      sequenceNumber: session.lastSequenceNumber + 1,
      audio_data: audioData,
      timestamp: Date.now()
    };

    session.audioChunks.push(chunk);
    session.lastSequenceNumber++;

    console.log(`[${languageCode.toUpperCase()}] Added audio chunk #${chunk.sequenceNumber} to session ${sessionId}`);
    this.events?.onAudioChunkAdded(sessionId, languageCode, chunk);
  }

  addTranscriptChunk(languageCode: string, transcriptData: {
    original_text: string;
    translated_text: string;
    latency: number;
    is_final: boolean;
    confidence?: number;
  }): void {
    const sessionId = this.languageSessions.get(languageCode);
    if (!sessionId) {
      console.error(`[TRANSCRIPT SESSION] No active session for ${languageCode}`);
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[TRANSCRIPT SESSION] Session ${sessionId} not found`);
      return;
    }

    const chunk: TranscriptChunk = {
      id: `transcript-${sessionId}-${session.transcriptChunks.length + 1}`,
      sessionId,
      languageCode,
      sequenceNumber: session.transcriptChunks.length + 1,
      original_text: transcriptData.original_text,
      translated_text: transcriptData.translated_text,
      latency: transcriptData.latency,
      is_final: transcriptData.is_final,
      confidence: transcriptData.confidence,
      timestamp: Date.now()
    };

    session.transcriptChunks.push(chunk);

    console.log(`[${languageCode.toUpperCase()}] Added transcript chunk #${chunk.sequenceNumber} to session ${sessionId}: "${transcriptData.translated_text.substring(0, 30)}..."`);
    this.events?.onTranscriptChunkAdded(sessionId, languageCode, chunk);
  }

  getSessionAudioChunks(languageCode: string): AudioChunk[] {
    const sessionId = this.languageSessions.get(languageCode);
    if (!sessionId) return [];

    const session = this.sessions.get(sessionId);
    return session ? [...session.audioChunks] : [];
  }

  getSessionTranscriptChunks(languageCode: string): TranscriptChunk[] {
    const sessionId = this.languageSessions.get(languageCode);
    if (!sessionId) return [];

    const session = this.sessions.get(sessionId);
    return session ? [...session.transcriptChunks] : [];
  }

  mapAudioToTranscript(languageCode: string): Array<{
    audioChunk: AudioChunk | null;
    transcriptChunk: TranscriptChunk | null;
    sequenceNumber: number;
  }> {
    const audioChunks = this.getSessionAudioChunks(languageCode);
    const transcriptChunks = this.getSessionTranscriptChunks(languageCode);

    const maxSequence = Math.max(
      audioChunks.length > 0 ? Math.max(...audioChunks.map(c => c.sequenceNumber)) : 0,
      transcriptChunks.length > 0 ? Math.max(...transcriptChunks.map(c => c.sequenceNumber)) : 0
    );

    const mappedChunks: Array<{
      audioChunk: AudioChunk | null;
      transcriptChunk: TranscriptChunk | null;
      sequenceNumber: number;
    }> = [];

    for (let seq = 1; seq <= maxSequence; seq++) {
      const audioChunk = audioChunks.find(c => c.sequenceNumber === seq) || null;
      const transcriptChunk = transcriptChunks.find(c => c.sequenceNumber === seq) || null;

      mappedChunks.push({
        audioChunk,
        transcriptChunk,
        sequenceNumber: seq
      });
    }

    return mappedChunks;
  }

  clearSession(languageCode: string): void {
    const sessionId = this.languageSessions.get(languageCode);
    if (sessionId) {
      this.sessions.delete(sessionId);
      this.languageSessions.delete(languageCode);
      console.log(`[AUDIO SESSION] Cleared session ${sessionId} for ${languageCode}`);
    }
  }

  clearAllSessions(): void {
    console.log(`[AUDIO SESSION] Clearing all ${this.sessions.size} sessions`);
    this.sessions.clear();
    this.languageSessions.clear();
  }

  getActiveSession(languageCode: string): AudioSession | null {
    const sessionId = this.languageSessions.get(languageCode);
    return sessionId ? this.sessions.get(sessionId) || null : null;
  }

  getAllActiveSessions(): AudioSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  startAllLanguageSessions(): void {
    const targetLanguages = [
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

    targetLanguages.forEach(lang => {
      this.createSession(lang.code, lang.name);
    });

    console.log(`[AUDIO SESSION] Started ${targetLanguages.length} isolated language sessions`);
  }
}