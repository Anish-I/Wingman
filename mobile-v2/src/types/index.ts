export interface User {
  id: number;
  phone: string;
  name?: string;
  preferences: Record<string, unknown>;
  push_token?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConnectedApp {
  slug: string;
  name: string;
  connected: boolean;
  icon?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger_type: 'schedule' | 'event' | 'manual';
  cron_expression?: string;
  active: boolean;
  created_at: string;
}

export interface ApiError {
  error: string;
}

export type PipExpression =
  | 'happy' | 'thinking' | 'excited' | 'wave'
  | 'thumbsup' | 'coding' | 'checkmark' | 'cool'
  | 'love' | 'no' | 'fail' | 'crying'
  | 'coffee' | 'clap' | 'angry' | 'business' | 'logo';
