import { useEffect, useRef, useState } from 'react'
import { Midi } from '@tonejs/midi'
import * as Tone from 'tone'
import './App.css'

const GENRE_PRESETS = {
  house: 125,
  techno: 135,
  dnb: 174
}

const VALID_KEYS = ['Am', 'Cm', 'Fm', 'Gm', 'Dm', 'Em', 'C', 'F', 'G']
const INSTRUMENT_OPTIONS = ['kick', 'bass', 'lead', 'chords', 'hihat', 'clap', 'pad', 'strings', 'arp', 'synth', 'percussion']

const formatLabel = (label) => label.charAt(0).toUpperCase() + label.slice(1)

function App() {
  const [genre, setGenre] = useState('house')
  const [bpm, setBpm] = useState(125)
  const [key, setKey] = useState('Am')
  const [bars, setBars] = useState(8)
  const [style, setStyle] = useState('')
  const [instruments, setInstruments] = useState(new Set(INSTRUMENT_OPTIONS))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [generatedData, setGeneratedData] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [midiData, setMidiData] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const partsRef = useRef([])
  const synthsRef = useRef([])

  const apiUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`
  const selectedInstruments = Array.from(instruments)

  const handleGenreChange = (newGenre) => {
    setGenre(newGenre)
    setBpm(GENRE_PRESETS[newGenre])
    setError('')
  }

  const handleInstrumentChange = (instrument) => {
    const updated = new Set(instruments)
    if (updated.has(instrument)) {
      updated.delete(instrument)
    } else {
      updated.add(instrument)
    }
    setInstruments(updated)
  }

  const createSynth = (trackName) => {
    const lowerName = trackName.toLowerCase()

    if (lowerName.includes('kick')) {
      return new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 10,
        envelope: { attack: 0.001, decay: 0.15, sustain: 0.01, release: 0.15 }
      }).toDestination()
    }

    if (lowerName.includes('hihat') || lowerName.includes('clap') || lowerName.includes('percussion')) {
      return new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.1 }
      }).toDestination()
    }

    if (lowerName.includes('bass')) {
      return new Tone.MonoSynth({
        oscillator: { type: 'square' },
        filter: { Q: 2, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.8 }
      }).toDestination()
    }

    if (lowerName.includes('chords') || lowerName.includes('strings') || lowerName.includes('pad')) {
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.1, decay: 0.3, sustain: 0.6, release: 1.2 }
      }).toDestination()
    }

    return new Tone.Synth({
      oscillator: { type: lowerName.includes('lead') ? 'sawtooth' : 'triangle' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 1 }
    }).toDestination()
  }

  const stopPlayback = () => {
    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    partsRef.current.forEach((part) => part.dispose())
    synthsRef.current.forEach((instrument) => instrument.dispose())
    partsRef.current = []
    synthsRef.current = []
    setIsPlaying(false)
  }

  const handlePlay = async () => {
    if (!midiData) {
      return
    }

    await Tone.start()
    stopPlayback()

    const instrumentsMap = {}
    const parts = []

    midiData.tracks.forEach((track) => {
      if (!track.notes.length) {
        return
      }

      const trackName = track.name || 'synth'
      const synthKey = ['kick', 'hihat', 'clap', 'percussion', 'bass', 'lead', 'chords', 'strings', 'pad', 'arp', 'synth']
        .find((key) => trackName.toLowerCase().includes(key)) || 'synth'

      if (!instrumentsMap[synthKey]) {
        instrumentsMap[synthKey] = createSynth(synthKey)
      }

      const synth = instrumentsMap[synthKey]
      const notes = track.notes.map((note) => ({
        time: note.time + 0.1,
        note: note.name,
        duration: note.duration,
        velocity: note.velocity / 127
      }))

      const part = new Tone.Part((time, note) => {
        synth.triggerAttackRelease(note.note, note.duration, time, note.velocity)
      }, notes).start(0)

      parts.push(part)
    })

    partsRef.current = parts
    synthsRef.current = Object.values(instrumentsMap)
    Tone.Transport.bpm.value = bpm
    Tone.Transport.start('+0.1')
    setIsPlaying(true)
  }

  useEffect(() => {
    return () => {
      stopPlayback()
    }
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    setSuccess(false)
    setGeneratedData(null)
    setDownloadUrl(null)
    setMidiData(null)
    stopPlayback()

    try {
      const response = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          genre,
          bpm,
          key,
          bars,
          style: style.trim() || undefined,
          components: selectedInstruments,
          instruments: selectedInstruments
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error ${response.status}: ${response.statusText} - ${errorText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: 'audio/midi' })
      const url = URL.createObjectURL(blob)
      const midi = new Midi(arrayBuffer)

      setDownloadUrl(url)
      setMidiData(midi)
      setSuccess(true)

      const fileName = `pattern_${genre}_${bpm}bpm.mid`
      setGeneratedData({
        fileName,
        genre,
        bpm,
        key,
        bars,
        style: style.trim() || 'Original',
        instruments: selectedInstruments
      })
    } catch (err) {
      setError(err.message || 'Failed to generate pattern')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = generatedData?.fileName || `pattern_${genre}_${bpm}bpm.mid`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🎹 MIDI AI Pattern Generator</h1>
        <p>Generate professional MIDI patterns powered by AI</p>
      </header>

      <main className="main">
        <div className="controls">
          {/* Genre Selector */}
          <div className="control-group">
            <label>Genre</label>
            <div className="button-group">
              {Object.keys(GENRE_PRESETS).map((g) => (
                <button
                  key={g}
                  className={`genre-btn ${genre === g ? 'active' : ''}`}
                  onClick={() => handleGenreChange(g)}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* BPM Slider */}
          <div className="control-group">
            <label>BPM: <span className="value">{bpm}</span></label>
            <input
              type="range"
              min="80"
              max="180"
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value))}
              className="slider"
            />
            <div className="range-labels">
              <span>80</span>
              <span>180</span>
            </div>
          </div>

          {/* Key Selector */}
          <div className="control-group">
            <label htmlFor="key">Musical Key</label>
            <select
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="select"
            >
              {VALID_KEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Style Input */}
          <div className="control-group">
            <label htmlFor="style">Style / Artist / Band</label>
            <input
              id="style"
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. Daft Punk, Tale Of Us, or classic house"
              className="text-input"
            />
          </div>

          {/* Bars Selector */}
          <div className="control-group">
            <label>Pattern Length (Bars)</label>
            <div className="button-group">
              {[4, 8, 16].map((b) => (
                <button
                  key={b}
                  className={`bars-btn ${bars === b ? 'active' : ''}`}
                  onClick={() => setBars(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Instrument Selection */}
          <div className="control-group">
            <label>Instruments</label>
            <div className="checkbox-group columns">
              {INSTRUMENT_OPTIONS.map((instrument) => (
                <label key={instrument} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={instruments.has(instrument)}
                    onChange={() => handleInstrumentChange(instrument)}
                  />
                  <span>{formatLabel(instrument)}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || instruments.size === 0}
            className="generate-btn"
          >
            {loading ? 'Generating...' : '✨ Generate'}
          </button>
        </div>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {success && generatedData && (
          <div className="success-section">
            <div className="success-message">
              ✅ Pattern generated successfully!
            </div>

            <div className="pattern-info">
              <h3>Generated Pattern</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Genre:</span>
                  <span className="value">{generatedData.genre.toUpperCase()}</span>
                </div>
                <div className="info-item">
                  <span className="label">BPM:</span>
                  <span className="value">{generatedData.bpm}</span>
                </div>
                <div className="info-item">
                  <span className="label">Key:</span>
                  <span className="value">{generatedData.key}</span>
                </div>
                <div className="info-item">
                  <span className="label">Bars:</span>
                  <span className="value">{generatedData.bars}</span>
                </div>
                <div className="info-item">
                  <span className="label">Style:</span>
                  <span className="value">{generatedData.style}</span>
                </div>
                <div className="info-item full-width">
                  <span className="label">Instruments:</span>
                  <span className="value">{generatedData.instruments.join(', ')}</span>
                </div>
              </div>
            </div>

            <div className="button-row">
              <button
                onClick={handleDownload}
                className="download-btn"
              >
                ⬇️ Download MIDI
              </button>
              <button
                onClick={isPlaying ? stopPlayback : handlePlay}
                className="playback-btn"
                disabled={!midiData}
              >
                {isPlaying ? '⏹ Stop' : '🎧 Play'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Powered by Anthropic Claude & React</p>
      </footer>
    </div>
  )
}

export default App
