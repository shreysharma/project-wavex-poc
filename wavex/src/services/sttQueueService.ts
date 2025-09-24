interface STTData {
  id: string;
  timestamp: number;
  original_text: string;
  translated_text: string;
  latency: number;
  is_final: boolean;
  audio_data?: string;
  confidence?: number;
}

interface LanguageQueue {
  languageCode: string;
  languageName: string;
  queue: STTData[];
  isProcessing: boolean;
  lastProcessedId: string | null;
}

interface QueueServiceEvents {
  onDataReceived: (languageCode: string, data: STTData) => void;
  onQueueUpdated: (languageCode: string, queueLength: number) => void;
  onFinalTranscript: (languageCode: string, data: STTData) => void;
}

export class STTQueueService {
  private static instance: STTQueueService;
  private queues: Map<string, LanguageQueue> = new Map();
  private events: QueueServiceEvents | null = null;
  private maxQueueSize = 100; // Prevent memory overflow
  private currentSessionId: string | null = null;

  private readonly targetLanguages = [
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

  private constructor() {
    this.initializeQueues();
  }

  static getInstance(): STTQueueService {
    if (!STTQueueService.instance) {
      STTQueueService.instance = new STTQueueService();
    }
    return STTQueueService.instance;
  }

  setEventHandlers(events: QueueServiceEvents) {
    this.events = events;
  }

  private initializeQueues(): void {
    console.log('Initializing 12 isolated STT data queues...');

    this.targetLanguages.forEach(lang => {
      const queue: LanguageQueue = {
        languageCode: lang.code,
        languageName: lang.name,
        queue: [],
        isProcessing: false,
        lastProcessedId: null
      };

      this.queues.set(lang.code, queue);
      console.log(`Created isolated queue for ${lang.name} (${lang.code})`);
    });

    console.log(`STT Queue Service initialized with ${this.queues.size} isolated queues`);
  }

  addToQueue(languageCode: string, data: STTData): void {
    const queue = this.queues.get(languageCode);
    if (!queue) {
      console.error(`Queue not found for language: ${languageCode}`);
      return;
    }

    // Session-based filtering: Only allow chunks from current session
    const currentSessionId = this.getCurrentSessionId();
    if (currentSessionId && !data.id.startsWith(currentSessionId)) {
      console.log(`[STT SESSION FILTER] Rejected chunk from different session: ${data.id.substring(0, 50)}...`);
      return;
    }

    // Allow chunks without audio_data for text display, but log the status
    if (!data.audio_data || data.audio_data.trim() === '') {
      console.log(`${queue.languageName} chunk added (TEXT ONLY - no audio_data)`);
    } else {
      console.log(`${queue.languageName} chunk added (TEXT + AUDIO)`);
    }

    // Add data to specific language queue
    queue.queue.push(data);

    // Maintain queue size limit
    if (queue.queue.length > this.maxQueueSize) {
      const removed = queue.queue.shift();
      console.log(`Queue overflow for ${queue.languageName}: removed oldest entry ${removed?.id}`);
    }

    console.log(`Added STT data to ${queue.languageName} queue: ${data.original_text.substring(0, 30)}... (Queue length: ${queue.queue.length})`);

    // Notify events
    this.events?.onDataReceived(languageCode, data);
    this.events?.onQueueUpdated(languageCode, queue.queue.length);

    // Check if this is a final transcript
    if (data.is_final) {
      console.log(`Final transcript received for ${queue.languageName}: ${data.translated_text}`);
      this.events?.onFinalTranscript(languageCode, data);
    }
  }

  getQueue(languageCode: string): STTData[] {
    const queue = this.queues.get(languageCode);
    return queue ? [...queue.queue] : [];
  }

  getLatestData(languageCode: string): STTData | null {
    const queue = this.queues.get(languageCode);
    if (!queue || queue.queue.length === 0) {
      return null;
    }
    return queue.queue[queue.queue.length - 1];
  }

  getFinalTranscripts(languageCode: string): STTData[] {
    const queue = this.queues.get(languageCode);
    if (!queue) return [];

    return queue.queue.filter(data => data.is_final);
  }

  clearQueue(languageCode: string): void {
    const queue = this.queues.get(languageCode);
    if (queue) {
      const clearedCount = queue.queue.length;
      queue.queue = [];
      queue.lastProcessedId = null;
      console.log(`Cleared ${queue.languageName} queue: removed ${clearedCount} entries`);
      this.events?.onQueueUpdated(languageCode, 0);
    }
  }

  clearAllQueues(): void {
    console.log('Clearing all STT queues...');
    this.queues.forEach((queue, languageCode) => {
      this.clearQueue(languageCode);
    });
  }

  getQueueStats(): { [languageCode: string]: number } {
    const stats: { [languageCode: string]: number } = {};
    this.queues.forEach((queue, languageCode) => {
      stats[languageCode] = queue.queue.length;
    });
    return stats;
  }

  getAllQueues(): Map<string, LanguageQueue> {
    return new Map(this.queues);
  }

  setProcessingStatus(languageCode: string, isProcessing: boolean): void {
    const queue = this.queues.get(languageCode);
    if (queue) {
      queue.isProcessing = isProcessing;
      console.log(`${queue.languageName} queue processing status: ${isProcessing ? 'ACTIVE' : 'IDLE'}`);
    }
  }

  getProcessingLanguages(): string[] {
    const processing: string[] = [];
    this.queues.forEach((queue, languageCode) => {
      if (queue.isProcessing) {
        processing.push(languageCode);
      }
    });
    return processing;
  }

  // Session management methods
  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
    console.log(`[STT QUEUE] Session ID updated: ${sessionId}`);
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  // Process queue for specific language (batch processing)
  processQueue(languageCode: string, batchSize: number = 10): STTData[] {
    const queue = this.queues.get(languageCode);
    if (!queue || queue.queue.length === 0) {
      return [];
    }

    const batch = queue.queue.splice(0, Math.min(batchSize, queue.queue.length));
    console.log(`Processed batch for ${queue.languageName}: ${batch.length} items`);

    this.events?.onQueueUpdated(languageCode, queue.queue.length);
    return batch;
  }
}