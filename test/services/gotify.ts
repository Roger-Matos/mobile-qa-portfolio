import { Buffer } from 'node:buffer'

export type Credentials = { name: string; pass: string }
export type User = Credentials & { id: number }
export type Application = { id: number; name: string; token: string }
export type MessageInput = { title: string; message: string; priority: number }
export type Message = MessageInput & { id: number; appid: number }

type Auth = { basic: Credentials } | { token: string }

export class ApiError extends Error {
    readonly status: number

    constructor(method: string, path: string, status: number) {
        super(`${method} ${path} returned HTTP ${status}`)
        this.status = status
    }
}

export function requiredEnv(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Run through the project runner to configure ${name}`)
    return value
}

async function request<T>(method: string, path: string, auth: Auth, body?: unknown): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' })
    if ('basic' in auth) {
        headers.set('Authorization', `Basic ${Buffer.from(`${auth.basic.name}:${auth.basic.pass}`).toString('base64')}`)
    } else {
        headers.set('Authorization', `Bearer ${auth.token}`)
    }
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    let response: Response
    try {
        response = await fetch(`${requiredEnv('QA_API_URL')}${path}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(5000), redirect: 'error',
        })
    } catch {
        throw new Error(`${method} ${path} failed before receiving an HTTP response`)
    }
    if (!response.ok) {
        await response.body?.cancel()
        throw new ApiError(method, path, response.status)
    }
    if (method === 'DELETE') {
        await response.body?.cancel()
        return undefined as T
    }
    try {
        return await response.json() as T
    } catch {
        throw new Error(`${method} ${path} returned invalid JSON`)
    }
}

const admin = (): Auth => ({ basic: {
    name: requiredEnv('GOTIFY_DEFAULTUSER_NAME'), pass: requiredEnv('GOTIFY_DEFAULTUSER_PASS'),
} })

export const gotify = {
    createUser: (credentials: Credentials) => request<{ id: number; name: string; admin: boolean }>(
        'POST', '/user', admin(), { ...credentials, admin: false },
    ),
    listUsers: () => request<Array<{ id: number; name: string }>>('GET', '/user', admin()),
    deleteUser: (id: number) => request<void>('DELETE', `/user/${id}`, admin()),
    createApplication: (user: User, name: string) => request<Application>('POST', '/application', { basic: user }, { name }),
    publish: (app: Application, input: MessageInput) => request<Message>('POST', '/message', { token: app.token }, input),
    async messages(user: User): Promise<Message[]> {
        // Each fixture user owns at most two messages, well inside this page.
        const page = await request<{ messages: Message[] }>('GET', '/message?limit=20', { basic: user })
        return page.messages
    },
    deleteMessage: (user: User, id: number) => request<void>('DELETE', `/message/${id}`, { basic: user }),
}
