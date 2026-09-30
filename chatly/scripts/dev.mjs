import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  console.error('dev:docker currently uses the Windows PowerShell launcher.')
  process.exit(1)
}

const args = process.argv.slice(2)
const portIndex = args.findIndex((value) => value === '--port' || value === '-p')
const port = portIndex >= 0 && args[portIndex + 1] ? args[portIndex + 1] : '3000'
const launcher = fileURLToPath(new URL('./start-local-docker.ps1', import.meta.url))
const setup = spawn(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher, '-Port', port],
  { stdio: 'inherit', windowsHide: true }
)

setup.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1)
    return
  }

  console.log('Following chatly-local logs. Press Ctrl+C to detach; the container stays running.')
  const logs = spawn('docker', ['logs', '--follow', '--tail', '50', 'chatly-local'], {
    stdio: 'inherit',
    windowsHide: true,
  })
  logs.on('exit', (logCode, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(logCode ?? 1)
  })
})
