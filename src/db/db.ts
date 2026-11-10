import { OpenHorizonDB } from './schema';

/** Single database instance, shared by the page and the service worker. */
export const db = new OpenHorizonDB();
