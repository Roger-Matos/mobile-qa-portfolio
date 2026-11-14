import { randomBytes } from 'node:crypto'
import { gotify, type Application, type Message, type User } from '../services/gotify.ts'

export class Scenario {
    readonly key = randomBytes(6).toString('hex')
    readonly users: User[] = []
    readonly #names = new Map<string, number | undefined>()

    async user(label: string): Promise<User> {
        const name = `qa-${label}-${this.key}`
        const pass = randomBytes(18).toString('base64url')
        // A request can reach the server even if the client times out receiving its ID.
        this.#names.set(name, undefined)
        const created = await gotify.createUser({ name, pass })
        if (!Number.isSafeInteger(created.id) || created.id < 1) throw new Error('Invalid user ID from Gotify')
        this.#names.set(name, created.id)
        const user = { id: created.id, name, pass }
        this.users.push(user)
        return user
    }

    application(user: User, label: string): Promise<Application> {
        return gotify.createApplication(user, `${label}-${this.key}`)
    }

    message(app: Application, label: string): Promise<Message> {
        return gotify.publish(app, { title: `${label}-${this.key}`, message: `Body ${label}-${this.key}`, priority: 0 })
    }

    async cleanup(): Promise<void> {
        const problems = []
        for (const [name, registeredId] of this.#names) {
            try {
                const id = registeredId ?? (await gotify.listUsers()).find(user => user.name === name)?.id
                if (id !== undefined) await gotify.deleteUser(id)
                this.#names.delete(name)
            } catch (error) {
                problems.push(error)
            }
        }
        if (problems.length) throw new AggregateError(problems, problems.map(String).join('\n'))
    }
}
