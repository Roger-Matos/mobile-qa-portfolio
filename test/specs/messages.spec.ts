import { step } from '@wdio/allure-reporter'
import { withScenario } from '../fixtures/mobile.ts'
import { messageFlow as flow } from '../flows/messages.ts'

describe('Gotify on Android', () => {
    it('delivers an API message to the open inbox without refreshing @smoke', () => withScenario(async data => {
        const { user, app, anchor } = await step('Provision an account, an application, and an initial message', async () => {
            const user = await data.user('realtime')
            const app = await data.application(user, 'alerts')
            return { user, app, anchor: await data.message(app, 'Initial') }
        })
        await flow.signIn(user)
        await flow.expectInbox([anchor])

        const incoming = await step('Publish a second message through the API while Android is open', () => data.message(app, 'Live'))
        await flow.expectInbox([incoming, anchor])
    }))

    it('filters the inbox by the application that sent the message', () => withScenario(async data => {
        const { user, alerts, selected, excluded } = await step('Seed one message per sending application', async () => {
            const user = await data.user('filter')
            const alerts = await data.application(user, 'alerts')
            const billing = await data.application(user, 'billing')
            return { user, alerts, selected: await data.message(alerts, 'Alert'), excluded: await data.message(billing, 'Invoice') }
        })
        await flow.signIn(user)
        await flow.expectInbox([selected, excluded])
        await flow.filter(alerts.name)
        await flow.expectInbox([selected], [excluded])
    }))

    it('persists deletion of only the message deleted in the Android inbox', () => withScenario(async data => {
        const { user, retained, removed } = await step('Seed the target message and a control message', async () => {
            const user = await data.user('delete')
            const app = await data.application(user, 'alerts')
            return { user, retained: await data.message(app, 'Keep'), removed: await data.message(app, 'Delete') }
        })
        await flow.signIn(user)
        await flow.expectInbox([removed, retained])
        await flow.expectApiInbox(user, [removed, retained])
        await flow.deleteAndVerify(user, removed, retained)
    }))

    it('keeps separately seeded inboxes isolated when switching accounts', () => withScenario(async data => {
        const { first, second, firstMessage, secondMessage } = await step('Seed messages under two independent accounts', async () => {
            const first = await data.user('first')
            const second = await data.user('second')
            const firstMessage = await data.message(await data.application(first, 'first'), 'First')
            const secondMessage = await data.message(await data.application(second, 'second'), 'Second')
            return { first, second, firstMessage, secondMessage }
        })
        await flow.expectApiInbox(first, [firstMessage])
        await flow.expectApiInbox(second, [secondMessage])
        await flow.signIn(first)
        await flow.expectInbox([firstMessage], [secondMessage])
        await flow.switchAccount(second)
        await flow.expectInbox([secondMessage], [firstMessage])
    }))
})
