import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nexusdesk', {
  setSecret: (key: string, value: string) => ipcRenderer.invoke('secure-store:set', key, value),
  getSecret: (key: string) => ipcRenderer.invoke('secure-store:get', key) as Promise<string | null>,
});
