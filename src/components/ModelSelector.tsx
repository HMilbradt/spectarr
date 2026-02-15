'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_MODELS } from '@/lib/constants';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_MODELS.map(model => (
          <SelectItem key={model.id} value={model.id}>
            {model.name} — ${model.inputCostPerMTokens}/{model.outputCostPerMTokens} per M tokens
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
