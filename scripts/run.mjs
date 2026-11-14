import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { access, appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { prepareAndroid, prepareServer, serverAsset } from './prepare.mjs'
import { android, server } from './releases.mjs'

const mode = process.argv[2]
if (!['api', 'smoke', 'full'].includes(mode)) throw new Error('Expected api, smoke or full')
const started = Date.now()
const logs = resolve('artifacts', mode)
await rm(logs, { recursive: true, force: true })
await mkdir(logs, { recursive: true })
const workspace = await mkdtemp(join(tmpdir(), 'gotify-qa-'))
const children = []
const cancellation = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => cancellation.abort())
let reverse
let stage = 'provisioning'
let failedStage

function command(file, args) {
    const result = spawnSync(file, args, { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed: ${result.stderr.trim()}`)
    return result.stdout.trim()
}

function launch(file, args, options) {
    const child = spawn(file, args, { windowsHide: true, ...options })
    // Keep the rejection observed while readiness checks are in progress.
    const done = once(child, 'exit').then(([code, signal]) => ({ code, signal }))
    done.catch(() => {})
    const processInfo = { child, done }
    children.push(processInfo)
    return processInfo
}

async function freePort() {
    const listener = createServer()
    listener.listen(0, '127.0.0.1')
    await once(listener, 'listening')
    const { port } = listener.address()
    await new Promise((done, reject) => listener.close(error => error ? reject(error) : done()))
    return port
}

async function ready(url, processInfo, label) {
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
        cancellation.signal.throwIfAborted()
        const { child } = processInfo
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${label} exited before becoming ready`)
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
        if (response?.ok) return await response.json()
        await delay(400, undefined, { signal: cancellation.signal })
    }
    throw new Error(`${label} readiness timeout`)
}

async function runNode(args, env) {
    const { child, done } = launch(process.execPath, args, { env, stdio: 'inherit' })
    const abort = () => child.kill()
    cancellation.signal.addEventListener('abort', abort, { once: true })
    try {
        if (cancellation.signal.aborted) abort()
        const { code, signal } = await done
        cancellation.signal.throwIfAborted()
        if (code !== 0) throw new Error(`${stage} exited with ${code ?? signal}`)
    } finally {
        cancellation.signal.removeEventListener('abort', abort)
    }
}

const log = async message => {
    console.log(message)
    await appendFile(join(logs, 'provisioning.log'), `${new Date().toISOString()} ${message}\n`)
}

try {
    const port = await freePort()
    const archive = await prepareServer()
    if (process.platform === 'win32') {
        command('tar', ['-xf', archive, '-C', workspace])
    } else {
        command('unzip', ['-q', archive, '-d', workspace])
    }
    const binary = join(workspace, serverAsset().binary)
    await access(binary)
    const env = {
        ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GOTIFY_/i.test(name))),
        GOTIFY_CONFIG_FILE: join(workspace, 'nonexistent.env'),
        GOTIFY_SERVER_LISTENADDR: '127.0.0.1',
        GOTIFY_SERVER_PORT: String(port),
        GOTIFY_DATABASE_CONNECTION: join(workspace, 'gotify.db'),
        GOTIFY_DEFAULTUSER_NAME: 'qa_admin',
        GOTIFY_DEFAULTUSER_PASS: randomBytes(24).toString('base64url'),
        GOTIFY_REGISTRATION: 'false',
        GOTIFY_LOGLEVEL: 'warn',
        GOTIFY_PLUGINSDIR: join(workspace, 'plugins'),
        GOTIFY_UPLOADEDIMAGESDIR: join(workspace, 'images'),
        QA_API_URL: `http://127.0.0.1:${port}`,
    }
    const serverLog = createWriteStream(join(logs, 'server.log'))
    await once(serverLog, 'open')
    const backend = launch(binary, [], { cwd: workspace, env, stdio: ['ignore', serverLog, serverLog] })
    serverLog.end()
    const version = await ready(`${env.QA_API_URL}/version`, backend, 'Gotify')
    if (version.version?.replace(/^v/, '') !== server.version.slice(1)) throw new Error('Unexpected Gotify version')
    await log(`Gotify ${server.version} ready on loopback with temporary SQLite`)

    if (mode === 'api') {
        stage = 'API contract'
        await runNode(['--test', 'test/api/contract.test.ts'], env)
    } else {
        stage = 'Android provisioning'
        await rm('allure-results', { recursive: true, force: true })
        const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
        if (!sdk) throw new Error('Set ANDROID_HOME to the Android SDK directory')
        const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
        const booted = command(adb, ['devices']).split(/\r?\n/)
            .flatMap(line => line.match(/^(emulator-\d+)\s+device\s*$/)?.[1] ?? [])
        const serial = process.env.ANDROID_SERIAL ?? (booted.length === 1 ? booted[0] : undefined)
        if (!serial || !booted.includes(serial)) throw new Error('Start one emulator or set ANDROID_SERIAL to a running emulator')
        const deviceArgs = ['-s', serial]
        if (command(adb, [...deviceArgs, 'shell', 'getprop', 'sys.boot_completed']) !== '1') {
            throw new Error('Wait for the Android emulator to finish booting')
        }
        if (command(adb, [...deviceArgs, 'shell', 'getprop', 'ro.build.version.sdk']) !== '35') {
            throw new Error('This suite targets Android API 35')
        }
        env.QA_ANDROID_SERIAL = serial
        env.QA_ADB = adb
        env.QA_APK = await prepareAndroid()
        command(adb, [...deviceArgs, 'reverse', `tcp:${port}`, `tcp:${port}`])
        reverse = { adb, deviceArgs, endpoint: `tcp:${port}` }
        await log(`Android API 35 ${serial} ready, Gotify APK ${android.version} verified`)

        stage = 'Appium provisioning'
        const appiumPort = await freePort()
        env.QA_APPIUM_PORT = String(appiumPort)
        // Local npm dependencies expose the pinned driver to Appium. Disable wire logging.
        delete env.APPIUM_HOME
        const appium = launch(process.execPath, ['node_modules/appium/index.js', '--address', '127.0.0.1',
            '--port', env.QA_APPIUM_PORT, '--log-level', 'error'], { env, stdio: 'ignore' })
        await ready(`http://127.0.0.1:${appiumPort}/status`, appium, 'Appium')
        await log('Appium ready on loopback')

        stage = mode === 'smoke' ? 'Android smoke' : 'Android regression'
        const args = ['node_modules/@wdio/cli/bin/wdio.js', 'run', 'wdio.conf.ts']
        if (mode === 'smoke') args.push('--mochaOpts.grep', '@smoke')
        await runNode(args, env)
    }
} catch (error) {
    failedStage = stage
    process.exitCode = 1
    await log(`${stage}: ${error.message}`)
} finally {
    const cleanupErrors = []
    try {
        for (const { child, done } of children.reverse()) {
            if (child.exitCode === null && child.signalCode === null) child.kill()
            await done.catch(() => {})
        }
        if (reverse) {
            const { adb, deviceArgs, endpoint } = reverse
            const mappings = command(adb, [...deviceArgs, 'reverse', '--list'])
            if (mappings.split(/\s+/).includes(endpoint)) command(adb, [...deviceArgs, 'reverse', '--remove', endpoint])
        }
    } catch (error) {
        cleanupErrors.push(error)
    }
    try {
        await rm(workspace, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
    } catch (error) {
        cleanupErrors.push(error)
    }
    if (!cleanupErrors.length) {
        await log('Temporary backend and device forwarding cleaned up')
    } else {
        failedStage ??= 'cleanup'
        process.exitCode = 1
        for (const error of cleanupErrors) await log(`cleanup: ${error.message}`)
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, [
            `### ${mode} · ${failedStage ? `Failed at ${failedStage}` : 'Passed'}`,
            '', `- Commit: \`${process.env.GITHUB_SHA}\``,
            `- Gotify APK: ${android.version} · Server: ${server.version}`,
            `- Duration: ${Math.round((Date.now() - started) / 1000)} s`, '', '',
        ].join('\n'))
    }
}
