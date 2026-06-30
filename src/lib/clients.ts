// Re-exports del repo para que los importadores no cambien su ruta de import.
export { getClient, listClients, subscribeClient, updateClient } from './repo/clients';
export type { Client } from '@/schemas';
