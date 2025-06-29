import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import { readFile } from 'fs/promises';
import Replicate from 'replicate';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });

// CORS config to allow frontend access
app.use(cors({
  origin: ['https://rogliang.github.io', 'https://tendertales.onrender.com'],
  methods: ['GET', 'POST'],
}));

app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Helper: Generate story prompt
function buildPrompt(name, interests) {
  return `Write a creative, imaginative, and heartwarming short story for a child named ${name} who loves ${interests}. The story should be written in simple, engaging language with whimsical details and a strong sense of wonder.`;
}

app.post('/generate-story', upload.single('photo'), async (req, res) => {
  const { name, interests } = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !interests) {
    return res.status(400).json({ error: 'Missing name or interests' });
  }

  try {
    // Step 1: Generate story
    const prompt = buildPrompt(name, interests);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a children’s story author.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 600,
    });

    const storyText = completion.choices[0].message.content;

    // Step 2: Generate cartoon-style image via SDXL (optional)
    let imageUrl = null;
    try {
      const output = await replicate.run(
        'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
        {
          input: {
            prompt: `A cartoon-style illustration of ${name} exploring a magical world filled with ${interests}`,
            width: 768,
            height: 768,
            refine: 'expert_ensemble_refiner',
            apply_watermark: false,
            num_inference_steps: 25,
          },
        }
      );
      if (Array.isArray(output) && output.length > 0) {
        imageUrl = output[0];
      }
    } catch (err) {
      console.warn('⚠️ Cartoon image generation failed:', err.message);
    }

    // Step 3: Construct HTML story response
    const storyHtml = `
      <div style="overflow: hidden;">
        ${photoPath ? `<img src="${photoPath}" alt="Uploaded photo" style="float: right; max-width: 200px; margin-left: 20px; border-radius: 10px;" />` : ''}
        ${imageUrl ? `<img src="${imageUrl}" alt="AI-generated cartoon" style="float: left; max-width: 200px; margin-right: 20px; border-radius: 10px;" />` : ''}
        <p style="font-size: 18px; line-height: 1.6;">${storyText}</p>
      </div>
    `;

    res.json({ story: storyHtml });
  } catch (error) {
    console.error('❌ Error generating story:', error);
    res.status(500).json({ error: 'Failed to generate story' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
