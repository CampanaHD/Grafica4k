export const flowError = (code, message) => Object.assign(new Error(message), { code });
/** Shared by the worker and page bundle. Cancels polling, timers and late async probes. */
export async function waitForCondition(find, options = {}) {
  const { timeout = 30000, interval = 300, signal, deadline = Infinity, code = 'WHATSAPP_UI_NOT_READY', message = 'A interface ainda não está pronta.', now = () => Date.now(), pause } = options;
  if(!Number.isFinite(timeout)||timeout<0||!Number.isFinite(interval)||interval<=0)throw new TypeError('Informe prazo e intervalo finitos para a espera.');
  const until = Math.min(deadline, now() + timeout);
  let stopped = false, timer, sleepTimer, wake;
  const cancelled = () => flowError('CANCELLED', 'Preparação cancelada. Nenhuma mensagem foi enviada.');
  const check = () => { if (signal?.aborted || stopped) throw cancelled(); };
  let abort;
  const end = new Promise((_, reject) => {
    timer = setTimeout(() => { stopped = true; reject(flowError(code, message)); wake?.(); }, Math.max(0, until - now()));
    abort = () => { stopped = true; reject(cancelled()); wake?.(); };
    signal?.addEventListener('abort', abort, { once: true });
  });
  const run = async () => {
    do {
      check(); if(now()>=until)throw flowError(code,message); const value = await find(); check();
      if (value) return value;
      if (now() >= until) break;
      const delay = Math.min(interval, until - now());
      if (pause) await pause(delay);
      else await new Promise(resolve => { wake = resolve; sleepTimer = setTimeout(resolve, delay); });
    } while (now() < until);
    throw flowError(code, message);
  };
  try { return await Promise.race([run(), end]); }
  finally { stopped = true; clearTimeout(timer); clearTimeout(sleepTimer); signal?.removeEventListener('abort', abort); wake?.(); }
}
