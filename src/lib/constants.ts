import type { ModelConfig } from '@/types';

export const SUPPORTED_MODELS: ModelConfig[] = [
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    inputCostPerMTokens: 3.00,
    outputCostPerMTokens: 15.00,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    inputCostPerMTokens: 2.50,
    outputCostPerMTokens: 10.00,
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    inputCostPerMTokens: 0.10,
    outputCostPerMTokens: 0.40,
  },
];

export const DEFAULT_MODEL_ID = 'openai/gpt-4o';

export const IMAGE_MAX_DIMENSION = 1568;
export const IMAGE_JPEG_QUALITY = 80;
export const IMAGE_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// Server-only constants — env-backed with sensible defaults
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
export const OPENROUTER_REFERER =
  process.env.OPENROUTER_REFERER || 'http://localhost:3000';
export const OPENROUTER_TITLE = 'Spectarr';
