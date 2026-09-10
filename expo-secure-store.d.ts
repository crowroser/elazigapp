declare module 'expo-secure-store' {
  export function getItemAsync(key: string, options?: object): Promise<string | null>;
  export function setItemAsync(key: string, value: string, options?: object): Promise<void>;
  export function deleteItemAsync(key: string, options?: object): Promise<void>;
}
