import fs from 'node:fs/promises'
import express from 'express'
import { Transform } from 'node:stream'
import path from 'path'

const isProduction = process.env.NODE_ENV === 'production'
const base = process.env.BASE || '/'
const ABORT_DELAY = 10000
const __dirname = path.dirname(new URL(import.meta.url).pathname)

// Cache template
const templateHtml = isProduction
  ? await fs.readFile(path.join(__dirname, 'dist', 'client', 'index.html'), 'utf-8')
  : ''

const app = express()

// Dev server middleware
let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base
  })
  app.use(vite.middlewares)
} else {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  app.use(base, sirv(path.join(__dirname, 'dist', 'client'), { extensions: [] }))
}

// SSR route
app.use('*', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')
    let template, render

    if (!isProduction) {
      template = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry-server.jsx')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }

    let didError = false
    const { pipe, abort } = render(url, {
      onShellError() {
        res.status(500)
        res.set({ 'Content-Type': 'text/html' })
        res.send('<h1>Something went wrong</h1>')
      },
      onShellReady() {
        res.status(didError ? 500 : 200)
        res.set({ 'Content-Type': 'text/html' })

        const [htmlStart, htmlEnd] = template.split('<!--app-html-->')
        const transformStream = new Transform({
          transform(chunk, encoding, callback) {
            chunk = chunk.toString()
            if (chunk.endsWith('<vite-streaming-end></vite-streaming-end>')) {
              res.write(chunk.slice(0, -41) + htmlEnd, 'utf-8')
            } else {
              res.write(chunk, 'utf-8')
            }
            callback()
          },
        })

        transformStream.on('finish', () => res.end())
        res.write(htmlStart)
        pipe(transformStream)
      },
      onError(error) {
        didError = true
        console.error(error)
      },
    })

    setTimeout(() => abort(), ABORT_DELAY)
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.error(e.stack)
    res.status(500).end(e.stack)
  }
})

// Export app for Vercel
export default app
