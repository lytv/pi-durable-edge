import { ClientError } from './http-utils.js';
import { createProvider } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';

export const DEFAULT_CONFIG = Object.freeze({
  api: 'faux', baseUrl: '', model: '', reasoning: false, contextWindow: 128000, maxTokens: 8192,
});
const ENDPOINTS = {
  'openai-completions': 'https://api.openai.com/v1',
  'openai-responses': 'https://api.openai.com/v1',
  'anthropic-messages': 'https://api.anthropic.com',
};
const APIS = {
  'openai-completions': openAICompletionsApi(),
  'openai-responses': openAIResponsesApi(),
  'anthropic-messages': anthropicMessagesApi(),
};
const enc = new TextEncoder();
const dec = new TextDecoder();

function base64(bytes) {
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
function unbase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function cryptoKey(accessToken) {
  if (typeof accessToken !== 'string' || accessToken.length < 24) {
    throw new Error('ACCESS_TOKEN is not configured or is too short');
  }
  const bits = await crypto.subtle.digest('SHA-256', enc.encode('pi-durable-edge:model-settings:v1:' + accessToken));
  return crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealKey(apiKey, accessToken) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(accessToken), enc.encode(apiKey));
  return 'v1.' + base64(iv) + '.' + base64(new Uint8Array(encrypted));
}
export async function openKey(sealed, accessToken) {
  const [version, nonce, value] = String(sealed).split('.');
  if (version !== 'v1' || !nonce || !value) throw new Error('Cannot read the saved key');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(nonce) }, await cryptoKey(accessToken), unbase64(value));
  return dec.decode(decrypted);
}

export function validateModelConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ClientError('Invalid model configuration');
  const api = String(raw.api || 'faux');
  if (api === 'faux') return { ...DEFAULT_CONFIG };
  if (!(api in ENDPOINTS)) throw new ClientError('Only OpenAI Completions, OpenAI Responses, and Anthropic Messages are supported');
  const model = String(raw.model ?? '').trim();
  if (!model || model.length > 160 || /[\u0000-\u001f]/.test(model)) throw new ClientError('Model ID must be 1–160 valid characters');
  const suppliedBaseUrl = String(raw.baseUrl || ENDPOINTS[api]).trim();
  if (suppliedBaseUrl.length > 500) throw new ClientError('Base URL must not exceed 500 characters');
  let url;
  try { url = new URL(suppliedBaseUrl); } catch { throw new ClientError('Invalid Base URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new ClientError('Base URL must be an HTTPS address without username, password, query parameters, or #');
  }
  // URL() canonicalizes numeric IPv4 aliases (127.1, 2130706433, 0x7f000001).
  // Reject all literal IP targets and local-only DNS names: this is a BYO HTTPS
  // provider, not an arbitrary internal-network HTTP relay.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipLiteral = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
    hostname.includes(':') || /^\[.*\]$/.test(hostname);
  const localName = hostname === 'localhost' ||
    hostname === 'metadata.google.internal' ||
    ['.localhost', '.local', '.internal', '.lan', '.home', '.test'].some((suffix) => hostname.endsWith(suffix));
  if (ipLiteral || localName || !hostname.includes('.')) {
    throw new ClientError('Base URL must be a public HTTPS domain; IP addresses, localhost, and local network domains are not allowed');
  }
  const contextWindow = Number(raw.contextWindow);
  const maxTokens = Number(raw.maxTokens);
  if (!Number.isInteger(contextWindow) || contextWindow < 4096 || contextWindow > 2000000) throw new ClientError('Context window must be 4096–2000000');
  if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > contextWindow) throw new ClientError('Max output tokens must be between 128 and the context window size');
  if (typeof raw.reasoning !== 'boolean') throw new ClientError('Reasoning must be a boolean');
  return { api, baseUrl: url.toString().replace(/\/$/, ''), model, reasoning: raw.reasoning, contextWindow, maxTokens };
}

export function modelDescriptor(config) {
  return {
    id: config.model, name: config.model, api: config.api,
    provider: 'edge-configured', baseUrl: config.baseUrl,
    reasoning: config.reasoning,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
    ...(config.api === 'openai-completions' ? { compat: { supportsStore: false, supportsDeveloperRole: false } } : {}),
  };
}

export function configuredProvider(config, getApiKey) {
  const model = modelDescriptor(config);
  const provider = createProvider({
    id: 'edge-configured', name: 'Pi Durable Edge', baseUrl: config.baseUrl,
    auth: { apiKey: { name: 'Pi Durable Edge API Key', resolve: async ({ signal }) => {
      signal?.throwIfAborted();
      const key = await getApiKey();
      signal?.throwIfAborted();
      if (!key) throw new Error('API key is missing: please open the model settings page');
      return { auth: { apiKey: key }, source: 'encrypted Durable Object setting' };
    } } },
    models: [model], api: APIS[config.api],
  });
  return { provider, model };
}

export function defaultBaseUrl(api) { return ENDPOINTS[api] || ''; }
