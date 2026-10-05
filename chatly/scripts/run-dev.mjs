import { spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const input = process.argv.slice(2)
const portIndex = input.findIndex((value) => value === '--port' || value === '-p')
const requestedPort = Number(portIndex >= 0 ? input[portIndex + 1] : process.env.PORT || 3000)

if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  console.error('Invalid development port.')
  process.exit(1)
}

const extraArgs = input.filter(
  (_, index) => portIndex < 0 || (index !== portIndex && index !== portIndex + 1)
)

function isAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)))
  })
}

let port = requestedPort
while (port < Math.min(requestedPort + 20, 65536) && !(await isAvailable(port))) port++
if (port > 65535 || port >= requestedPort + 20) {
  console.error('No available port found for Next.js.')
  process.exit(1)
}

const distDir = process.env.CHATLY_NEXT_DIST_DIR || '.next-dev'
const lockPath = join(process.cwd(), `${distDir.replaceAll(/[\\/]/g, '-')}.lock`)

function existingServer() {
  try {
    const { pid, port: activePort } = JSON.parse(readFileSync(lockPath, 'utf8'))
    process.kill(pid, 0)
    return activePort
  } catch (error) {
    if (error?.code === 'EPERM') return 'unknown'
    return null
  }
}

const activePort = existingServer()
if (activePort !== null) {
  console.error(`Chatly dev server is already running on port ${activePort}.`)
  process.exit(1)
}

let lock
try {
  lock = openSync(lockPath, 'wx')
} catch (error) {
  if (error?.code !== 'EEXIST' || existingServer() !== null) {
    console.error(`Cannot start Chatly dev server: ${error.message}`)
    process.exit(1)
  }
  unlinkSync(lockPath)
  lock = openSync(lockPath, 'wx')
}

writeFileSync(lock, JSON.stringify({ pid: process.pid, port }))
closeSync(lock)
process.on('exit', () => {
  try {
    if (JSON.parse(readFileSync(lockPath, 'utf8')).pid === process.pid) unlinkSync(lockPath)
  } catch {
    // The lock may already have been removed after an abrupt shutdown.
  }
})

if (port !== requestedPort) console.log(`Port ${requestedPort} is in use; starting on ${port}.`)

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))
const child = spawn(
  process.execPath,
  [nextBin, 'dev', '--webpack', '--port', String(port), ...extraArgs],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      CHATLY_NEXT_DIST_DIR: distDir,
    },
  }
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
