package com.astongraphindo.agitrainer.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Wire models. Hand-mapped from org.json (bundled with Android) so the app needs
 * no serialization dependency and every field access is explicit.
 *
 * NOTE: no provider API key ever appears in this layer. The Android client talks
 * only to our own backend (PRD §8, §78).
 */

data class User(
    val id: Long,
    val username: String,
    val role: String,
    val namaLengkap: String,
)

data class TrainingModule(
    val id: Int,
    val code: String,
    val name: String,
    val description: String?,
    val category: String?,
    val difficulty: String?,
    val passingScore: Int,
    val maxAttempt: Int,
    val scenarioCount: Int,
) {
    companion object {
        fun from(o: JSONObject) = TrainingModule(
            id = o.optInt("id"),
            code = o.optString("code"),
            name = o.optString("name"),
            description = o.optString("description").ifBlank { null },
            category = o.optString("category").ifBlank { null },
            difficulty = o.optString("difficulty").ifBlank { null },
            passingScore = o.optInt("passing_score", 80),
            maxAttempt = o.optInt("max_attempt", 3),
            scenarioCount = o.optInt("scenario_count", 0),
        )
    }
}

data class Persona(
    val name: String?,
    val role: String?,
    val attitude: String?,
)

data class Scenario(
    val id: Int,
    val name: String,
    val description: String?,
    val objective: String?,
    val resistanceLevel: Int,
    val productCategory: String?,
    val institutionType: String?,
    val persona: Persona,
) {
    companion object {
        fun from(o: JSONObject) = Scenario(
            id = o.optInt("id"),
            name = o.optString("name"),
            description = o.optString("description").ifBlank { null },
            objective = o.optString("objective").ifBlank { null },
            resistanceLevel = o.optInt("resistance_level", 3),
            productCategory = o.optString("product_category").ifBlank { null },
            institutionType = o.optString("institution_type").ifBlank { null },
            persona = Persona(
                name = o.optString("persona_name").ifBlank { null },
                role = o.optString("persona_role").ifBlank { null },
                attitude = o.optString("persona_attitude").ifBlank { null },
            ),
        )
    }
}

data class RubricCriterion(
    val competency: String,
    val weight: Int,
    val criteria: String?,
) {
    companion object {
        fun from(o: JSONObject) = RubricCriterion(
            competency = o.optString("competency"),
            weight = o.optInt("weight"),
            criteria = o.optString("criteria").ifBlank { null },
        )
    }
}

data class ModuleDetail(
    val module: TrainingModule,
    val scenarios: List<Scenario>,
    val rubric: List<RubricCriterion>,
)

data class RoleplayReply(
    val reply: String,
    val resistance: Int,
    val state: String,
    val done: Boolean,
)

data class Turn(
    val speaker: String,
    val text: String,
    val sequence: Int,
)

data class CompetencyScore(
    val competency: String,
    val score: Int,
    val weight: Int,
    val weighted: Double,
    val evidence: String,
)

data class Evaluation(
    val overallScore: Int,
    val passed: Boolean,
    val passingScore: Int,
    val competencies: List<CompetencyScore>,
    val strengths: List<String>,
    val weaknesses: List<String>,
    val criticalErrors: List<String>,
    val recommendation: String,
    val confidence: Double,
) {
    companion object {
        private fun strings(a: JSONArray?): List<String> {
            if (a == null) return emptyList()
            return (0 until a.length()).mapNotNull { i -> a.optString(i).ifBlank { null } }
        }

        fun from(o: JSONObject): Evaluation {
            val comps = o.optJSONArray("competencies") ?: JSONArray()
            return Evaluation(
                overallScore = o.optInt("overall_score"),
                passed = o.optBoolean("passed"),
                passingScore = o.optInt("passing_score", 80),
                competencies = (0 until comps.length()).map { i ->
                    val c = comps.getJSONObject(i)
                    CompetencyScore(
                        competency = c.optString("competency"),
                        score = c.optInt("score"),
                        weight = c.optInt("weight"),
                        weighted = c.optDouble("weighted", 0.0),
                        evidence = c.optString("evidence"),
                    )
                },
                strengths = strings(o.optJSONArray("strengths")),
                weaknesses = strings(o.optJSONArray("weaknesses")),
                criticalErrors = strings(o.optJSONArray("critical_errors")),
                recommendation = o.optString("recommendation"),
                confidence = o.optDouble("confidence", 0.0),
            )
        }
    }
}

data class ProgressEntry(
    val moduleId: Int,
    val moduleCode: String,
    val moduleName: String,
    val latestScore: Int?,
    val highestScore: Int?,
    val attempts: Int,
    val improvement: Int?,
    val passStatus: String,
    val passingScore: Int,
)

data class HistoryEntry(
    val sessionId: Int,
    val scenarioName: String,
    val moduleCode: String,
    val attempt: Int,
    val startedAt: String,
    val overallScore: Int?,
    val passed: Boolean?,
    val evalStatus: String,
)
