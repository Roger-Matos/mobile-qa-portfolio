import { $, driver } from '@wdio/globals'
import { login } from '../selectors/android.ts'
import type { Credentials } from '../services/gotify.ts'

export const loginScreen = {
    async signIn(url: string, credentials: Credentials) {
        const urlInput = $(login.url)
        await urlInput.waitForDisplayed()
        await urlInput.setValue(url)
        await $(login.checkUrl).click()
        // The provisioned server is HTTP over the emulator's loopback tunnel.
        await $(login.confirm).waitForDisplayed()
        await $(login.confirm).click()

        const username = $(login.username)
        await username.waitForDisplayed()
        await username.setValue(credentials.name)
        try {
            await $(login.password).setValue(credentials.pass)
        } catch {
            throw new Error('Could not populate the Gotify password field')
        }
        if (await driver.isKeyboardShown()) await driver.hideKeyboard()
        await $(login.submit).click()

        await $(login.clientName).waitForDisplayed()
        await $(login.confirm).click()
    },
}
