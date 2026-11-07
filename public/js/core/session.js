import { api } from './api.js';

export const sessionApi = {
  load: () => api.get('/session'),
  login: (username, password) => api.post('/login', { username, password }),
  setup: (username, password, confirm) =>
    api.post('/setup', { username, password, confirm }),
  logout: () => api.post('/logout'),
  changePassword: (currentPassword, nextPassword, confirm) =>
    api.post('/password', { currentPassword, nextPassword, confirm }),
};
