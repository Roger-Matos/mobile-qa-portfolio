import { $, driver, expect } from '@wdio/globals'
import { appId, inbox, login, text } from '../selectors/android.ts'
import type { Message } from '../services/gotify.ts'

const titlePath = (name: string) => `//*[@resource-id='${appId}:id/${inbox.title}' and @text=${JSON.stringify(name)}]`
const title = (name: string) => $(titlePath(name))
const field = (name: string, id: string) => $(`${titlePath(name)}/../*[@resource-id='${appId}:id/${id}']`)

export const inboxScreen = {
    async waitForReady() {
        await $(inbox.drawer).waitForDisplayed()
        await driver.waitUntil(async () => await $(inbox.list).isDisplayed() || await $(inbox.noMessages).isDisplayed(), {
            timeoutMsg: 'Gotify inbox did not finish loading',
        })
    },

    async expectMessage(message: Message) {
        await expect(title(message.title)).toBeDisplayed()
        await expect(field(message.title, inbox.body)).toHaveText(message.message)
    },

    async expectAbsent(message: Message) {
        await expect(title(message.title)).not.toBeExisting()
    },

    async filterBy(applicationName: string) {
        await $(inbox.drawer).click()
        await $(text(applicationName)).click()
        await this.waitForReady()
    },

    async remove(message: Message) {
        await field(message.title, inbox.delete).click()
        await expect($(text('Message deleted'))).toBeDisplayed()
        await expect($(text('Undo'))).toBeDisplayed()
        await $(text('Message deleted')).waitForDisplayed({ reverse: true })
    },

    async logout() {
        await $(inbox.drawer).click()
        await $(inbox.logout).click()
        await $(login.confirm).click()
        await $(login.url).waitForDisplayed()
    },
}
