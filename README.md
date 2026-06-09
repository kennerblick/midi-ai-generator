# MIDI AI Pattern Generator

A Docker-based full-stack application that generates MIDI patterns using AI. The backend leverages Anthropic's Claude API to understand music theory and create professional MIDI patterns across multiple genres (House, Techno, D&B).

## Features

- **Multiple Genres**: House, Techno, Drum & Bass
- **Customizable Parameters**: 
  - BPM (80-180)
  - Musical Key (9 different keys)
  - Pattern Length (4, 8, or 16 bars)
  - Components (Kick, Bass, Lead, Chords, Hi-Hat, Clap)
- **Real-time Generation**: AI-powered MIDI pattern generation
- **Downloadable Output**: Export patterns as .mid files
- **Dark-themed UI**: Modern, responsive interface

## Prerequisites

- Docker and Docker Compose
- Anthropic API key (get one at https://console.anthropic.com)

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/kennerblick/midi-ai-generator.git
   cd midi-ai-generator
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your Anthropic API key and optionally an Anthropic model name
   ```
   Example `.env`:
   ```env
   ANTHROPIC_API_KEY=your_api_key_here
   ANTHROPIC_MODEL=fable-5
   ```
   Common model names are:
   - `fable-5`
   - `opus-4.8`
   - `sonnet-4.6`
   - `haiku-4.5`

3. **Build and start the application**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API docs: http://localhost:8000/docs

## Usage

1. Open the frontend in your browser (http://localhost:3000)
2. Select your desired parameters:
   - Choose a genre
   - Adjust BPM using the slider
   - Select a musical key
   - Choose pattern length
   - Select components to include
3. Click "Generate" to create your MIDI pattern
4. Download the generated .mid file using the download button

## Project Structure

```
midi-ai-generator/
├── backend/           # FastAPI Python application
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py
├── frontend/          # React + Vite application
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── App.css
└── docker-compose.yml
```

## Environment Variables

Create a `.env` file in the root directory:

```
ANTHROPIC_API_KEY=your_api_key_here
```

## API Endpoints

### POST /generate
Generate a MIDI pattern.

**Request body:**
```json
{
  "genre": "house",
  "bpm": 125,
  "key": "Am",
  "bars": 8,
  "components": ["kick", "bass", "lead", "chords", "hihat", "clap"]
}
```

**Response:** Binary MIDI file

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Development

To stop the application:
```bash
docker-compose down
```

To rebuild:
```bash
docker-compose up --build
```

## License

MIT

## Author

kennerblick
