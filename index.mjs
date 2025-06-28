import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

const app = express();
const port = 3000;
dotenv.config({ path: './pw.env' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use(express.static(path.join(process.cwd())));

app.post('/generate-story', upload.single('photo'), async (req, res) => {
  const { name, interests } = req.body;
  const photo = req.file;

  if (!name || !interests) {
    return res.status(400).json({ error: 'Missing name or interests' });
  }

  const prompt = `
  Write a magical, imaginative children's story for a child named "${name}" who loves ${interests}.

  The story should:
  - Be heartwarming and adventurous
  - Use a whimsical and lyrical tone
  - Be written in the third person
  - Be at least 500 words long
  - Include a clear beginning, middle, and end
  - Take place in a fantastical world that reflects the child's interests
  - Use simple language suitable for a child aged 3–7
  - Optionally, incorporate gentle lessons about kindness, curiosity, or bravery
  `;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a children\'s book author.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 1000
    });

    const storyText = chatResponse.choices[0].message.content.trim();

    let storyHtml = `<div style="overflow: hidden; font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;">`;
    if (photo) {
      const imageUrl = `/uploads/${photo.filename}`;
      storyHtml += `<img src="${imageUrl}" style="float: left; margin: 10px; max-width: 200px; border-radius: 10px;" />`;
    }
    storyHtml += `<p style="font-size: 18px; line-height: 1.6;">${storyText.replace(/\n/g, '<br/>')}</p></div>`;

    res.json({ story: storyHtml });
  } catch (error) {
    console.error('❌ Error generating story:', error);
    res.status(500).json({ error: 'Failed to generate story' });
  }
});

app.listen(port, () => {
  console.log(`TenderTales server running at http://localhost:${port}`);
});
