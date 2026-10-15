import { fileURLToPath } from 'node:url'

export const origin = 'http://localhost:5173'
export const authDir = fileURLToPath(new URL('../../.auth/', import.meta.url))
export const storagePath = fileURLToPath(new URL('../../.auth/patient.storage.json', import.meta.url))
export const sessionPath = fileURLToPath(new URL('../../.auth/patient.session.json', import.meta.url))
