import axios from 'axios';
import Env from 'env';
import { getToken } from '@/lib/auth/utils';

export const client = axios.create({
  baseURL: Env.EXPO_PUBLIC_API_URL,
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
