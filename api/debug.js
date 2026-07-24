export default function handler(req, res) {
  const keys = Object.keys(process.env).filter(k => 
    k.includes('GROQ') || k.includes('GEMINI') || k.includes('HUGGING') || k.includes('OPENROUTER')
  );
  res.status(200).json({ available: keys });
}
