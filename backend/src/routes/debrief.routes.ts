import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { chat } from '../services/llm.service.js';

export const debriefRouter = Router();

debriefRouter.post('/debrief/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId dan message wajib diisi.' });
    }

    const { rows } = await query<{
      overall_score: number;
      strengths: string[];
      weaknesses: string[];
      critical_errors: string[];
      recommendation: string;
      scenario_name: string;
      module_name: string;
    }>(
      `SELECT e.overall_score, e.strengths, e.weaknesses, e.critical_errors, e.recommendation,
              sc.name AS scenario_name, m.name AS module_name
       FROM trainer_evaluations e
       JOIN trainer_sessions s ON e.session_id = s.id
       JOIN trainer_scenarios sc ON s.scenario_id = sc.id
       JOIN trainer_modules m ON sc.module_id = m.id
       WHERE s.id = $1`,
      [sessionId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Sesi latihan atau evaluasi tidak ditemukan.' });
    }

    const ev = rows[0]!;
    const userMsg = String(message).slice(0, 1000);

    const systemPrompt = `[PERINTAH MUTLAK]
Kamu adalah Coach AI ORIMAX, pelatih sales B2G senior di PT Aston Graphindo Indonesia.
Kamu sedang mengevaluasi sesi latihan sales bernilai ${ev.overall_score}/100 pada skenario "${ev.scenario_name}" (${ev.module_name}).
Kelemahan sales: ${ev.weaknesses.join('; ')}
Kesalahan fatal: ${ev.critical_errors.join('; ')}
Rekomendasi coach: ${ev.recommendation}

Pertanyaan sales: "${userMsg}"
INSTRUKSI:
- Jawab secara langsung dalam 3-4 kalimat padat.
- Sebutkan kenapa nilai ${ev.overall_score} dan berikan 1 contoh naskah kalimat (script) persis yang benar untuk diucapkan sales ke PPK.
- JANGAN PERNAH MENYEBUTKAN KUIS, SEKOLAH, ATAU TOEFL. Kamu adalah pelatih sales B2G ORIMAX.`;

    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      { temperature: 0.1, maxTokens: 300 },
    );

    res.json({ reply: result.content });
  } catch (err) {
    console.error('[debrief-chat] error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
