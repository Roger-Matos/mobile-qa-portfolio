import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { android, server } from './releases.mjs'

async function hash(file) {
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(file)) digest.update(chunk)
    return digest.digest('hex')
}

async function download(project, version, asset) {
    const destination = resolve('.cache', project, version, asset.file)
    const current = await hash(destination).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
    })
    if (current === asset.sha256) return destination

    await mkdir(resolve('.cache', project, version), { recursive: true })
    const temporary = `${destination}.${process.pid}.part`
    try {
        console.log(`Downloading gotify/${project} ${version} ${asset.file}`)
        const response = await fetch(`https://github.com/gotify/${project}/releases/download/${version}/${asset.file}`, {
            signal: AbortSignal.timeout(120_000),
        })
        if (!response.ok || !response.body) throw new Error(`Download returned HTTP ${response.status}`)
        await pipeline(response.body, createWriteStream(temporary))
        if (await hash(temporary) !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.file}`)
        await rename(temporary, destination)
        return destination
    } finally {
        await rm(temporary, { force: true })
    }
}

export function serverAsset() {
    const asset = server[process.platform]
    if (!asset || process.arch !== 'x64') throw new Error('Use Windows or Linux x64 for the test runner')
    return asset
}

export const prepareServer = () => download('server', server.version, serverAsset())
export const prepareAndroid = () => download('android', android.version, android)

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
    await Promise.all([prepareServer(), prepareAndroid()])
}
