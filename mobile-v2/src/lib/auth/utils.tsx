import { getItem, removeItem, setItem } from '@/lib/storage';

const TOKEN = 'wingman_jwt';

export type TokenType = string;

export const getToken = () => getItem<TokenType>(TOKEN);
export const removeToken = () => removeItem(TOKEN);
export const setToken = (value: TokenType) => setItem<TokenType>(TOKEN, value);
