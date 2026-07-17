import { TextEncoder, TextDecoder } from 'util';

Object.assign(global, { TextEncoder, TextDecoder });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock-supabase.example.com';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'mock-anon-key';
