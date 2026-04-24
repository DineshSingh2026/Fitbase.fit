import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DEFAULT_ANTHROPIC_MODEL } from "./nutrition.constants";
import { kcalDriftRatio, macroDerivedKcal } from "./nutrition-scoring.util";
import type { NormalizedAiResult } from "./nutrition-scoring.util";

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

@Injectable()
export class NutritionAnthropicService {
  private model(): string {
    return (
      process.env.ANTHROPIC_MODEL_NUTRITION ||
      process.env.ANTHROPIC_MODEL ||
      DEFAULT_ANTHROPIC_MODEL
    ).trim();
  }

  private apiKey(): string {
    const k = String(process.env.ANTHROPIC_API_KEY || "").trim();
    if (!k) throw new ServiceUnavailableException("Anthropic API is not configured.");
    return k;
  }

  async callClaudeNutrition(params: {
    manualNote: string;
    mealType: string;
    portionSize: string;
    imageBase64?: string;
    mimeType?: string;
  }): Promise<{ parsed: NormalizedAiResult; usage: ClaudeUsage; rawText: string }> {
    const runOnce = async () => {
      const content: unknown[] = [];
      if (params.imageBase64 && params.mimeType) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: params.mimeType,
            data: params.imageBase64
          }
        });
      }
      content.push({
        type: "text",
        text: this.macroPrompt(params.manualNote, params.mealType, params.portionSize)
      });
      return this.messagesCreate(content);
    };

    let { parsed, usage, rawText } = await runOnce();
    const d1 = kcalDriftRatio(parsed.calories, macroDerivedKcal(parsed));
    if (d1 > 0.15) {
      const second = await runOnce();
      const d2 = kcalDriftRatio(second.parsed.calories, macroDerivedKcal(second.parsed));
      if (d2 < d1) {
        parsed = second.parsed;
        usage = second.usage;
        rawText = second.rawText;
      }
    }
    return { parsed, usage, rawText };
  }

  async validateIsFoodMeal(params: {
    manualNote: string;
    imageBase64?: string;
    mimeType?: string;
  }): Promise<{ is_food_meal: boolean; usage: ClaudeUsage }> {
    const content: unknown[] = [];
    if (params.imageBase64 && params.mimeType) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: params.mimeType,
          data: params.imageBase64
        }
      });
    }
    content.push({
      type: "text",
      text: `You validate whether this is a plausible food/meal log (not random objects, empty plates only, or non-food).
User text:\n${params.manualNote}\n\nReply JSON only: {"is_food_meal": true|false}`
    });
    const { rawText, usage } = await this.messagesCreate(content);
    const m = rawText.match(/\{[\s\S]*\}/);
    if (!m) return { is_food_meal: true, usage };
    try {
      const j = JSON.parse(m[0]) as { is_food_meal?: boolean };
      return { is_food_meal: !!j.is_food_meal, usage };
    } catch {
      return { is_food_meal: true, usage };
    }
  }

  private macroPrompt(note: string, mealType: string, portion: string): string {
    return `You estimate nutrition for a ${mealType} meal. Portion hint: ${portion}.
User description (required context):
${note}

Return JSON only with keys: dish, description, serving, calories, protein, carbs, fat, fiber, sodium, weight (grams), confidence (high|medium|low), tips (string array).
Use whole numbers for macros where sensible. Be realistic for the described foods.`;
  }

  private async messagesCreate(content: unknown[]): Promise<{
    parsed: NormalizedAiResult;
    usage: ClaudeUsage;
    rawText: string;
  }> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey(),
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model(),
        max_tokens: 450,
        temperature: 0,
        messages: [{ role: "user", content }]
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new ServiceUnavailableException(`Anthropic error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: ClaudeUsage;
    };
    const text =
      body.content?.map((b) => (b.type === "text" ? b.text || "" : "")).join("\n") || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      throw new ServiceUnavailableException("Could not parse nutrition model response.");
    }
    let partial: Record<string, unknown>;
    try {
      partial = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException("Invalid JSON from nutrition model.");
    }
    const parsed: NormalizedAiResult = {
      dish: String(partial.dish || "Meal"),
      description: String(partial.description || ""),
      serving: String(partial.serving || ""),
      calories: Math.round(Number(partial.calories) || 0),
      protein: Math.round(Number(partial.protein) || 0),
      carbs: Math.round(Number(partial.carbs) || 0),
      fat: Math.round(Number(partial.fat) || 0),
      fiber: Math.round(Number(partial.fiber) || 0),
      sodium: Math.round(Number(partial.sodium) || 0),
      weight: Math.round(Number(partial.weight) || 0),
      confidence:
        String(partial.confidence || "medium").toLowerCase() === "high"
          ? "high"
          : String(partial.confidence || "medium").toLowerCase() === "low"
            ? "low"
            : "medium",
      tips: Array.isArray(partial.tips) ? partial.tips.map((t) => String(t)) : [],
      _bbAnalyzedWithPhoto: false,
      _bbEntrySource: "ai"
    };
    return { parsed, usage: body.usage || {}, rawText: text };
  }
}
