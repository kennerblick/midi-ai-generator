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
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    genre: str
    bpm: int
    key: str
    bars: int
    style: str | None = None
    components: list[str]
    instruments: list[str] | None = None

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
    
    valid_components = [
        "kick",
        "bass",
        "lead",
        "chords",
        "hihat",
        "clap",
        "pad",
        "strings",
        "arp",
        "synth",
        "percussion",
    ]
    instruments = request.instruments or request.components
    if not instruments:
        raise HTTPException(status_code=400, detail="You must select at least one instrument.")
    if not all(comp in valid_components for comp in instruments):
        raise HTTPException(status_code=400, detail=f"Invalid instruments. Valid: {valid_components}")

    if request.style:
        style_text = f"Use the style of {request.style}."
    else:
        style_text = "Use an original modern electronic dance music style."

    if not anthropic_key:
        raise HTTPException(
            status_code=500,
            detail="Anthropic API key is not configured. Set ANTHROPIC_API_KEY in the environment."
        )

    # Build the prompt for Claude
    prompt = f"""You are a professional music producer and composer specializing in {request.genre.upper()} music.

Generate a MIDI pattern with the following specifications:
- Genre: {request.genre.upper()}
- BPM: {request.bpm}
- Musical Key: {request.key}
- Pattern Length: {request.bars} bars
- Instruments: {', '.join(instruments)}
- Style: {request.style or 'original modern electronic dance music style'}

{style_text}

For each instrument, provide a JSON structure with track name and MIDI notes. Each note should have:
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
        model_override = os.getenv("ANTHROPIC_MODEL")
        # Try a broad set of candidate model IDs. Some Anthropic accounts expose
        # claude-{family}-{version} style IDs (e.g. claude-sonnet-4-6) while
        # others may expose short names (e.g. sonnet-4.6). Allow comma-separated
        # override via ANTHROPIC_MODEL.
        default_candidates = [
            # Claude-style fully qualified IDs
            "claude-fable-5",
            "claude-opus-4-8",
            "claude-sonnet-4-6",
            "claude-haiku-4-5",
            # Short or legacy variants (some accounts use these)
            "fable-5",
            "opus-4.8",
            "sonnet-4.6",
            "haiku-4.5",
            # Fallback older names
            "claude-2",
        ]

        if model_override:
            # Allow user to provide one or multiple comma-separated overrides
            model_candidates = [m.strip() for m in model_override.split(",") if m.strip()]
        else:
            model_candidates = default_candidates
        pattern_data = None
        last_error = None

        def extract_text(block):
            if block is None:
                return ""
            if isinstance(block, str):
                return block
            if isinstance(block, (list, tuple)):
                return "".join(extract_text(item) for item in block)
            if hasattr(block, "text"):
                return extract_text(block.text)
            if hasattr(block, "content"):
                return extract_text(block.content)
            if hasattr(block, "parts"):
                return extract_text(block.parts)
            if hasattr(block, "data"):
                return extract_text(block.data)
            return str(block)

        def extract_json_payload(text: str):
            if not text:
                return None

            stripped = text.strip()
            if stripped.startswith("```") and stripped.endswith("```"):
                stripped = "\n".join(stripped.splitlines()[1:-1]).strip()

            decoder = json.JSONDecoder()
            for start_char in ('{', '['):
                idx = stripped.find(start_char)
                while idx != -1:
                    try:
                        obj, _ = decoder.raw_decode(stripped[idx:])
                        return obj
                    except json.JSONDecodeError:
                        idx = stripped.find(start_char, idx + 1)
            return None

        for model_name in model_candidates:
            if not model_name:
                continue
            print(f"[backend] Attempting Anthropic model: {model_name}")
            try:
                message = client.messages.create(
                    model=model_name,
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}],
                )
            except Exception as call_exc:
                print(f"[backend] Anthropic call error for model {model_name}:", repr(call_exc))
                last_error = call_exc
                continue

            if hasattr(message, 'content'):
                response_text = extract_text(message.content)
            elif hasattr(message, 'output'):
                response_text = extract_text(message.output)
            elif hasattr(message, 'completion'):
                response_text = extract_text(message.completion)
            else:
                response_text = str(message)

            try:
                pattern_data = json.loads(response_text)
                break
            except json.JSONDecodeError as e:
                pattern_data = extract_json_payload(response_text)
                if pattern_data is not None:
                    break
                print(f"[backend] Failed to parse Anthropic response for model {model_name}:", response_text)
                last_error = e
                continue

        if pattern_data is None:
            if last_error is not None:
                detail_msg = str(last_error)
                if hasattr(last_error, 'args'):
                    detail_msg += " | args:" + repr(last_error.args)
            else:
                detail_msg = "unknown Anthropic error"
            raise HTTPException(
                status_code=500,
                detail=(
                    "Error generating pattern: unable to use any Anthropic model "
                    f"(tried {model_candidates}). last error: {detail_msg}"
                ),
            )

        if not isinstance(pattern_data, dict) or not isinstance(pattern_data.get("tracks"), list):
            raise HTTPException(
                status_code=500,
                detail="Error generating pattern: Anthropic response did not include a valid 'tracks' array."
            )

        valid_tracks = [
            t for t in pattern_data.get("tracks", [])
            if isinstance(t, dict) and isinstance(t.get("notes"), list) and len(t.get("notes", [])) > 0
        ]
        if not valid_tracks:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Error generating pattern: Anthropic response contained no valid MIDI tracks with notes. "
                    "Please try again or adjust the prompt/model."
                ),
            )

    except HTTPException:
        raise
    except Exception as e:
        detail_msg = str(e)
        if hasattr(e, 'args'):
            detail_msg += " | args:" + repr(e.args)
        raise HTTPException(status_code=500, detail=f"Error generating pattern: {detail_msg}")
    
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
