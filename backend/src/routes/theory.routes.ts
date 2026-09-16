import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { chat } from '../services/llm.service.js';

export const theoryRouter = Router();

theoryRouter.post('/ask', requireAuth, async (req: Request, res: Response) => {
  try {
    const { scenarioId, question } = req.body;
    if (!scenarioId || !question) {
      return res.status(400).json({ error: 'scenarioId dan question wajib diisi.' });
    }

    // Ambil data skenario, modul, teori, dan arahan
    const { rows } = await query(
      `SELECT s.id, s.name, s.description, s.theory_briefing, s.passing_tips,
              m.name AS module_name, m.code AS module_code
       FROM trainer_scenarios s
       JOIN trainer_modules m ON s.module_id = m.id
       WHERE s.id = $1`,
      [scenarioId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Skenario tidak ditemukan.' });
    }

    const sc = rows[0]!;

    const systemPrompt = `Anda adalah Mentor Senior AI untuk Sales B2G PT Aston Graphindo Indonesia (ORIMAX). 
Tugas Anda adalah menjawab pertanyaan sales mengenai teori materi latihan yang sedang mereka pelajari.

ATURAN KETAT:
1. Batasi jawaban HANYA pada konteks materi modul ini: "${sc.module_code}: ${sc.module_name}" - Skenario "${sc.name}".
2. Teori resmi materi ini:
${sc.theory_briefing || 'Tidak ada teori khusus.'}
3. Arahan agar lulus:
${sc.passing_tips || 'Ikuti instruksi skenario.'}
4. Jika sales bertanya di luar topik materi ini (misal tentang politik, topik lain, atau di luar B2G/ORIMAX), tolak dengan sopan dan arahkan kembali ke materi "${sc.name}".
5. Berikan jawaban dalam bahasa Indonesia yang ringkas, tegas, bernada mentor profesional, maksimal 3-4 kalimat/poin penting.`;

    const result = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ]);

    res.json({ answer: result.content });
  } catch (err) {
    console.error('[theory-ask] error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
