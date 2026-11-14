export const appId = 'com.github.gotify'

export const resource = (name: string) => `id=${appId}:id/${name}`
export const text = (value: string) => `android=new UiSelector().text(${JSON.stringify(value)})`

export const login = {
    url: resource('gotify_url_editext'),
    checkUrl: resource('checkurl'),
    username: resource('username_editext'),
    password: resource('password_editext'),
    submit: resource('login'),
    clientName: resource('client_name_editext'),
    confirm: 'id=android:id/button1',
}

export const inbox = {
    drawer: '~Open navigation drawer',
    list: resource('messages_view'),
    noMessages: resource('no_messages'),
    logout: resource('logout'),
    title: 'message_title',
    body: 'message_text',
    delete: 'message_delete',
}
