import { OPENROUTER_BASE_URL, OPENROUTER_REFERER, OPENROUTER_TITLE } from './constants';
import { log } from '@/lib/logger';

const MODULE = 'openrouter';

interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  max_tokens?: number;
  temperature?: number;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not configured');
  }
  return key;
}

export function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export async function callOpenRouter(
  request: OpenRouterRequest
): Promise<OpenRouterResponse> {
  const apiKey = getApiKey();

  log.debug(MODULE, 'Sending request to OpenRouter', {
    model: request.model,
    maxTokens: request.max_tokens,
    temperature: request.temperature,
    messageCount: request.messages.length,
  });

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.text();
    log.error(MODULE, 'OpenRouter API error', {
      status: response.status,
      statusText: response.statusText,
      body: body.slice(0, 500),
    });
    throw new Error(`OpenRouter API error ${response.status}: ${body}`);
  }

  const result: OpenRouterResponse = await response.json();

  log.debug(MODULE, 'OpenRouter response received', {
    id: result.id,
    model: result.model,
    finishReason: result.choices[0]?.finish_reason,
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
    totalTokens: result.usage.total_tokens,
  });

  return result;
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputCostPerMTokens: number,
  outputCostPerMTokens: number
): number {
  return (
    (inputTokens * inputCostPerMTokens) / 1_000_000 +
    (outputTokens * outputCostPerMTokens) / 1_000_000
  );
}
