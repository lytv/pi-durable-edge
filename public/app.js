const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('piEdgeToken') || '';
let busy = false;
let polls = 0;
let pollTimer;
let currentModel = { api: 'faux', hasKey: false };
$('token').value = token;
$('selfcheck').disabled = !token;

function feedback(message) { $('feedback').textContent = message; if ($('auth-modal').hidden) notify(message); }
function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className || '';
  node.textContent = text || '';
  return node;
}
async function api(path, options = {}) {
  if (!token) throw new Error('Enter the ACCESS_TOKEN first');
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
  return data;
}
function render(state) {
  const messages = $('messages-container');
  const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
  messages.replaceChildren();
  for (const msg of state.messages || []) {
    const user = msg.role === 'user';
    const row = element('div', 'message-row ' + (user ? 'user-row' : 'assistant-row'));
    const text = element('div', user ? 'user-bubble edge-message-text' : 'assistant-bubble edge-message-text', msg.text);
    if (user) {
      row.append(text);
    } else {
      const wrap = element('div', 'assistant-wrapper');
      wrap.append(text);
      row.append(wrap);
    }
    messages.append(row);
  }
  if (!messages.children.length) {
    const empty = element('div', 'empty-chat-state');
    empty.append(element('span', 'empty-chat-badge', 'Pi Durable Edge'));
    empty.append(element('div', 'empty-chat-title', 'Start a durable conversation'));
    empty.append(element('p', 'empty-chat-desc', 'Same UI as the original Pi Durable. Faux is a free simulation; real models can be configured on the right.'));
    messages.append(empty);
  }
  if (nearBottom) messages.scrollTop = messages.scrollHeight;

  const pending = state.pending || [];
  $('pending').textContent = pending.length ? 'Running: ' + pending.length : 'Idle';
  const tasks = $('task-tree');
  tasks.replaceChildren();
  if (pending.length) {
    for (const job of pending.slice(0, 8)) {
      tasks.append(element('div', 'edge-task-row', '● Running · ' + String(job.operationId || job.id || 'task')));
    }
  } else tasks.append(element('span', 'empty-placeholder', 'Idle, no running tasks'));
  window.edgeSetMascotState?.(pending.length ? 'thinking' : 'idle', pending.length ? 'Working' : 'Idle');

  const reminders = $('reminders');
  reminders.replaceChildren();
  for (const item of state.reminders || []) {
    const row = element('div', 'edge-reminder-row');
    row.append(element('span', '', item.text + ' · ' + new Date(item.dueAt).toLocaleString('en-US')));
    row.append(element('span', 'mascot-status-tag', item.status === 'fired' ? 'Fired' : item.status === 'scheduled' ? 'Scheduled' : 'Failed'));
    reminders.append(row);
  }
  if (!reminders.children.length) reminders.append(element('span', 'empty-placeholder', 'No reminders'));

  const scheduled = (state.reminders || []).some((item) => item.status === 'scheduled');
  clearTimeout(pollTimer);
  if ((pending.length || scheduled) && polls < 35) {
    pollTimer = setTimeout(() => refresh(true), 2500);
    polls += 1;
  } else if (polls >= 35) {
    $('pending').textContent += ' · auto-refresh paused';
  }
}
async function refresh(quiet = false) {
  try {
    const state = await api('/api/state');
    render(state);
    $('connection-indicator').classList.add('connected');
    $('connection-label').textContent = 'Connected';
    if (!quiet) feedback('Connected. The session is stored in the Durable Object.');
    $('reconnect-banner').classList.remove('visible');
    return true;
  } catch (error) {
    $('connection-indicator').classList.remove('connected');
    $('connection-label').textContent = 'Connection failed';
    feedback(error.message);
    if (!quiet) openDialog('auth-modal');
    return false;
  }
}
$('connect').addEventListener('click', async () => {
  const candidate = $('token').value.trim();
  if (!candidate) return feedback('Enter the ACCESS_TOKEN.');
  token = candidate;
  polls = 0;
  const ok = await refresh();
  if (!ok) return;
  sessionStorage.setItem('piEdgeToken', token);
  closeDialog('auth-modal');
  await loadModelSettings();
});
$('token').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('connect').click();
});
$('refresh').addEventListener('click', () => { polls = 0; refresh(); });
$('prompt').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('send').click(); } });
$('send').addEventListener('click', async () => {
  if (busy) return;
  const text = $('prompt').value.trim() || (currentModel.api === 'faux' ? 'Run a 12-second Pi Durable task recovery demo' : 'Hello, please introduce yourself.');
  busy = true; $('send').disabled = true;
  try {
    const operationId = crypto.randomUUID();
    const result = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text, operationId }) });
    $('prompt').value = '';
    polls = 0;
    feedback('Submitted durably: ' + result.operationId + '; refreshing or closing the page will not cancel the task.');
    await refresh(true);
  } catch (error) { feedback(error.message); }
  finally { busy = false; $('send').disabled = false; }
});
$('remind').addEventListener('click', async () => {
  const seconds = Number($('seconds').value);
  const text = $('reminder-text').value.trim() || 'Stand up and stretch';
  try {
    await api('/api/reminders', { method: 'POST', body: JSON.stringify({ text, seconds }) });
    $('reminder-text').value = '';
    feedback('Reminder saved. Cloudflare will wake it when due.');
    await refresh(true);
  } catch (error) { feedback(error.message); }
});
if (token) { refresh().then((ok) => { if (ok) loadModelSettings(); }); } else openDialog('auth-modal');

/**
 * Visible smoke test: creates its own unique chat operation and reminder.
 * This tests the deployed API and persistent state but NOT forced eviction.
 */
$('selfcheck').addEventListener('click', async () => {
  if (!token) return feedback('Connect with the ACCESS_TOKEN first.');
  if (currentModel.api !== 'faux') return feedback('The one-click simulation check only runs in Faux mode; switch back to Faux.');
  const control = $('selfcheck');
  control.disabled = true;
  const result = $('selfcheck-result');
  const operationId = 'selfcheck-' + crypto.randomUUID().replaceAll('-', '');
  const prompt = 'Pi Durable Edge auto check ' + operationId.slice(-8);
  let reminderId;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    result.textContent = 'Check 1/3: submitting task and idempotency…';
    const body = JSON.stringify({ text: prompt, operationId });
    const receipt = await api('/api/chat', { method: 'POST', body });
    if (!receipt.accepted) throw new Error('First task was not accepted');
    const repeated = await api('/api/chat', { method: 'POST', body });
    if (repeated.accepted !== false) throw new Error('Resubmission was not deduplicated by operationId');

    result.textContent = 'Check 2/3: creating 5-second durable reminder…';
    const reminder = await api('/api/reminders', {
      method: 'POST', body: JSON.stringify({ text: 'Auto check reminder', seconds: 5 }),
    });
    reminderId = reminder.id;

    result.textContent = 'Check 3/3: waiting for background task and reminder wake-up…';
    let passed = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const state = await api('/api/state');
      const i = (state.messages || []).findLastIndex((m) => m.role === 'user' && m.text === prompt);
      const replied = i >= 0 && state.messages.slice(i + 1).some(
        (m) => m.role === 'assistant' && m.text.includes('Task complete: Pi Durable')
      );
      const fired = (state.reminders || []).some(
        (m) => m.id === reminderId && m.status === 'fired'
      );
      if (replied && fired) {
        passed = true;
        render(state);
        break;
      }
      await pause(2500);
    }
    if (!passed) throw new Error('Test did not finish within 60 seconds; check the free quota or Workers logs');
    result.textContent = 'Basic self-check passed: simulated chat, idempotent submits, SQLite state, and durable reminders all work. Real crash recovery still needs separate testing.';
    feedback('Pi Durable Edge basic self-check passed.');
  } catch (error) {
    result.textContent = 'Self-check failed: ' + error.message;
    feedback('Check the deployment docs.');
  } finally {
    control.disabled = false;
  }
});

const modelDefaultUrls = {
  faux: '', 'openai-completions': 'https://api.openai.com/v1',
  'openai-responses': 'https://api.openai.com/v1', 'anthropic-messages': 'https://api.anthropic.com',
};
function formModelConfig() {
  return {
    api: $('model-api').value,
    baseUrl: $('model-url').value.trim(),
    model: $('model-id').value.trim(),
    apiKey: $('model-key').value.trim(),
    reasoning: $('model-reasoning').checked,
    contextWindow: Number($('model-context').value),
    maxTokens: Number($('model-max').value),
  };
}
function renderModelConfig(cfg) {
  currentModel = cfg;
  $('model-api').value = cfg.api || 'faux';
  $('model-id').value = cfg.model || '';
  $('model-url').value = cfg.baseUrl || modelDefaultUrls[cfg.api] || '';
  $('model-key').value = '';
  $('model-key').placeholder = cfg.hasKey ? 'Encrypted key saved · leave blank to keep' : 'Enter API key (required for first-time setup)';
  $('model-context').value = cfg.contextWindow || 128000;
  $('model-max').value = cfg.maxTokens || 8192;
  $('model-reasoning').checked = Boolean(cfg.reasoning);
  $('model-status').textContent = cfg.api === 'faux' ? 'Faux · free simulation' : cfg.model + ' · ' + cfg.api;
  $('stat-model').textContent = cfg.api === 'faux' ? 'Faux' : cfg.model;
  $('desktop-current-meta').textContent = 'Pi Durable Edge · ' + (cfg.api === 'faux' ? 'Faux' : cfg.model);
  $('selfcheck').disabled = !token || cfg.api !== 'faux';
  $('chat-description').textContent = cfg.api === 'faux'
    ? 'Faux mode: tasks wait 12 seconds and return a fixed reply; free check of breakpoint recovery.'
    : 'Now using the real chat endpoint of ' + cfg.model + '. Each submit may incur model API charges.';
  $('model-feedback').textContent = cfg.api === 'faux' ? 'No external model is called.' :
    'Configuration saved; ' + (cfg.hasKey ? 'API key is stored encrypted (never returned as plaintext).' : 'No API key configured yet.');
}
async function loadModelSettings() {
  if (!token) return;
  try { renderModelConfig(await api('/api/model')); }
  catch (error) { $('model-feedback').textContent = 'Failed to load configuration: ' + error.message; }
}
$('model-api').addEventListener('change', () => {
  const nextApi = $('model-api').value;
  const url = $('model-url').value.trim();
  if (!url || Object.values(modelDefaultUrls).includes(url)) {
    $('model-url').value = modelDefaultUrls[nextApi] || '';
  }
  $('model-form').querySelectorAll('input,select').forEach((input) => {
    if (input.id !== 'model-api') input.disabled = nextApi === 'faux';
  });
  if (nextApi !== 'faux') $('model-form').querySelectorAll('input,select').forEach((input) => { input.disabled = false; });
});
$('model-reload').addEventListener('click', () => loadModelSettings());
$('model-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('model-save');
  button.disabled = true;
  try {
    const config = formModelConfig();
    if (config.api !== 'faux' && !config.apiKey && !currentModel.hasKey) {
      throw new Error('Setting up a real model for the first time requires an API key');
    }
    const saved = await api('/api/model', { method: 'PUT', body: JSON.stringify(config) });
    renderModelConfig(saved);
    polls = 0;
    $('model-feedback').textContent = 'Saved and switched to ' + (saved.api === 'faux' ? 'Faux simulation mode' : saved.model) + '; it stays in effect after refresh.';
    await refresh(true);
    closeDialog('model-modal');
    notify('Model switched to ' + (saved.api === 'faux' ? 'Faux' : saved.model));
  } catch (error) { $('model-feedback').textContent = 'Save failed: ' + error.message; }
  finally { button.disabled = false; }
});

function openDialog(id) {
  $(id).hidden = false;
  if (id === 'model-modal' && token) loadModelSettings();
}
function closeDialog(id) { $(id).hidden = true; }
function notify(message) {
  const toast = element('div', 'toast toast-info', message);
  $('toast-container').append(toast);
  setTimeout(() => toast.remove(), 3500);
}
$('btn-settings').addEventListener('click', () => openDialog('model-modal'));
$('btn-mobile-settings').addEventListener('click', () => openDialog('model-modal'));
$('btn-model-open').addEventListener('click', () => openDialog('model-modal'));
$('btn-auth').addEventListener('click', () => openDialog('auth-modal'));
$('close-model').addEventListener('click', () => closeDialog('model-modal'));
$('close-auth').addEventListener('click', () => closeDialog('auth-modal'));
for (const id of ['model-modal', 'auth-modal']) {
  $(id).addEventListener('click', (event) => { if (event.target === $(id)) closeDialog(id); });
}
$('btn-mobile-menu').addEventListener('click', () => {
  $('sidebar-left').classList.add('open');
  $('drawer-backdrop').classList.add('open');
});
$('drawer-backdrop').addEventListener('click', () => {
  $('sidebar-left').classList.remove('open');
  $('drawer-backdrop').classList.remove('open');
});
$('single-session').addEventListener('click', () => {
  $('sidebar-left').classList.remove('open');
  $('drawer-backdrop').classList.remove('open');
  $('messages-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
