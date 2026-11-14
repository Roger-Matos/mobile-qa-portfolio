import { deepEqual, equal, ok, rejects } from 'node:assert/strict'
import { test } from 'node:test'
import { Scenario } from '../fixtures/scenario.ts'
import { ApiError, gotify } from '../services/gotify.ts'

test('Gotify provisions scoped messages and supports deletion and teardown', async () => {
    const setup = new Scenario()
    const failures: unknown[] = []
    try {
        const owner = await setup.user('owner')
        const visitor = await setup.user('visitor')
        const app = await setup.application(owner, 'contract')
        ok(Number.isSafeInteger(app.id) && app.id > 0)
        ok(typeof app.token === 'string' && app.token.length > 0, 'application token returned')
        const published = await setup.message(app, 'contract')
        ok(Number.isSafeInteger(published.id) && published.id > 0)
        equal(published.appid, app.id)
        equal(published.title, `contract-${setup.key}`)
        equal(published.message, `Body contract-${setup.key}`)
        deepEqual((await gotify.messages(owner)).map(message => message.id), [published.id])
        deepEqual(await gotify.messages(visitor), [])
        await rejects(gotify.deleteMessage(visitor, published.id), error => error instanceof ApiError && error.status === 404)
        await gotify.deleteMessage(owner, published.id)
        deepEqual(await gotify.messages(owner), [])
    } catch (error) {
        failures.push(error)
    }
    try {
        await setup.cleanup()
        const ids = new Set(setup.users.map(user => user.id))
        ok((await gotify.listUsers()).every(user => !ids.has(user.id)), 'all fixture accounts removed')
    } catch (error) {
        failures.push(error)
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Contract and cleanup both failed')
})
