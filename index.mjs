import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import { readFile } from 'fs/promises';
import Replicate from 'replicate';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: 'pw.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });

// CORS config - more permissive for testing
app.use(cors({
  origin: '*', // Allow all origins for now - restrict this in production
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Add a root route to test if server is running
app.get('/', (req, res) => {
  res.json({ 
    message: 'TenderTales API is running!', 
    endpoints: {
      'POST /generate-story': 'Generate a story with name, interests, and optional photo'
    }
  });
});

// Add a health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Helper: Generate story prompt
function buildPrompt(name, interests) {
  return `Write a creative, imaginative, and heartwarming short story for a child named ${name} who loves ${interests}. The story should be written in simple, engaging language with whimsical details and a strong sense of wonder.`;
}

app.post('/generate-story', upload.single('photo'), async (req, res) => {
  console.log('📝 Received story generation request:', req.body);
  
  const { name, interests } = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !interests) {
    console.error('❌ Missing required fields:', { name, interests });
    return res.status(400).json({ error: 'Missing name or interests' });
  }

  try {
    // Step 1: Generate story
    const prompt = buildPrompt(name, interests);
    console.log('🤖 Generating story with OpenAI...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a children\'s story author.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 600,
    });

    const storyText = completion.choices[0].message.content;
    console.log('✅ Story generated successfully');

    // Step 2: Generate cartoon-style image via SDXL (optional)
    let imageUrl = null;
    try {
      console.log('🎨 Generating cartoon image...');
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
        console.log('✅ Cartoon image generated successfully');
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

    console.log('✅ Story response prepared');
    res.json({ story: storyHtml });
  } catch (error) {
    console.error('❌ Error generating story:', error);
    res.status(500).json({ error: 'Failed to generate story', details: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('❌ 404 - Route not found:', req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
  console.log(`✅ TenderTales server listening on port ${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 CORS enabled for all origins`);
});