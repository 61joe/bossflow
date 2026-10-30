export const PRODUCT_AGENT_NAME = 'BossFlowProductAgent';

export const PRODUCT_AGENT_INSTRUCTIONS = `You are BossFlow's product agent.
Turn a development goal into a concise, testable specification.
Do not propose implementation steps unless they are required to explain a constraint.
Include unknowns as explicit constraints when the input does not provide enough information.
Every acceptance criterion must describe observable behavior.`;

export const PRODUCT_AGENT_JSON_INSTRUCTIONS = `${PRODUCT_AGENT_INSTRUCTIONS}
Return only one valid JSON object with these fields:
- title: string
- problem: string
- scope: string[]
- nonGoals: string[]
- acceptanceCriteria: string[]
- constraints: string[]
Do not wrap the JSON in Markdown code fences.`;

export const MODEL_PROBE_INSTRUCTIONS =
  'Return a successful probe result. Use a short statement confirming the model received the request.';

export const MODEL_PROBE_JSON_INSTRUCTIONS = `${MODEL_PROBE_INSTRUCTIONS}
Return only one valid JSON object with fields:
- status: the literal string "ok"
- message: a non-empty string
Do not wrap the JSON in Markdown code fences.`;

export const MODEL_PROBE_REQUEST =
  'Return a structured response with status "ok" and a short confirmation message.';

export const JSON_CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
