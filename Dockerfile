# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies including ffmpeg for video processing
RUN apt-get update && apt-get install -y \
    gcc \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY simple_backend_websocket_tts.py .
COPY simple_test.html .
COPY index.html .

# Create a simple startup script that serves both backend and HTML
RUN echo '#!/bin/bash\n\
echo "🚀 Starting Voice Translation Backend with Docker"\n\
echo "📱 Frontend available at: http://192.168.50.72:8000"\n\
echo "🔗 WebSocket endpoint: ws://192.168.50.72:8000/stt-test"\n\
uvicorn simple_backend_websocket_tts:app --host 0.0.0.0 --port 8000\n\
' > start.sh && chmod +x start.sh

# Expose port 8000
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# Start the application
CMD ["./start.sh"]