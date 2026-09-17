import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { chat } from '../services/llm.service.js';

export const theoryRouter = Router();

/**
 * Kata kunci yang menandakan pertanyaan di luar konteks materi sales B2G.
 *
 * Kenapa filter ini ada di kode, bukan hanya di system prompt: model yang
 * tersedia di gateway (deepseek/glm/kimi/minimax) terbukti TIDAK patuh pada
 * instruksi "batasi bahasan" di system prompt — diuji langsung, semuanya tetap
 * menjawab pertanyaan umum (politik, resep, dsb). Guardrail yang hanya
 * mengandalkan kepatuhan model = tidak ada guardrail. Jadi kita tolak di
 * lapisan aplikasi: pre-filter (pertanyaan) + post-filter (jawaban model).
 */
const OOT_QUESTION_PATTERNS: RegExp[] = [
  /\b(politik|presiden|wakil presiden|pemilu|pilpres|partai|menteri|dpr|mpr|gubernur|caleg|kampanye)\b/i,
  /\b(berita|kabar terbaru|update terbaru|headline|hoax|hoaks)\b/i,
  /\b(resep|masak|memasak|kue|cake|makanan|kuliner|bumbu)\b/i,
  /\b(kesehatan|penyakit|obat|dokter|diet|olahraga|vitamin)\b/i,
  /\b(cuaca|gempa|banjir|bencana|ramalan)\b/i,
  /\b(saham|crypto|kripto|bitcoin|forex|trading|judi|slot)\b/i,
  /\b(agama|ibadah|doa|kitab|surga|neraka)\b/i,
  /\b(pacar|jodoh|cinta|mantan|pernikahan|nikah)\b/i,
  /\b(film|artis|selebgram|musik|lagu|game|gim|bola|sepak bola)\b/i,
  /\b(cara membuat|bagaimana cara membuat|tuliskan puisi|buatkan puisi|cerita lucu|lelucon|pantun)\b/i,
];

/** Penanda jawaban model yang keluar dari konteks materi. */
const OOT_ANSWER_PATTERNS: RegExp[] = [
  /\b(presiden|wakil presiden|pemilu|pilpres|partai politik|calon presiden)\b/i,
  /\b(resep|memasak|cara membuat kue|bahan-bahan|adonan)\b/i,
  /\b(soekarno|soeharto|habibie|gus dur|susilo bambang|jokowi|prabowo|gibran)\b/i,
  /\b(bitcoin|crypto|saham|forex|judi|slot gacor)\b/i,
  /\b(cuaca hari ini|ramalan zodiak|zodiak)\b/i,
];

/** Penanda jawaban model yang minta klarifikasi alih-alih langsung menjawab. */
const CLARIFY_PATTERNS: RegExp[] = [
  /perlu klarifikasi/i,
  /butuh klarifikasi/i,
  /minta klarifikasi/i,
  /bisakah anda (jelaskan|memberi tahu)/i,
  /supaya saya bisa bantu/i,
  /agar saya bisa (bantu|membantu)/i,
  /tolong beri tahu saya/i,
  /konteksnya apa/i,
  /apa maksud anda/i,
  /yang anda maksud/i,
];

const REFUSAL_TEMPLATE = (scenarioName: string) =>
  `Maaf, pertanyaan itu di luar materi latihan "${scenarioName}". ` +
  `Sebagai mentor, saya hanya membahas materi skenario ini dan penerapannya dalam sales B2G ORIMAX. ` +
  `Silakan tanyakan hal yang berkaitan dengan cara sukses di skenario ini ya.`;

/** Bangun prompt mentor yang tegas + berisi konteks materi. */
function buildMentorPrompt(sc: {
  module_code: string;
  module_name: string;
  name: string;
  description: string | null;
  theory_briefing: string | null;
  passing_tips: string | null;
}): string {
  return `Anda adalah "Mentor AI ORIMAX", pelatih sales B2G senior di PT Aston Graphindo Indonesia.

KONTEKS MATERI (satu-satunya topik yang boleh Anda bahas):
- Modul: ${sc.module_code} — ${sc.module_name}
- Skenario: ${sc.name}
- Deskripsi: ${sc.description || '-'}
- Teori resmi:
${sc.theory_briefing || '-'}
- Arahan agar lulus:
${sc.passing_tips || '-'}

CARA MENJAWAB (WAJIB):
1. JAWAB LANGSUNG pertanyaan sales dengan solusi praktis. JANGAN balik bertanya atau minta klarifikasi.
2. "PPK" = Pejabat Pembuat Komitmen (pengadaan pemerintah). "PIC" = Person In Charge instansi. "RUP" = Rencana Umum Pengadaan. Ini konteks tetap, tidak perlu ditanyakan.
3. Semua jawaban harus berpijak pada teori/arahan skenario di atas.
4. Jika pertanyaan di luar materi ini, jawab singkat: "Itu di luar materi ${sc.name}." lalu arahkan kembali ke materi.
5. Bahasa Indonesia, nada mentor tegas-profesional, langsung ke solusi. 2-4 poin singkat atau maksimal 4 kalimat. Sertakan contoh kalimat siap pakai bila relevan.`;
}

theoryRouter.post('/theory/ask', requireAuth, async (req: Request, res: Response) => {
  try {
    const { scenarioId, question } = req.body;
    if (!scenarioId || !question) {
      return res.status(400).json({ error: 'scenarioId dan question wajib diisi.' });
    }

    const { rows } = await query<{
      id: number;
      name: string;
      description: string | null;
      theory_briefing: string | null;
      passing_tips: string | null;
      module_name: string;
      module_code: string;
    }>(
      `SELECT s.id, s.name, s.description, s.theory_briefing, s.passing_tips,
              m.name AS module_name, m.code AS module_code
       FROM trainer_scenarios s
       JOIN trainer_modules m ON s.module_id = m.id
       WHERE s.id = $1`,
      [scenarioId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Skenario tidak ditemukan.' });
    }

    const sc = rows[0]!;
    const questionText = String(question).slice(0, 1000);

    // ---- PRE-FILTER: tolak pertanyaan OOT tanpa memanggil LLM ----
    if (OOT_QUESTION_PATTERNS.some((re) => re.test(questionText))) {
      return res.json({ answer: REFUSAL_TEMPLATE(sc.name), blocked: true });
    }

    const result = await chat(
      [
        { role: 'system', content: buildMentorPrompt(sc) },
        { role: 'user', content: questionText },
      ],
      { temperature: 0.2, maxTokens: 700 },
    );

    let answer = result.content;

    // Model kecil kadang tetap membalas "saya perlu klarifikasi..." walau sudah
    // diberi konteks penuh. Deteksi pola itu dan minta sekali lagi secara tegas.
    if (CLARIFY_PATTERNS.some((re) => re.test(answer))) {
      const retry = await chat(
        [
          { role: 'system', content: buildMentorPrompt(sc) },
          { role: 'user', content: questionText },
          {
            role: 'assistant',
            content: answer,
          },
          {
            role: 'user',
            content:
              'JANGAN minta klarifikasi dan jangan bertanya balik. Anda sudah punya semua konteks: sales B2G ORIMAX, instansi pemerintah, pengadaan via SirUP. Jawab langsung dengan langkah praktis sekarang.',
          },
        ],
        { temperature: 0.3, maxTokens: 700 },
      );
      if (!CLARIFY_PATTERNS.some((re) => re.test(retry.content))) {
        answer = retry.content;
      }
    }

    // ---- POST-FILTER: buang jawaban model yang bocor ke topik luar ----
    if (OOT_ANSWER_PATTERNS.some((re) => re.test(answer))) {
      return res.json({ answer: REFUSAL_TEMPLATE(sc.name), blocked: true });
    }

    res.json({ answer });
  } catch (err) {
    console.error('[theory-ask] error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
