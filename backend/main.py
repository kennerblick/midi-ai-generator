import os
import io
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from anthropic import Anthropic
from midiutil import MIDIFile

app = FastAPI(title="MIDI AI Pattern Generator")

# Configure Anthropic client using environment variable if provided
anthropic_key = os.getenv("ANTHROPIC_API_KEY")
if anthropic_key:
    client = Anthropic(api_key=anthropic_key)
else:
    client = Anthropic()

# Allow frontend origins to access the API (adjust if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:9595", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    genre: str
    bpm: int
    key: str
    bars: int
    components: list[str]

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}

@app.post("/generate")
async def generate(request: GenerateRequest):
    """Generate a MIDI pattern based on user parameters"""
    
    # Validate inputs
    if request.genre not in ["house", "techno", "dnb"]:
        raise HTTPException(status_code=400, detail="Invalid genre")
    if not (80 <= request.bpm <= 180):
        raise HTTPException(status_code=400, detail="BPM must be between 80 and 180")
    if request.bars not in [4, 8, 16]:
        raise HTTPException(status_code=400, detail="Bars must be 4, 8, or 16")
    
    valid_keys = ["Am", "Cm", "Fm", "Gm", "Dm", "Em", "C", "F", "G"]
    if request.key not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Invalid key. Valid keys: {valid_keys}")
    
    valid_components = ["kick", "bass", "lead", "chords", "hihat", "clap"]
    if not all(comp in valid_components for comp in request.components):
        raise HTTPException(status_code=400, detail=f"Invalid components. Valid: {valid_components}")
    
    # Build the prompt for Claude
    prompt = f"""You are a professional music producer and composer specializing in {request.genre.upper()} music.

Generate a MIDI pattern with the following specifications:
- Genre: {request.genre.upper()}
- BPM: {request.bpm}
- Musical Key: {request.key}
- Pattern Length: {request.bars} bars
- Components: {', '.join(request.components)}

For each component, provide a JSON structure with track name and MIDI notes. Each note should have:
- pitch: MIDI note number (0-127)
- start_beat: beat number where note starts (0-based, relative to total beats)
- duration: duration in beats
- velocity: MIDI velocity (0-127, typically 64-100)

Guidelines:
- Typical beats per bar: 4
- Total beats: {request.bars * 4}
- Consider the musical key when choosing pitches
- Create rhythmically interesting patterns typical of {request.genre}
- Kick drums are usually on beats 0 and 2 (or all 4 beats)
- Bass lines should complement the key and genre
- Lead melodies should be 1-2 octaves higher
- Chords should fill harmonic space
- Hi-hats add rhythmic texture with high velocities and short durations
- Claps add groove and emphasis

Respond with ONLY valid JSON (no markdown, no extra text) in this exact format:
{{
  "tracks": [
    {{
      "name": "kick",
      "notes": [
        {{"pitch": 36, "start_beat": 0, "duration": 1, "velocity": 100}},
        {{"pitch": 36, "start_beat": 2, "duration": 1, "velocity": 100}}
      ]
    }}
  ]
}}
"""

    try:
        # Determine which Anthropic model to call (override via env)
        model_name = os.getenv("ANTHROPIC_MODEL", "claude-2")

        # Call Claude API
        message = client.messages.create(
            model=model_name,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        # Parse Claude's response
        # Newer clients may return different shapes; try to access body robustly
        if hasattr(message, 'content') and isinstance(message.content, (list, tuple)):
            response_text = message.content[0].text
        else:
            # Fallback to str(message)
            response_text = str(message)

        pattern_data = json.loads(response_text)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON from Anthropic: {str(e)}")
    except Exception as e:
        # Surface Anthropic error details for diagnosis
        raise HTTPException(status_code=500, detail=f"Error generating pattern: {str(e)}")
    
    # Create MIDI file
    try:
        midi = MIDIFile(len(pattern_data.get("tracks", [])))
        track = 0
        
        for track_data in pattern_data.get("tracks", []):
            # Set tempo and track name
            midi.addTempo(track, 0, request.bpm)
            midi.addTrackName(track, 0, track_data.get("name", f"Track {track}"))
            
            # Add notes to the track
            for note in track_data.get("notes", []):
                midi.addNote(
                    track,
                    channel=0,
                    pitch=int(note.get("pitch", 60)),
                    time=float(note.get("start_beat", 0)),
                    duration=float(note.get("duration", 1)),
                    volume=int(note.get("velocity", 64))
                )
            
            track += 1
        
        # Write MIDI to bytes buffer
        midi_buffer = io.BytesIO()
        midi.writeFile(midi_buffer)
        midi_buffer.seek(0)
        midi_bytes = midi_buffer.getvalue()

        # Return MIDI file as a streaming response with proper headers
        headers = {"Content-Disposition": f"attachment; filename=pattern_{request.genre}_{request.bpm}bpm.mid"}
        return StreamingResponse(io.BytesIO(midi_bytes), media_type="audio/midi", headers=headers)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating MIDI file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
