"""
Simple backend for testing STT only
"""

import asyncio
import base64
import json
import logging
import os
import time

# WebSocket client for Eleven Labs TTS
import websockets

# Import only what we need for STT and Translation
from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents
from dotenv import load_dotenv
from elevenlabs.types import VoiceSettings
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from google.cloud import translate_v2 as translate

# Google Translate imports
from google.oauth2 import service_account

# Load environment
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="Simple STT Test")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ElevenLabsTTSService:
    """Eleven Labs TTS service using WebSocket API"""

    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        if not self.api_key:
            raise ValueError("ELEVENLABS_API_KEY environment variable required")

        # Default voice ID (you can change this to any Eleven Labs voice)
        self.voice_id = os.getenv(
            "ELEVENLABS_VOICE_ID", "yco9hkSzXpAeaJXfPNpa"  # "1tyCkDKmBd1gCvRcimhT"
        )  # Default to Rachel voice

        # Use eleven_flash_v2_5 model for low latency as recommended
        self.model_id = "eleven_flash_v2_5"

        # Initialize persistent REST API client
        from elevenlabs.client import ElevenLabs

        self.client = ElevenLabs(api_key=self.api_key)

        logger.info("Eleven Labs TTS service initialized with persistent REST client")

    async def text_to_speech(self, text: str) -> bytes:
        """Convert text to speech using persistent ElevenLabs REST client"""
        try:
            if not text or not text.strip():
                return b""

            # Use persistent client for faster response (no client recreation)
            audio_stream = self.client.text_to_speech.stream(
                text=text,
                voice_id=self.voice_id,
                model_id=self.model_id,
                voice_settings=VoiceSettings(
                    stability=1, similarity_boost=0.8, speed=1.0
                ),  # Use eleven_flash_v2_5 for speed
            )

            # Collect audio chunks
            audio_chunks = []
            for chunk in audio_stream:
                if isinstance(chunk, bytes):
                    audio_chunks.append(chunk)

            # Combine all audio chunks
            if audio_chunks:
                combined_audio = b"".join(audio_chunks)
                logger.info(
                    f"✅ Generated {len(combined_audio)} bytes of TTS audio via REST API for text: '{text}'"
                )
                return combined_audio
            else:
                logger.warning(f"❌ No audio chunks received for text: '{text}'")
                return b""

        except Exception as e:
            logger.error(f"TTS REST API error: {e}")
            return b""

    # WEBSOCKET IMPLEMENTATION - COMMENTED OUT FOR TESTING
    # async def text_to_speech_websocket(self, text: str) -> bytes:
    #     """Convert text to speech using optimized Eleven Labs WebSocket API"""
    #     try:
    #         if not text or not text.strip():
    #             return b""

    #         async with websockets.connect(self.websocket_url) as websocket:
    #             # Send initial configuration with optimized settings
    #             await websocket.send(json.dumps({
    #                 "text": " ",  # Initialize with space
    #                 "voice_settings": {
    #                     "stability": 0.5,
    #                     "similarity_boost": 0.8,
    #                     "use_speaker_boost": False  # Disable for faster processing
    #                 },
    #                 "generation_config": {
    #                     # Lower thresholds for faster response
    #                     "chunk_length_schedule": [50, 120, 160, 290]
    #                 },
    #                 "xi_api_key": self.api_key,
    #             }))

    #             # Send the actual text with flush=True for immediate processing
    #             await websocket.send(json.dumps({
    #                 "text": text,
    #                 "flush": True  # Force immediate generation
    #             }))

    #             # Send empty string to close connection
    #             await websocket.send(json.dumps({"text": ""}))

    #             # Collect audio chunks using async generator pattern
    #             audio_chunks = []
    #             async for message in websocket:
    #                 try:
    #                     data = json.loads(message)
    #                     if data.get("audio"):
    #                         # Decode base64 audio chunk
    #                         audio_chunk = base64.b64decode(data["audio"])
    #                         audio_chunks.append(audio_chunk)
    #                     elif data.get("isFinal"):
    #                         break
    #                 except json.JSONDecodeError:
    #                     continue
    #                 except websockets.exceptions.ConnectionClosed:
    #                     logger.debug("TTS WebSocket connection closed")
    #                     break

    #         # Combine all audio chunks
    #         if audio_chunks:
    #             combined_audio = b"".join(audio_chunks)
    #             logger.debug(f"Generated {len(combined_audio)} bytes of TTS audio")
    #             return combined_audio
    #         return b""

    #     except Exception as e:
    #         logger.error(f"TTS error: {e}")
    #         return b""


class SimpleTranslateService:
    """Simple Google Translate service using exact same implementation as test.py"""

    def __init__(self):
        # Initialize Google Translate exactly like test.py
        creds_info = json.loads(os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON"))
        self.credentials = service_account.Credentials.from_service_account_info(
            creds_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        self.translate_client = translate.Client(credentials=self.credentials)
        logger.info("Google Translate service initialized")

    def translate_text(
        self, text: str, target_language: str = "en", source_language: str = "hi"
    ) -> str:
        """Translate text exactly like test.py implementation"""
        try:
            if not text or not text.strip():
                return ""

            # Use the exact same method as test.py
            results = self.translate_client.translate(
                values=[text],
                target_language=target_language,
                source_language=source_language,
            )

            if results and len(results) > 0:
                result = results[0]
                translated_text = result.get("translatedText", "")
                logger.info(
                    f"Translated '{text}' → '{translated_text}' ({source_language}→{target_language})"
                )
                return translated_text

            return ""

        except Exception as e:
            logger.error(f"Translation error: {e}")
            return ""


class SimpleSTTService:
    """Continuous streaming STT service like the Deepgram example"""

    def __init__(self):
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        if not self.api_key:
            raise ValueError("DEEPGRAM_API_KEY environment variable required")

        self.client = DeepgramClient(self.api_key)
        self.connection = None
        logger.info("Simple STT service initialized")

    def start_streaming(self, websocket, input_language="hi", output_language="en"):
        """Start continuous streaming transcription with dynamic languages"""
        try:
            # Store websocket reference and language settings
            self.websocket = websocket
            self.input_language = input_language
            self.output_language = output_language
            self.processing_start_time = None  # Track when processing started

            # Initialize transcript queue
            if not hasattr(self, "transcript_queue"):
                self.transcript_queue = []

            logger.info(
                f"Starting streaming with languages: {input_language} → {output_language}"
            )

            # Create a websocket connection to Deepgram
            self.connection = self.client.listen.live.v("1")

            # Use closure to capture the correct 'self' reference
            stt_service_ref = self

            # Define event handlers like in the example
            def on_message(_deepgram_self, result, **_kwargs):
                try:
                    sentence = result.channel.alternatives[0].transcript
                    if len(sentence) > 0:
                        import time as time_module  # Import time module locally

                        stt_start_time = time_module.time()
                        logger.info(f"Transcript: {sentence}")

                        # Translate using dynamic languages with timing
                        translate_start_time = time_module.time()
                        translated_text = translate_service.translate_text(
                            text=sentence,
                            target_language=stt_service_ref.output_language,
                            source_language=stt_service_ref.input_language,
                        )
                        translate_end_time = time_module.time()

                        # Calculate latencies (without TTS for now - will be done in main loop)
                        stt_latency = (
                            translate_start_time - stt_start_time
                        ) * 1000  # ms
                        translate_latency = (
                            translate_end_time - translate_start_time
                        ) * 1000  # ms

                        # Store transcript and translation (TTS will be done in main WebSocket loop)
                        transcript_data = {
                            "type": "transcript",
                            "original_text": sentence,
                            "translated_text": translated_text,
                            "source_language": stt_service_ref.input_language,
                            "target_language": stt_service_ref.output_language,
                            "is_final": getattr(result, "is_final", True),
                            "latency": {
                                "stt_ms": round(stt_latency, 2),
                                "translate_ms": round(translate_latency, 2),
                                "tts_ms": 0,  # Will be updated after TTS generation
                                "total_ms": round(
                                    stt_latency + translate_latency, 2
                                ),  # Will be updated
                            },
                            "timestamp": time_module.time(),
                            "needs_tts": True,  # Flag to indicate TTS generation needed
                        }
                        stt_service_ref.transcript_queue.append(transcript_data)
                        logger.info(
                            f"✅ Queued transcript (STT: {stt_latency:.1f}ms, Translate: {translate_latency:.1f}ms): {sentence} → {translated_text}"
                        )

                except Exception as e:
                    logger.error(f"Error in transcript handler: {e}")

            def on_metadata(_self, metadata, **_kwargs):
                logger.info(f"Metadata: {metadata}")

            def on_error(_self, error, **_kwargs):
                logger.error(f"Deepgram error: {error}")
                # Don't use asyncio.create_task in sync context - just log for now

            def on_close(_self, close, **_kwargs):
                logger.info(f"Deepgram connection closed: {close}")
                # Connection closed naturally

            # Register event handlers like in the example
            self.connection.on(LiveTranscriptionEvents.Transcript, on_message)
            self.connection.on(LiveTranscriptionEvents.Metadata, on_metadata)
            self.connection.on(LiveTranscriptionEvents.Error, on_error)
            self.connection.on(LiveTranscriptionEvents.Close, on_close)

            # Configure Deepgram options for live transcription with dynamic language
            options = LiveOptions(
                model="nova-2",
                language=input_language,  # Use dynamic input language
                # smart_format=True,
                encoding="linear16",
                sample_rate=16000,
                channels=1,
            )

            # Start the connection
            self.connection.start(options)
            logger.info("Deepgram streaming started")

        except Exception as e:
            logger.error(f"Error starting streaming: {e}")

    def send_audio(self, audio_data: bytes):
        """Send audio data to Deepgram (like sending stream data)"""
        if self.connection:
            try:
                self.connection.send(audio_data)
            except Exception as e:
                logger.error(f"Error sending audio: {e}")

    def stop_streaming(self):
        """Stop streaming"""
        if self.connection:
            try:
                self.connection.finish()
                logger.info("Deepgram streaming stopped")
            except Exception as e:
                logger.error(f"Error stopping streaming: {e}")
            finally:
                self.connection = None
                self.websocket = None
                if hasattr(self, "transcript_queue"):
                    self.transcript_queue = []

    def get_pending_transcripts(self):
        """Get and clear pending transcripts"""
        if hasattr(self, "transcript_queue") and self.transcript_queue:
            transcripts = self.transcript_queue.copy()
            self.transcript_queue = []
            return transcripts
        return []


# Initialize services
stt_service = SimpleSTTService()
translate_service = SimpleTranslateService()

# Initialize TTS service (optional)
tts_service = None
try:
    tts_service = ElevenLabsTTSService()
    logger.info("TTS service initialized successfully")

    # Pre-establish connection for faster first use
    async def init_tts_connection():
        if tts_service:
            await tts_service.start_connection()

    # We'll call this when the first WebSocket connects

except ValueError as e:
    logger.warning(f"TTS service not available: {e}")
    logger.info("TTS functionality will be disabled")


@app.get("/")
async def serve_test_page():
    """Serve the simple test HTML"""
    return FileResponse("simple_test.html")


@app.websocket("/stt-test")
async def stt_websocket(websocket: WebSocket):
    """Continuous streaming STT WebSocket endpoint"""
    await websocket.accept()
    logger.info("WebSocket connected")

    try:
        # Send connection confirmation
        await websocket.send_json(
            {
                "type": "connected",
                "message": "WebSocket connected, ready for continuous audio streaming",
            }
        )

        # Initialize language settings
        input_language = "hi"  # Default to Hindi
        output_language = "en"  # Default to English
        streaming_started = False

        while True:
            try:
                # Check for pending transcripts first
                pending_transcripts = stt_service.get_pending_transcripts()
                for transcript_data in pending_transcripts:
                    # Generate TTS if needed and service is available
                    if (
                        transcript_data.get("needs_tts")
                        and transcript_data.get("translated_text")
                        and tts_service
                    ):
                        tts_start_time = time.time()
                        try:
                            audio_bytes = await tts_service.text_to_speech(
                                transcript_data["translated_text"]
                            )
                            if audio_bytes:
                                # Convert to base64 for JSON transmission
                                transcript_data["audio_data"] = base64.b64encode(
                                    audio_bytes
                                ).decode("utf-8")
                                logger.info(
                                    f"🔊 Added {len(audio_bytes)} bytes of TTS audio (base64: {len(transcript_data['audio_data'])} chars) for: '{transcript_data['translated_text']}'"
                                )
                            else:
                                logger.warning(
                                    f"❌ No TTS audio generated for: '{transcript_data['translated_text']}'"
                                )
                                transcript_data["audio_data"] = None
                            tts_end_time = time.time()

                            # Update latency information
                            tts_latency = (tts_end_time - tts_start_time) * 1000
                            transcript_data["latency"]["tts_ms"] = round(tts_latency, 2)
                            transcript_data["latency"]["total_ms"] = round(
                                transcript_data["latency"]["stt_ms"]
                                + transcript_data["latency"]["translate_ms"]
                                + tts_latency,
                                2,
                            )

                        except Exception as tts_error:
                            logger.error(f"TTS generation failed: {tts_error}")
                            transcript_data["audio_data"] = None
                            transcript_data["latency"]["tts_ms"] = 0
                    elif transcript_data.get("needs_tts"):
                        # TTS was requested but service not available
                        transcript_data["audio_data"] = None
                        transcript_data["latency"]["tts_ms"] = 0
                        transcript_data["latency"]["total_ms"] = round(
                            transcript_data["latency"]["stt_ms"]
                            + transcript_data["latency"]["translate_ms"],
                            2,
                        )

                    # Remove the flag
                    transcript_data.pop("needs_tts", None)

                    await websocket.send_json(transcript_data)
                    latency_info = transcript_data.get("latency", {})
                    logger.info(
                        f"Sent transcript (STT: {latency_info.get('stt_ms', 0):.1f}ms, Trans: {latency_info.get('translate_ms', 0):.1f}ms, TTS: {latency_info.get('tts_ms', 0):.1f}ms, Total: {latency_info.get('total_ms', 0):.1f}ms): {transcript_data.get('original_text', transcript_data.get('transcript', 'unknown'))}"
                    )

                # Receive message with a small timeout so we can check transcripts regularly
                try:
                    message = await asyncio.wait_for(websocket.receive(), timeout=0.1)
                except asyncio.TimeoutError:
                    # No message received, continue to check for transcripts
                    continue

                if message["type"] == "websocket.receive" and "bytes" in message:
                    # Binary audio data - send to Deepgram only if streaming has started
                    if streaming_started:
                        audio_data = message["bytes"]
                        logger.info(f"Received {len(audio_data)} bytes of audio")
                        stt_service.send_audio(audio_data)
                    else:
                        logger.debug("Audio received but streaming not started yet")

                elif message["type"] == "websocket.receive" and "text" in message:
                    # Text command
                    try:
                        command = json.loads(message["text"])
                        if command.get("type") == "language_settings":
                            input_language = command.get("input_language", "hi")
                            output_language = command.get("output_language", "en")
                            logger.info(
                                f"Language settings updated: {input_language} → {output_language}"
                            )

                            # Start streaming with the new language settings
                            if not streaming_started:
                                stt_service.start_streaming(
                                    websocket, input_language, output_language
                                )
                                streaming_started = True

                                # Send streaming started confirmation
                                await websocket.send_json(
                                    {
                                        "type": "streaming_started",
                                        "message": f"Deepgram streaming started with {input_language} → {output_language}",
                                        "input_language": input_language,
                                        "output_language": output_language,
                                    }
                                )
                            continue

                        elif command.get("type") == "stop_streaming":
                            logger.info("Stop streaming command received")

                            # Continue processing for a short time to catch final transcripts
                            stop_time = time.time()
                            while time.time() - stop_time < 2.0:  # Wait up to 2 seconds
                                # Check for any final transcripts
                                final_transcripts = (
                                    stt_service.get_pending_transcripts()
                                )
                                for transcript_data in final_transcripts:
                                    # Generate TTS if needed and service is available
                                    if (
                                        transcript_data.get("needs_tts")
                                        and transcript_data.get("translated_text")
                                        and tts_service
                                    ):
                                        tts_start_time = time.time()
                                        try:
                                            audio_bytes = (
                                                await tts_service.text_to_speech(
                                                    transcript_data["translated_text"]
                                                )
                                            )
                                            if audio_bytes:
                                                transcript_data["audio_data"] = (
                                                    base64.b64encode(
                                                        audio_bytes
                                                    ).decode("utf-8")
                                                )
                                                logger.info(
                                                    f"🔊 Added {len(audio_bytes)} bytes of final TTS audio for: '{transcript_data['translated_text']}'"
                                                )
                                            else:
                                                transcript_data["audio_data"] = None
                                            tts_end_time = time.time()

                                            # Update latency
                                            tts_latency = (
                                                tts_end_time - tts_start_time
                                            ) * 1000
                                            transcript_data["latency"]["tts_ms"] = (
                                                round(tts_latency, 2)
                                            )
                                            transcript_data["latency"]["total_ms"] = (
                                                round(
                                                    transcript_data["latency"]["stt_ms"]
                                                    + transcript_data["latency"][
                                                        "translate_ms"
                                                    ]
                                                    + tts_latency,
                                                    2,
                                                )
                                            )

                                        except Exception as tts_error:
                                            logger.error(
                                                f"Final TTS generation failed: {tts_error}"
                                            )
                                            transcript_data["audio_data"] = None
                                            transcript_data["latency"]["tts_ms"] = 0
                                    elif transcript_data.get("needs_tts"):
                                        transcript_data["audio_data"] = None
                                        transcript_data["latency"]["tts_ms"] = 0
                                        transcript_data["latency"]["total_ms"] = round(
                                            transcript_data["latency"]["stt_ms"]
                                            + transcript_data["latency"][
                                                "translate_ms"
                                            ],
                                            2,
                                        )

                                    # Remove the flag and send
                                    transcript_data.pop("needs_tts", None)
                                    await websocket.send_json(transcript_data)
                                    latency_info = transcript_data.get("latency", {})
                                    logger.info(
                                        f"📤 Sent final transcript (STT: {latency_info.get('stt_ms', 0):.1f}ms, Trans: {latency_info.get('translate_ms', 0):.1f}ms, TTS: {latency_info.get('tts_ms', 0):.1f}ms, Total: {latency_info.get('total_ms', 0):.1f}ms): {transcript_data.get('original_text', 'unknown')}"
                                    )

                                if final_transcripts:
                                    logger.info(
                                        f"✅ Processed {len(final_transcripts)} final transcripts"
                                    )

                                # Short sleep to avoid busy waiting
                                await asyncio.sleep(0.1)

                                # Break early if no more audio being received
                                # (We can detect this by checking if Deepgram connection closed)
                                if not stt_service.connection:
                                    logger.info(
                                        "Deepgram connection closed, finishing final transcript processing"
                                    )
                                    break

                            logger.info("Final transcript processing completed")
                            break
                    except:
                        pass

            except Exception as e:
                logger.error(f"Error processing message: {e}")
                break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Clean up streaming
        stt_service.stop_streaming()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
