import { driver, expect } from '@wdio/globals'
import { step } from '@wdio/allure-reporter'
import { inboxScreen } from '../screens/inbox.ts'
import { loginScreen } from '../screens/login.ts'
import { gotify, requiredEnv, type Message, type User } from '../services/gotify.ts'

export const messageFlow = {
    async signIn(user: User) {
        await step('Sign in through the Android app and wait for the inbox', async () => {
            await loginScreen.signIn(requiredEnv('QA_API_URL'), user)
            await inboxScreen.waitForReady()
        })
    },

    async expectInbox(visible: Message[], hidden: Message[] = []) {
        await step('Verify message titles and bodies in the Android inbox', async () => {
            for (const message of visible) await inboxScreen.expectMessage(message)
            for (const message of hidden) await inboxScreen.expectAbsent(message)
        })
    },

    async filter(applicationName: string) {
        await step('Select the application in the Android navigation drawer', () => inboxScreen.filterBy(applicationName))
    },

    async deleteAndVerify(user: User, removed: Message, retained: Message) {
        await step('Delete one message in Android and verify the Undo action is offered', () => inboxScreen.remove(removed))
        await step('Wait for the Undo window to expire and the message ID to disappear from the API', async () => {
            await driver.waitUntil(async () => !(await gotify.messages(user)).some(item => item.id === removed.id), {
                timeout: 25_000, interval: 500, timeoutMsg: `Message ${removed.id} still present in the API`,
            })
            await this.expectApiInbox(user, [retained])
        })
        await this.expectInbox([retained], [removed])
    },

    async expectApiInbox(user: User, expected: Message[]) {
        await step('Verify the account inbox by message ID through the API', async () => {
            expect((await gotify.messages(user)).map(item => item.id).sort()).toEqual(expected.map(item => item.id).sort())
        })
    },

    async switchAccount(user: User) {
        await step('Log out via the Android navigation drawer', () => inboxScreen.logout())
        await this.signIn(user)
    },
}
