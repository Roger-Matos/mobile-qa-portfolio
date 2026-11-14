import { $, driver } from '@wdio/globals'
import { step, addAttachment } from '@wdio/allure-reporter'
import { execFileSync } from 'node:child_process'
import { appId, login } from '../selectors/android.ts'
import { requiredEnv } from '../services/gotify.ts'
import { Scenario } from './scenario.ts'

async function evidence(data: Scenario) {
    // A login error can leave the password field behind a dialog. Redact both the
    // source and visible input before taking a screenshot.
    const source = await driver.getPageSource()
    const secrets = data.users.map(user => user.pass)
    const redacted = secrets.reduce((xml, secret) => xml.replaceAll(secret, '[redacted]'), source)
        .replace(/<[^<>]*\bpassword="true"[^<>]*>/g, node => node.replace(/\btext="[^"]*"/g, 'text="[redacted]"'))
    addAttachment('Android UI hierarchy', redacted, 'application/xml')

    if (source.includes(`${appId}:id/password_editext`)) {
        const password = $(login.password)
        if (await password.isDisplayed()) await password.clearValue().catch(() => {})
        const remaining = await driver.getPageSource()
        const field = remaining.match(/<[^<>]*resource-id="com\.github\.gotify:id\/password_editext"[^<>]*>/)?.[0]
        if (field && !/\btext=""/.test(field)) {
            addAttachment('Screenshot unavailable', 'The login screen still has a populated password field.', 'text/plain')
            return
        }
    }
    addAttachment('Android screenshot', Buffer.from(await driver.takeScreenshot(), 'base64'), 'image/png')
}

export async function withScenario(run: (scenario: Scenario) => Promise<void>) {
    const scenario = new Scenario()
    const failures: unknown[] = []
    try {
        await step('Start with clean Gotify app data', async () => {
            await driver.execute('mobile: terminateApp', { appId })
            await driver.execute('mobile: clearApp', { appId })
            // pm clear resets runtime grants. Login starts a foreground service.
            await driver.execute('mobile: changePermissions', {
                appPackage: appId, permissions: ['android.permission.POST_NOTIFICATIONS'], action: 'grant',
            })
            // Gotify also needs the Android 14+ exact-alarm app op to reconnect.
            execFileSync(requiredEnv('QA_ADB'), ['-s', requiredEnv('QA_ANDROID_SERIAL'), 'shell',
                'appops', 'set', appId, 'SCHEDULE_EXACT_ALARM', 'allow'], { timeout: 10_000, windowsHide: true })
            await driver.execute('mobile: activateApp', { appId })
        })
        await run(scenario)
    } catch (error) {
        failures.push(error)
        try {
            await evidence(scenario)
        } catch (captureError) {
            failures.push(captureError)
        }
    } finally {
        try {
            await step('Remove scenario accounts through the API', () => scenario.cleanup())
        } catch (cleanupError) {
            if (!failures.length) {
                try {
                    await evidence(scenario)
                } catch (captureError) {
                    failures.push(captureError)
                }
            }
            failures.push(cleanupError)
        }
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, failures.map(String).join('\n'))
}
