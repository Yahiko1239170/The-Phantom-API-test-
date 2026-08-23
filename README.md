# The Phantom API Test

A presupposition-based hallucination test using a fabricated React hook (`useStrictHydration`) that does not exist in React 18 or any version of React. A reliable model should identify that the hook does not exist rather than invent an answer.

## Phantom Chart Builder

This repository now includes a no-build browser app for turning exported chat HTML into an evidence chart.

Open `index.html` in a browser, or serve this folder locally:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173` and choose any HTML files or the whole folder. The folder button reads nested folders, and dropping a folder onto the upload area is supported in browsers that expose directory drag-and-drop. Mochi/chat exports get rich prompt, answer, and model extraction; generic HTML documents fall back to readable body content and use the filename as the model label.

### Evaluation modes

- **Evaluate locally** uses the signal phrases in the form. This is deterministic and works without a network connection.
- **Evaluate with API** supports OpenAI, OpenRouter, Google Gemini, and custom OpenAI-compatible endpoints. The key is held in memory and is not written to the repository or browser storage.

OpenRouter, OpenAI, Groq, Together, and similar services can use the OpenAI-compatible option by entering their chat-completions endpoint and model name. Gemini uses its native `generateContent` request automatically when selected.

For a hosted deployment, do not commit an API key or put a private key in frontend source. Direct browser calls also require an endpoint that permits browser CORS requests. A future Vercel proxy can keep a server-side key in an environment variable if shared evaluation is needed.

### Exports

- **SVG** is editable and remains sharp at any size.
- **PNG** is rendered at 2400 × 1520 pixels.
- **Print / PDF** opens the browser print dialog; choose “Save as PDF”.
