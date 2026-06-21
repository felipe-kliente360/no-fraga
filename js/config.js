const KEY = 'gastinhos_config';
export const getConfig = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const saveConfig = (url, key) => localStorage.setItem(KEY, JSON.stringify({ url, key }));
export const clearConfig = () => localStorage.removeItem(KEY);
