// Thin wrapper over the preload bridge. Main-process handlers return {ok, data} or
// {ok:false, error}; this turns failures into thrown Errors with readable messages.

async function call(channel, ...args) {
  if (!window.api) throw new Error('DailyCollect must be run inside the desktop app.');
  const res = await window.api.invoke(channel, ...args);
  if (res && res.ok) return res.data;
  const err = new Error(res?.error || 'Something went wrong.');
  err.code = res?.code;
  err.details = res?.details;
  if (err.code === 'LOCKED') window.dispatchEvent(new Event('dailycollect:locked'));
  throw err;
}

export const api = {
  auth: {
    status: () => call('auth:status'),
    unlock: (pin) => call('auth:unlock', pin),
    lock: () => call('auth:lock'),
    setPin: (currentPin, newPin) => call('auth:setPin', { currentPin, newPin }),
    removePin: (currentPin) => call('auth:removePin', { currentPin }),
  },
  settings: {
    public: () => call('settings:public'),
    get: () => call('settings:get'),
    set: (partial) => call('settings:set', partial),
  },
  customers: {
    list: (opts) => call('customers:list', opts),
    get: (id) => call('customers:get', id),
    create: (data) => call('customers:create', data),
    update: (id, data) => call('customers:update', id, data),
    setActive: (id, active) => call('customers:setActive', id, active),
    deletePreview: (id) => call('customers:deletePreview', id),
    delete: (id, confirmName) => call('customers:delete', id, confirmName),
  },
  collections: {
    add: (data) => call('collections:add', data),
    addBulk: (data) => call('collections:addBulk', data),
    update: (id, data) => call('collections:update', id, data),
    delete: (id) => call('collections:delete', id),
    forDate: (date) => call('collections:forDate', date),
    list: (filter) => call('collections:list', filter),
  },
  ledger: (id, range) => call('ledger:get', id, range),
  historyByDate: (range) => call('history:byDate', range),
  dashboard: () => call('dashboard:get'),
  missed: () => call('missed:get'),
  insights: (id) => call('insights:customer', id),
  heatmap: (id, range) => call('heatmap:customer', id, range),
  closing: {
    get: (date) => call('closing:get', date),
    save: (data) => call('closing:save', data),
    list: (limit) => call('closing:list', limit),
  },
  audit: (opts) => call('audit:list', opts),
  clipboard: (text) => call('clipboard:write', text),
  whatsapp: (phone, text) => call('reminder:whatsapp', phone, text),
  app: {
    info: () => call('app:info'),
    showItem: (p) => call('app:showItem', p),
    openDataFolder: () => call('app:openDataFolder'),
  },
  exports: {
    customerHistory: (id, format) => call('export:customerHistory', id, format),
    entries: (filter, format) => call('export:entries', filter, format),
    dayClosing: (data) => call('export:dayClosing', data),
    all: (format) => call('export:all', format),
    importTemplate: () => call('import:template'),
    importCustomers: () => call('import:customersCsv'),
  },
  backup: {
    chooseFolder: () => call('backup:chooseFolder'),
    now: () => call('backup:now'),
    runAuto: () => call('backup:runAuto'),
    list: () => call('backup:list'),
    restore: (file) => call('backup:restore', file),
    restoreFromFile: () => call('backup:restoreFromFile'),
  },
};
