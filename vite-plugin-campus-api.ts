import type { Plugin, ViteDevServer, Connect } from 'vite'
import type { ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { loadCampusData, saveCampusData } from './tools/campus-store.ts'

const DATA_PATH = resolve(process.cwd(), 'src/data/campusData.json')
const BACKUP_DIR = resolve(process.cwd(), '.editor-backups')
const ROUTE = '/api/campus'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handle(req: Connect.IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const data = await loadCampusData(DATA_PATH)
      sendJson(res, 200, data)
    } catch (error) {
      sendJson(res, 500, { error: `failed to load campus data: ${(error as Error).message}` })
    }
    return
  }

  if (req.method === 'PUT') {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readBody(req))
    } catch (error) {
      sendJson(res, 400, { error: `invalid JSON body: ${(error as Error).message}` })
      return
    }
    try {
      const result = await saveCampusData(DATA_PATH, BACKUP_DIR, parsed, new Date().toISOString())
      sendJson(res, 200, result)
    } catch (error) {
      // validation errors are the caller's fault -> 400
      sendJson(res, 400, { error: (error as Error).message })
    }
    return
  }

  sendJson(res, 405, { error: 'method not allowed' })
}

export function campusApiPlugin(): Plugin {
  return {
    name: 'campus-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== ROUTE) {
          next()
          return
        }
        handle(req, res).catch((error) => {
          sendJson(res, 500, { error: (error as Error).message })
        })
      })
    },
  }
}
