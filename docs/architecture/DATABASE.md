# Database Design: AGI AI Sales Trainer

## 1. Design Principles

- **Namespacing**: All trainer tables are prefixed with `trainer_` (`trainer_personas`, `trainer_modules`, etc.) to safely coexist with existing Sales Analytics tables in the same PostgreSQL database.
- **Immutability & Pinning**: Evaluations (`trainer_evaluations`) and competency scores pin the exact `prompt_version_id` and `ai_model` used, ensuring historical audit integrity even if prompts or rubrics are later edited.
- **Versioning**: Curriculum items (modules, scenarios, rubrics, prompts) support additive versioning (incrementing version number with `active` flags).
- **Idempotency**: Outbox pattern (`trainer_result_outbox`) and assignment tracking use unique constraints to prevent duplicate deliveries or assignments.

---

## 2. Core Tables (`trainer_*`)

1. **`trainer_personas`**
   - Stores AI customer identities for B2G roleplay (e.g., bureaucratic stance, resistance level, budget condition).
   - Primary Key: `id`

2. **`trainer_modules`**
   - Training curriculum units (e.g., MOD-03 B2G Procurement).
   - Fields: `code`, `name`, `difficulty`, `passing_score`, `max_attempt`, `version`, `active`.

3. **`trainer_scenarios`**
   - Specific roleplay situations linked to a module and persona.
   - Fields: `module_id`, `persona_id`, `objective`, `success_criteria`, `resistance_level`.

4. **`trainer_rubrics`**
   - Weighted scoring criteria per module (Invariant: $\sum \text{weight} = 100$).
   - Fields: `module_id`, `competency`, `weight`, `criteria`, `scoring_instruction`.

5. **`trainer_prompts`**
   - Versioned prompt templates (`system`, `persona`, `scenario`, `business`, `rules`, `evaluation`).
   - Unique constraint: `(key, version)`.

6. **`trainer_product_knowledge`**
   - Sanctioned source of product facts fed to LLM to prevent hallucinations.
   - Fields: `category`, `name`, `payload` (JSONB).

7. **`trainer_assignments`**
   - Inbound training needs from Sales Analytics. Links `sales_id` to `users(id)`.
   - Unique constraint on external reference for idempotency.

8. **`trainer_sessions`**
   - Individual roleplay attempts by a sales user.
   - Fields: `sales_id`, `scenario_id`, `attempt`, `mode`, `status`, `eval_status`.

9. **`trainer_turns`**
   - Conversation transcript utterances (`AI` vs `SALES`).
   - Fields: `session_id`, `speaker`, `text`, `sequence_number`.

10. **`trainer_evaluations`**
    - Immutable evaluation results pinned to `ai_model` and `prompt_version_id`.
    - Fields: `session_id`, `overall_score`, `feedback` (JSONB), `strengths`, `weaknesses`, `critical_errors`.

11. **`trainer_competency_scores`**
    - Per-competency breakdown with mandatory evidence text.
    - Fields: `evaluation_id`, `competency`, `score`, `weight`, `evidence`.

12. **`trainer_progress`**
    - Rolled-up performance metrics per sales $\times$ module.
    - Fields: `sales_id`, `module_id`, `first_score`, `latest_score`, `highest_score`, `avg_score`, `attempts`, `pass_status`.

13. **`trainer_certifications`**
    - Certification tracking for advanced sales tiers.

14. **`trainer_result_outbox`**
    - Outbox queue guaranteeing exactly-once asynchronous callback delivery to Sales Analytics.
    - Fields: `session_id`, `payload` (JSONB), `delivered_at`, `attempts`, `last_error`.
