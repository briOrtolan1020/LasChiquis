import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../data/coquettechat.db');

export const db = new Database(dbPath);
initSchema(db);
