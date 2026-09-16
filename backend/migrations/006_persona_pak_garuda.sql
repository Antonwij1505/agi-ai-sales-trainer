-- =============================================================================
-- 006_persona_pak_garuda.sql — rename the CS persona to match the actual voice.
--
-- WHY
-- The customer voice is Gemini Live "Puck", which sounds male. The persona was
-- named "Ibu Sari", so the sales rep heard a man introduce himself with a woman's
-- name. Reported by the user, and correct: the name and the voice must agree.
--
-- Chosen name: "Pak Garuda" (user's choice). Voice stays Puck.
--
-- WHAT THIS CHANGES
--   name                : 'Ibu Sari — CS Dinas' -> 'Pak Garuda — CS Dinas'
--   communication_style : the live prompt already reads {{persona_communication_style}},
--                         so the value is what shapes the tone.
--
-- NOTE ON IMMUTABILITY
-- The prompt-version immutability rule applies to trainer_prompts (new versions go
-- in new migrations). trainer_personas is mutable configuration data — the name is
-- a label, not a versioned prompt — so an UPDATE is correct here.
--
-- IDEMPOTENT: guarded on the stable key (type), not the display name, and safe to
-- re-run on every server start.
-- =============================================================================

BEGIN;

UPDATE trainer_personas
   SET name = 'Pak Garuda — CS Dinas',
       updated_at = now()
 WHERE type = 'government_cs'
   AND name <> 'Pak Garuda — CS Dinas';

-- Defensive: if the persona was somehow created under a different type but the old
-- name, rename it too, so no row keeps the mismatched female name.
UPDATE trainer_personas
   SET name = 'Pak Garuda — CS Dinas',
       updated_at = now()
 WHERE name = 'Ibu Sari — CS Dinas';

COMMIT;
