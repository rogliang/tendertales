const OpenAI = require('openai');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
dotenv.config({ path: './pw.env' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 🖼️ Generate cartoon image via Replicate API
async function generateCartoonImage(promptText) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: '7be6b426d8be3d0aa2e5e1ab60fcdbd97cfd35713e13c7ab4da13ade9a8cde7b',
      input: {
        prompt: promptText,
        width: 1024,
        height: 1024,
        style: "cute",
        quality: "standard"
      }
    })
  });

  const prediction = await response.json();
  const statusUrl = prediction.urls.get;

  while (true) {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` }
    });
    const statusJson = await statusRes.json();
    if (statusJson.status === 'succeeded') return statusJson.output[0];
    if (statusJson.status === 'failed') throw new Error('❌ Replicate generation failed');
    await new Promise((res) => setTimeout(res, 1000));
  }
}

// 📖 Endpoint to handle story + image generation
app.post('/generate-story', upload.single('photo'), async (req, res) => {
  const { name, interests } = req.body;
  const photoPath = req.file?.path;

  try {
    let imageDescription = '';
    if (photoPath) {
      const base64Image = fs.readFileSync(photoPath, { encoding: 'base64' });
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Describe this image in one sentence for a children's story cover.` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ]
      });
      imageDescription = visionResponse.choices[0].message.content;
    }

    const storyPrompt = `You are a warm, imaginative storyteller creating a short children's bedtime story. Focus on it being fantasy. Make sure this is appropriate for children.

Use this context:
- Child's name: ${name}
- Traits or interests: ${interests}

Write a 300-word original story starring ${name}. Keep it whimsical, safe, imaginative, and age-appropriate. Avoid violence or mature themes. Use simple language and include a gentle moral if appropriate.`;

    const storyResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: storyPrompt }]
    });

    const story = storyResponse.choices[0].message.content;

    let imageURL = '';
    if (imageDescription) {
      const cartoonPrompt = `Create a whimsical, fantasy-style cartoon cover image for a children's story. Include characters that look like: ${imageDescription}`;
      imageURL = await generateCartoonImage(cartoonPrompt);
    }

    if (photoPath) fs.unlinkSync(photoPath); // cleanup temp file

    res.json({ story, imageURL });
  } catch (error) {
    console.error('❌ Error generating story:', error);
    res.status(500).json({ error: 'Failed to generate story' });
  }
});

app.listen(port, () => console.log(`✅ Server running on http://localhost:${port}`));
