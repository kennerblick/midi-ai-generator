import { useState } from 'react'
import './App.css'

const GENRE_PRESETS = {
  house: 125,
  techno: 135,
  dnb: 174
}

const VALID_KEYS = ['Am', 'Cm', 'Fm', 'Gm', 'Dm', 'Em', 'C', 'F', 'G']
const COMPONENTS_LIST = ['kick', 'bass', 'lead', 'chords', 'hihat', 'clap']

function App() {
  const [genre, setGenre] = useState('house')
  const [bpm, setBpm] = useState(125)
  const [key, setKey] = useState('Am')
  const [bars, setBars] = useState(8)
  const [components, setComponents] = useState(new Set(COMPONENTS_LIST))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [generatedData, setGeneratedData] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)

  const apiUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`

  const handleGenreChange = (newGenre) => {
    setGenre(newGenre)
    setBpm(GENRE_PRESETS[newGenre])
    setError('')
  }

  const handleComponentChange = (component) => {
    const newComponents = new Set(components)
    if (newComponents.has(component)) {
      newComponents.delete(component)
    } else {
      newComponents.add(component)
    }
    setComponents(newComponents)
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    setSuccess(false)
    setGeneratedData(null)
    setDownloadUrl(null)

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
          components: Array.from(components)
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error ${response.status}: ${response.statusText} - ${errorText}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      setSuccess(true)

      // Create a simple text representation
      const fileName = `pattern_${genre}_${bpm}bpm.mid`
      setGeneratedData({
        fileName,
        genre,
        bpm,
        key,
        bars,
        components: Array.from(components)
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
      a.download = `pattern_${genre}_${bpm}bpm.mid`
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
              {Object.keys(GENRE_PRESETS).map(g => (
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
              {VALID_KEYS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Bars Selector */}
          <div className="control-group">
            <label>Pattern Length (Bars)</label>
            <div className="button-group">
              {[4, 8, 16].map(b => (
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

          {/* Components Checkboxes */}
          <div className="control-group">
            <label>Components</label>
            <div className="checkbox-group">
              {COMPONENTS_LIST.map(comp => (
                <label key={comp} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={components.has(comp)}
                    onChange={() => handleComponentChange(comp)}
                  />
                  <span>{comp.charAt(0).toUpperCase() + comp.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || components.size === 0}
            className="generate-btn"
          >
            {loading ? 'Generating...' : '✨ Generate'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {/* Success Display */}
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
                <div className="info-item full-width">
                  <span className="label">Components:</span>
                  <span className="value">{generatedData.components.join(', ')}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleDownload}
              className="download-btn"
            >
              ⬇️ Download MIDI
            </button>
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
