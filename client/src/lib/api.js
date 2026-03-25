import axios from 'axios';

const runtimeDefaultBaseUrl =
  import.meta.env.PROD && typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3001';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || runtimeDefaultBaseUrl;

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

function toParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export async function getAuthStatus() {
  const { data } = await client.get('/auth/status');
  return data;
}

export function beginTwitchAuth() {
  window.location.href = `${API_BASE_URL}/auth/twitch`;
}

export async function connectKick(apiKey) {
  const { data } = await client.post('/auth/kick', { apiKey });
  return data;
}

export async function disconnectProvider(provider) {
  const { data } = await client.post(`/auth/disconnect/${provider}`);
  return data;
}

export async function logoutAuth() {
  const { data } = await client.post('/auth/logout');
  return data;
}

export async function getSettings() {
  const { data } = await client.get('/api/settings');
  return data.settings;
}

export async function saveSettings(payload) {
  const { data } = await client.post('/api/settings', payload);
  return data.settings;
}

export async function listClips(params = {}) {
  const { data } = await client.get('/api/clips', {
    params: toParams(params),
  });
  return data.clips || [];
}

export async function getClip(id) {
  const { data } = await client.get(`/api/clips/${id}`);
  return data.clip;
}

export async function createClip(payload) {
  const { data } = await client.post('/api/clip', payload);
  return data.clip;
}

export async function updateClip(id, payload) {
  const { data } = await client.patch(`/api/clips/${id}`, payload);
  return data.clip;
}

export async function deleteClip(id) {
  const { data } = await client.delete(`/api/clips/${id}`);
  return data;
}

export async function trimClip(id, payload) {
  const { data } = await client.post(`/api/clips/${id}/trim`, payload);
  return data.clip;
}

export async function getStreamStatus(platform, channel) {
  const { data } = await client.get('/api/stream/status', {
    params: {
      platform,
      channel,
    },
  });
  return data;
}

export function createChatActivityStream({ platform, channel }) {
  const query = new URLSearchParams({ platform, channel });
  return new EventSource(`${API_BASE_URL}/api/stream/chat-activity?${query}`, {
    withCredentials: true,
  });
}

export async function uploadRecording(file, onUploadProgress) {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await client.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  });

  return data;
}

export function createUploadStatusStream(uploadId) {
  return new EventSource(`${API_BASE_URL}/api/upload/${uploadId}/status`, {
    withCredentials: true,
  });
}

export async function getUploadCandidates(uploadId) {
  const { data } = await client.get(`/api/upload/${uploadId}/candidates`);
  return data;
}

export async function saveApprovedUploadClips(payload) {
  const { data } = await client.post('/api/upload/save-approved', payload);
  return data;
}

export async function getSharedClip(token) {
  const { data } = await client.get(`/api/share/${token}`);
  return data.clip;
}

export function buildApiUrl(relativePath) {
  return `${API_BASE_URL}${relativePath}`;
}

export default client;
