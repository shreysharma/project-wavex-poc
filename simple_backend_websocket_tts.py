"""
Simple backend with WebSocket-based Eleven Labs TTS (based on original simple_backend.py)
"""

import asyncio
import base64
import json
import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock, Timer

import requests
import subprocess
import shutil

# WebSocket client for Eleven Labs TTS
import websockets

# Import only what we need for STT and Translation
from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
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
app = FastAPI(title="Simple STT Test with WebSocket TTS")

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

        # Configurable model for TTS
        self.model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5")

        logger.info(
            f"Eleven Labs TTS service initialized - Voice: {self.voice_id}, Model: {self.model_id}"
        )

    async def text_to_speech(self, text: str) -> bytes:
        """Convert text to speech using Eleven Labs WebSocket API"""
        try:
            if not text or not text.strip():
                return b""

            # Connect to Eleven Labs WebSocket
            uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream-input?model_id={self.model_id}"

            async with websockets.connect(uri) as websocket:
                # Send initial connection message with voice settings (as per docs)
                initial_message = {
                    "text": " ",  # Send space to initialize, not empty string
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.8,
                        "use_speaker_boost": False,
                    },
                    "generation_config": {
                        "chunk_length_schedule": [100, 160, 210, 300]
                    },
                    "xi_api_key": self.api_key,
                    "apply_text_normalization": "auto",  # Let ElevenLabs decide when to normalize text
                }
                await websocket.send(json.dumps(initial_message))

                # Send the actual text with flush=True for immediate generation
                message = {
                    "text": text,
                    "flush": True,  # Force immediate generation as per docs
                    "apply_text_normalization": "auto",  # Consistent normalization
                }
                await websocket.send(json.dumps(message))

                # Send empty string to close connection
                await websocket.send(json.dumps({"text": ""}))

                # Collect audio chunks
                audio_chunks = []

                while True:
                    try:
                        response = await asyncio.wait_for(
                            websocket.recv(), timeout=30.0
                        )
                        data = json.loads(response)

                        if data.get("audio"):
                            # Decode base64 audio chunk
                            audio_chunk = base64.b64decode(data["audio"])
                            audio_chunks.append(audio_chunk)

                        if data.get("isFinal"):
                            break

                    except asyncio.TimeoutError:
                        logger.error(" Timeout waiting for audio response")
                        break
                    except json.JSONDecodeError as e:
                        logger.error(f" JSON decode error: {e}")
                        break
                    except websockets.exceptions.ConnectionClosed:
                        logger.debug("TTS WebSocket connection closed")
                        break

                # Combine all audio chunks
                if audio_chunks:
                    combined_audio = b"".join(audio_chunks)
                    logger.info(
                        f" Generated {len(combined_audio)} bytes of TTS audio via WebSocket API for text: '{text}'"
                    )
                    return combined_audio
                else:
                    logger.warning(f" No audio chunks received for text: '{text}'")
                    return b""

        except Exception as e:
            logger.error(f"TTS WebSocket API error: {e}")
            return b""


class SimpleTranslateService:
    """Simple Google Translate service using exact same implementation as original"""

    def __init__(self):
        # Initialize Google Translate exactly like original
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
        """Translate text exactly like original implementation"""
        try:
            if not text or not text.strip():
                return ""

            # Use the exact same method as original
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
    """Continuous streaming STT service with keepalive and improved connection management"""

    def __init__(self):
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        if not self.api_key:
            raise ValueError("DEEPGRAM_API_KEY environment variable required")

        self.client = DeepgramClient(self.api_key)
        self.connection = None
        self.keepalive_timer = None
        self.last_audio_time = time.time()
        self.connection_lock = Lock()
        logger.info("Simple STT service initialized with keepalive support")

    def start_streaming(self, websocket, input_language="hi", output_language="en", translate_service_ref=None):
        """Start continuous streaming transcription with dynamic languages"""
        try:
            # Store websocket reference and language settings
            self.websocket = websocket
            self.input_language = input_language
            self.output_language = output_language
            self.translate_service = translate_service_ref
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

            # Define event handlers like in the original
            def on_message(_deepgram_self, result, **_kwargs):
                try:
                    sentence = result.channel.alternatives[0].transcript
                    is_final = getattr(result, "is_final", True)

                    # Only process final results to avoid duplicates from interim results
                    if len(sentence) > 0 and is_final:
                        import time as time_module  # Import time module locally

                        stt_start_time = time_module.time()
                        logger.info(f"Final transcript: {sentence}")

                        # Translate using dynamic languages with timing
                        translate_start_time = time_module.time()
                        translated_text = stt_service_ref.translate_service.translate_text(
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
                            f" Queued transcript (STT: {stt_latency:.1f}ms, Translate: {translate_latency:.1f}ms): {sentence} → {translated_text}"
                        )

                except Exception as e:
                    logger.error(f"Error in transcript handler: {e}")

            def on_metadata(_self, metadata, **_kwargs):
                logger.info(f"Metadata: {metadata}")

            def on_error(_self, error, **_kwargs):
                logger.error(f"Deepgram error: {error}")

            def on_close(_self, close, **_kwargs):
                logger.info(f"Deepgram connection closed: {close}")

            # Register event handlers like in the original
            self.connection.on(LiveTranscriptionEvents.Transcript, on_message)
            self.connection.on(LiveTranscriptionEvents.Metadata, on_metadata)
            self.connection.on(LiveTranscriptionEvents.Error, on_error)
            self.connection.on(LiveTranscriptionEvents.Close, on_close)

            # Configure Deepgram options for better sentence detection
            options = LiveOptions(
                model="nova-2",
                language=input_language,  # Use dynamic input language
                encoding="linear16",
                sample_rate=16000,
                channels=1,
                interim_results=True,  # Required for utterance_end_ms
                utterance_end_ms="1000",  # 1 second silence for sentence boundary
            )

            # Start the connection
            self.connection.start(options)
            # Start keepalive timer
            self._reset_keepalive_timer()
            logger.info("Deepgram streaming started with keepalive")

        except Exception as e:
            logger.error(f"Error starting streaming: {e}")

    def send_audio(self, audio_data: bytes):
        """Send audio data to Deepgram with keepalive support"""
        with self.connection_lock:
            if self.connection:
                try:
                    self.connection.send(audio_data)
                    self.last_audio_time = time.time()
                    # Reset keepalive timer when we receive audio
                    self._reset_keepalive_timer()
                except Exception as e:
                    logger.error(f"Error sending audio: {e}")

    def _send_keepalive(self):
        """Send keepalive packet to maintain Deepgram connection"""
        with self.connection_lock:
            if self.connection and time.time() - self.last_audio_time > 3.0:
                try:
                    # Send small keepalive packet (empty audio frame)
                    keepalive_data = b"\x00" * 320  # 20ms of silence at 16kHz
                    self.connection.send(keepalive_data)
                    logger.debug(" Sent keepalive to Deepgram")
                    # Schedule next keepalive
                    self._reset_keepalive_timer()
                except Exception as e:
                    logger.error(f"Error sending keepalive: {e}")

    def _reset_keepalive_timer(self):
        """Reset the keepalive timer"""
        if self.keepalive_timer:
            self.keepalive_timer.cancel()
        # Send keepalive every 5 seconds if no audio
        self.keepalive_timer = Timer(5.0, self._send_keepalive)
        self.keepalive_timer.start()

    def stop_streaming(self):
        """Stop streaming and cleanup keepalive"""
        with self.connection_lock:
            if self.keepalive_timer:
                self.keepalive_timer.cancel()
                self.keepalive_timer = None

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


# Thread pool for async operations
executor = ThreadPoolExecutor(max_workers=4)

# Global services for REST endpoints only
global_translate_service = SimpleTranslateService()
global_tts_service = None

# Initialize global TTS service (optional) for REST endpoints
try:
    global_tts_service = ElevenLabsTTSService()
    logger.info("Global TTS service initialized successfully with WebSocket API")
except ValueError as e:
    logger.warning(f"Global TTS service not available: {e}")
    logger.info("TTS functionality will be disabled for REST endpoints")


@app.get("/")
async def serve_test_page():
    """Serve the simple test HTML"""
    return FileResponse("simple_test.html")


@app.post("/translate-file")
async def translate_complete_file(
    file: UploadFile = File(...),
    input_language: str = Form("hi"),
    output_language: str = Form("en"),
):
    """Translate a complete audio file using REST API"""
    try:
        import time as time_module

        # Read the uploaded file
        audio_file = await file.read()
        logger.info(f"Processing complete file: {len(audio_file)} bytes")
        logger.info(f"Languages: {input_language} → {output_language}")

        start_time = time_module.time()

        # Save audio to temporary file
        with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as temp_file:
            temp_file.write(audio_file)
            temp_file_path = temp_file.name

        # Use Deepgram REST API for complete file processing
        deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        headers = {
            "Authorization": f"Token {deepgram_key}",
            "Content-Type": "audio/raw",
        }

        params = {
            "model": "nova-2",
            "language": input_language,
            "encoding": "linear16",
            "sample_rate": "16000",
            "channels": "1",
            "smart_format": "true",
        }

        stt_start = time_module.time()
        with open(temp_file_path, "rb") as audio_file_handle:
            response = requests.post(
                "https://api.deepgram.com/v1/listen",
                headers=headers,
                params=params,
                data=audio_file_handle,
                timeout=120,  # 2 minute timeout for large files
            )

        if response.status_code != 200:
            raise Exception(
                f"Deepgram API error: {response.status_code} - {response.text}"
            )

        result = response.json()
        stt_end = time_module.time()

        # Extract transcript
        transcript = ""
        if "results" in result and "channels" in result["results"]:
            for alternative in result["results"]["channels"][0]["alternatives"]:
                transcript = alternative.get("transcript", "")
                break

        if not transcript:
            raise Exception("No transcript found in Deepgram response")

        logger.info(f"Complete file transcript: {transcript}")

        # Translate the complete transcript
        translate_start = time_module.time()
        translated_text = global_translate_service.translate_text(
            text=transcript,
            target_language=output_language,
            source_language=input_language,
        )
        translate_end = time_module.time()

        # Generate TTS if service is available
        tts_start = time_module.time()
        audio_data = None
        if global_tts_service and translated_text:
            try:
                audio_bytes = await global_tts_service.text_to_speech(translated_text)
                if audio_bytes:
                    audio_data = base64.b64encode(audio_bytes).decode("utf-8")
                    logger.info(f" Generated TTS audio: {len(audio_bytes)} bytes")
            except Exception as tts_error:
                logger.error(f"TTS generation failed: {tts_error}")

        tts_end = time_module.time()

        # Calculate latencies
        total_time = time_module.time() - start_time
        stt_latency = (stt_end - stt_start) * 1000
        translate_latency = (translate_end - translate_start) * 1000
        tts_latency = (tts_end - tts_start) * 1000

        # Cleanup temp file
        try:
            os.unlink(temp_file_path)
        except OSError:
            pass

        response_data = {
            "success": True,
            "original_text": transcript,
            "translated_text": translated_text,
            "audio_data": audio_data,
            "source_language": input_language,
            "target_language": output_language,
            "latency": {
                "stt_ms": round(stt_latency, 2),
                "translate_ms": round(translate_latency, 2),
                "tts_ms": round(tts_latency, 2),
                "total_ms": round(total_time * 1000, 2),
            },
        }

        logger.info(f" Complete file processed successfully in {total_time:.2f}s")
        return response_data

    except Exception as e:
        logger.error(f" Error processing complete file: {e}")
        return {"success": False, "error": str(e)}


@app.post("/translate-video")
async def translate_complete_video(
    file: UploadFile = File(...),
    input_language: str = Form("hi"),
    output_language: str = Form("en")
):
    """Translate a complete video file and return with replaced audio track"""
    try:
        import time as time_module

        # Read the uploaded video file
        video_data = await file.read()
        logger.info(f"Processing complete video: {len(video_data)} bytes")
        logger.info(f"Languages: {input_language} → {output_language}")

        start_time = time_module.time()

        # Save video to temporary file
        video_ext = file.filename.split('.')[-1] if '.' in file.filename else 'mp4'
        with tempfile.NamedTemporaryFile(suffix=f'.{video_ext}', delete=False) as temp_video:
            temp_video.write(video_data)
            temp_video_path = temp_video.name

        # Extract audio from video using ffmpeg
        audio_path = temp_video_path.replace(f'.{video_ext}', '.wav')
        try:
            subprocess.run([
                'ffmpeg', '-i', temp_video_path,
                '-vn',  # No video
                '-acodec', 'pcm_s16le',  # 16-bit PCM
                '-ar', '16000',  # 16kHz sample rate
                '-ac', '1',  # Mono
                audio_path
            ], check=True, capture_output=True)

            logger.info(f"Audio extracted to: {audio_path}")

        except subprocess.CalledProcessError as e:
            raise Exception(f"Audio extraction failed: {e}")

        # Process extracted audio with Deepgram
        deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        headers = {
            "Authorization": f"Token {deepgram_key}",
            "Content-Type": "audio/wav",
        }

        params = {
            "model": "nova-2",
            "language": input_language,
            "encoding": "linear16",
            "sample_rate": "16000",
            "channels": "1",
            "smart_format": "true",
        }

        stt_start = time_module.time()
        with open(audio_path, "rb") as audio_file:
            response = requests.post(
                "https://api.deepgram.com/v1/listen",
                headers=headers,
                params=params,
                data=audio_file,
                timeout=300  # 5 minute timeout for large video files
            )

        if response.status_code != 200:
            raise Exception(f"Deepgram API error: {response.status_code} - {response.text}")

        result = response.json()
        stt_end = time_module.time()

        # Extract transcript
        transcript = ""
        if "results" in result and "channels" in result["results"]:
            for alternative in result["results"]["channels"][0]["alternatives"]:
                transcript = alternative.get("transcript", "")
                break

        if not transcript:
            raise Exception("No transcript found in Deepgram response")

        logger.info(f"Complete video transcript: {transcript}")

        # Translate the complete transcript
        translate_start = time_module.time()
        translated_text = global_translate_service.translate_text(
            text=transcript,
            target_language=output_language,
            source_language=input_language,
        )
        translate_end = time_module.time()

        # Generate TTS for the complete translation
        tts_start = time_module.time()
        translated_audio_path = None
        if global_tts_service and translated_text:
            try:
                audio_bytes = await global_tts_service.text_to_speech(translated_text)
                if audio_bytes:
                    # Save TTS audio to temporary file
                    translated_audio_path = temp_video_path.replace(f'.{video_ext}', '_translated.mp3')
                    with open(translated_audio_path, 'wb') as f:
                        f.write(audio_bytes)
                    logger.info(f"Generated TTS audio: {len(audio_bytes)} bytes")
            except Exception as tts_error:
                logger.error(f"TTS generation failed: {tts_error}")

        tts_end = time_module.time()

        # Replace audio track in video if TTS was successful
        output_video_path = None
        if translated_audio_path:
            output_video_path = temp_video_path.replace(f'.{video_ext}', '_final.mp4')
            try:
                subprocess.run([
                    'ffmpeg', '-i', temp_video_path,  # Input video
                    '-i', translated_audio_path,     # Input translated audio
                    '-c:v', 'copy',                  # Copy video without re-encoding
                    '-c:a', 'aac',                   # Encode audio as AAC
                    '-map', '0:v:0',                 # Map video from first input
                    '-map', '1:a:0',                 # Map audio from second input
                    '-shortest',                     # Match shortest stream duration
                    output_video_path
                ], check=True, capture_output=True)

                logger.info(f"Video with translated audio created: {output_video_path}")

            except subprocess.CalledProcessError as e:
                logger.error(f"Video processing failed: {e}")
                output_video_path = None

        # Calculate latencies
        total_time = time_module.time() - start_time
        stt_latency = (stt_end - stt_start) * 1000
        translate_latency = (translate_end - translate_start) * 1000
        tts_latency = (tts_end - tts_start) * 1000

        # Read the final video file for response
        output_video_data = None
        if output_video_path and os.path.exists(output_video_path):
            with open(output_video_path, 'rb') as f:
                output_video_data = base64.b64encode(f.read()).decode('utf-8')

        # Cleanup temp files
        try:
            os.unlink(temp_video_path)
            if audio_path and os.path.exists(audio_path):
                os.unlink(audio_path)
            if translated_audio_path and os.path.exists(translated_audio_path):
                os.unlink(translated_audio_path)
            if output_video_path and os.path.exists(output_video_path):
                os.unlink(output_video_path)
        except OSError:
            pass

        response_data = {
            "success": True,
            "original_text": transcript,
            "translated_text": translated_text,
            "video_data": output_video_data,
            "source_language": input_language,
            "target_language": output_language,
            "latency": {
                "stt_ms": round(stt_latency, 2),
                "translate_ms": round(translate_latency, 2),
                "tts_ms": round(tts_latency, 2),
                "total_ms": round(total_time * 1000, 2),
            }
        }

        logger.info(f"Complete video processed successfully in {total_time:.2f}s")
        return response_data

    except Exception as e:
        logger.error(f"Error processing complete video: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@app.post("/translate-text")
async def translate_text_to_all_languages(
    text: str = Form(...),
    source_language: str = Form("auto")
):
    """Translate text to all supported languages in parallel"""
    try:
        import time as time_module
        from concurrent.futures import as_completed

        if not text or not text.strip():
            return {"success": False, "error": "No text provided"}

        text = text.strip()
        logger.info(f"Translating text to all languages: {text[:50]}...")

        start_time = time_module.time()

        # All supported languages (from UI dropdown)
        target_languages = {
            "en": "English",
            "hi": "Hindi (हिंदी)",
            "ta": "Tamil (தமிழ்)",
            "te": "Telugu (తెలుగు)",
            "bn": "Bengali (বাংলা)",
            "mr": "Marathi (मराठी)",
            "gu": "Gujarati (ગુજરાતી)",
            "kn": "Kannada (ಕನ್ನಡ)",
            "ml": "Malayalam (മലയാളം)",
            "pa": "Punjabi (ਪੰਜਾਬੀ)",
            "ur": "Urdu (اردو)",
            "or": "Odia (ଓଡ଼ିଆ)",
            "as": "Assamese (অসমীয়া)"
        }

        # Remove source language from targets if it exists
        if source_language in target_languages:
            target_languages.pop(source_language)

        # Function to translate to a single language
        def translate_to_language(target_lang):
            try:
                start = time_module.time()
                translated = global_translate_service.translate_text(
                    text=text,
                    target_language=target_lang,
                    source_language=source_language
                )
                end = time_module.time()
                return {
                    "language": target_lang,
                    "language_name": target_languages[target_lang],
                    "translated_text": translated,
                    "latency_ms": round((end - start) * 1000, 2)
                }
            except Exception as e:
                logger.error(f"Translation failed for {target_lang}: {e}")
                return {
                    "language": target_lang,
                    "language_name": target_languages[target_lang],
                    "translated_text": f"[Translation failed: {str(e)}]",
                    "latency_ms": 0
                }

        # Execute translations in parallel using global executor
        futures = {executor.submit(translate_to_language, lang): lang for lang in target_languages.keys()}

        translations = []
        for future in as_completed(futures):
            result = future.result()
            translations.append(result)
            logger.info(f"Completed {result['language']}: {result['translated_text'][:30]}...")

        # Sort by language code for consistent output
        translations.sort(key=lambda x: x['language'])

        total_time = time_module.time() - start_time
        avg_latency = sum(t['latency_ms'] for t in translations) / len(translations) if translations else 0

        response_data = {
            "success": True,
            "original_text": text,
            "source_language": source_language,
            "translations": translations,
            "summary": {
                "total_languages": len(translations),
                "total_time_ms": round(total_time * 1000, 2),
                "average_latency_ms": round(avg_latency, 2)
            }
        }

        logger.info(f"Parallel translation completed: {len(translations)} languages in {total_time:.2f}s")
        return response_data

    except Exception as e:
        logger.error(f"Error in parallel text translation: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@app.websocket("/stt-test")
async def stt_websocket(websocket: WebSocket):
    """Continuous streaming STT WebSocket endpoint with per-connection isolation"""
    await websocket.accept()
    logger.info("WebSocket connected - creating isolated services")

    # Create SEPARATE service instances for this connection
    connection_stt_service = SimpleSTTService()
    connection_translate_service = SimpleTranslateService()
    connection_tts_service = None

    try:
        connection_tts_service = ElevenLabsTTSService()
        logger.info("Connection TTS service initialized")
    except ValueError as e:
        logger.warning(f"Connection TTS service not available: {e}")

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

        # Queue for tracking async TTS tasks
        pending_tts_tasks = {}

        while True:
            try:
                # Check for completed TTS tasks first
                completed_tasks = []
                for task_id, task in pending_tts_tasks.items():
                    if task.done():
                        completed_tasks.append(task_id)
                        try:
                            transcript_data, audio_bytes = await task
                            if audio_bytes:
                                # Convert to base64 for JSON transmission
                                transcript_data["audio_data"] = base64.b64encode(
                                    audio_bytes
                                ).decode("utf-8")
                                logger.info(
                                    f" TTS completed: {len(audio_bytes)} bytes for '{transcript_data['translated_text']}'"
                                )
                            else:
                                transcript_data["audio_data"] = None
                                logger.warning(
                                    f" TTS failed for: '{transcript_data['translated_text']}'"
                                )

                            # Send transcript with audio
                            await websocket.send_json(transcript_data)
                            latency_info = transcript_data.get("latency", {})
                            logger.info(
                                f" Sent with TTS (STT: {latency_info.get('stt_ms', 0):.1f}ms, Trans: {latency_info.get('translate_ms', 0):.1f}ms, TTS: {latency_info.get('tts_ms', 0):.1f}ms, Total: {latency_info.get('total_ms', 0):.1f}ms)"
                            )
                        except Exception as e:
                            logger.error(f"Error processing completed TTS task: {e}")

                # Remove completed tasks
                for task_id in completed_tasks:
                    del pending_tts_tasks[task_id]

                # Check for pending transcripts
                pending_transcripts = connection_stt_service.get_pending_transcripts()
                for transcript_data in pending_transcripts:
                    # Send transcript immediately (without TTS for low latency)
                    transcript_without_tts = transcript_data.copy()
                    transcript_without_tts.pop("needs_tts", None)
                    transcript_without_tts["audio_data"] = None
                    transcript_without_tts["latency"]["tts_ms"] = 0
                    transcript_without_tts["latency"]["total_ms"] = round(
                        transcript_without_tts["latency"]["stt_ms"]
                        + transcript_without_tts["latency"]["translate_ms"],
                        2,
                    )

                    await websocket.send_json(transcript_without_tts)
                    logger.info(
                        f" Fast transcript sent: {transcript_data.get('original_text', 'unknown')}"
                    )

                    # Start TTS generation asynchronously if needed
                    if (
                        transcript_data.get("needs_tts")
                        and transcript_data.get("translated_text")
                        and connection_tts_service
                        and len(pending_tts_tasks) < 3  # Limit concurrent TTS tasks
                    ):
                        task_id = time.time()
                        task = asyncio.create_task(
                            _generate_tts_async(transcript_data, connection_tts_service)
                        )
                        pending_tts_tasks[task_id] = task
                        logger.info(
                            f" Started async TTS for: '{transcript_data['translated_text']}'"
                        )

                # Receive message with a small timeout so we can check transcripts regularly
                try:
                    message = await asyncio.wait_for(websocket.receive(), timeout=0.05)
                except asyncio.TimeoutError:
                    # No message received, continue to check for transcripts and TTS completions
                    continue

                if message["type"] == "websocket.receive" and "bytes" in message:
                    # Binary audio data - send to Deepgram only if streaming has started
                    if streaming_started:
                        audio_data = message["bytes"]
                        audio_size_mb = len(audio_data) / (1024 * 1024)

                        if audio_size_mb > 1.0:  # Large file (>1MB)
                            logger.info(
                                f" Received large audio file: {len(audio_data)} bytes ({audio_size_mb:.2f} MB)"
                            )
                            logger.info(" Processing entire file at once...")
                        else:
                            logger.debug(f"Received {len(audio_data)} bytes of audio")

                        connection_stt_service.send_audio(audio_data)
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
                                connection_stt_service.start_streaming(
                                    websocket, input_language, output_language, connection_translate_service
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
                            break
                    except Exception:
                        pass

            except Exception as e:
                logger.error(f"Error processing message: {e}")
                break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Clean up streaming for this connection
        connection_stt_service.stop_streaming()


async def _generate_tts_async(transcript_data, tts_service):
    """Generate TTS audio asynchronously"""
    tts_start_time = time.time()
    try:
        audio_bytes = await tts_service.text_to_speech(
            transcript_data["translated_text"]
        )
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

        return transcript_data, audio_bytes

    except Exception as tts_error:
        logger.error(f"Async TTS generation failed: {tts_error}")
        transcript_data["latency"]["tts_ms"] = 0
        return transcript_data, None


if __name__ == "__main__":
    logger.info(" Starting Optimized Voice Translation Backend with Async TTS")
    logger.info(" Using Eleven Labs WebSocket TTS with improved pipeline")
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
