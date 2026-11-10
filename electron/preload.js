'use strict';
// Runs in a sandboxed preload: only a fixed list of IPC channels is reachable from the page.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set([
  'auth:status', 'auth:unlock', 'auth:lock', 'auth:setPin', 'auth:removePin',
  'settings:public', 'settings:get', 'settings:set',
  'customers:list', 'customers:get', 'customers:create', 'customers:update', 'customers:setActive',
  'customers:deletePreview', 'customers:delete',
  'collections:add', 'collections:addBulk', 'collections:update', 'collections:delete',
  'collections:forDate', 'collections:list', 'ledger:get', 'history:byDate',
  'dashboard:get', 'missed:get', 'insights:customer', 'heatmap:customer',
  'closing:get', 'closing:save', 'closing:list', 'audit:list',
  'clipboard:write', 'reminder:whatsapp', 'app:info', 'app:showItem', 'app:openDataFolder',
  'export:customerHistory', 'export:entries', 'export:dayClosing', 'export:all',
  'import:template', 'import:customersCsv',
  'backup:chooseFolder', 'backup:now', 'backup:runAuto', 'backup:list', 'backup:restore', 'backup:restoreFromFile',
]);

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  invoke(channel, ...args) {
    if (!CHANNELS.has(channel)) return Promise.resolve({ ok: false, code: 'ERROR', error: `Unknown action: ${channel}` });
    return ipcRenderer.invoke(channel, ...args);
  },
});
