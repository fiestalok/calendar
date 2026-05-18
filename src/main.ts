import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './style.css'
import App from './App.vue'
import { useAuthStore } from './stores/auth'
import { setOnExpired, setOnRefresh } from './api/directus'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const auth = useAuthStore()
setOnExpired(() => { auth.logout(); router.push('/login') })
setOnRefresh((access, refresh) => auth.updateTokens(access, refresh))

router.beforeEach((to) => {
  const requiresAuth = to.matched.some(r => r.meta?.requiresAuth)
  const isGuest     = to.matched.some(r => r.meta?.guest)
  const loggedIn    = !!(auth.accessToken && auth.user)

if (requiresAuth && !loggedIn) return '/login'
  if (isGuest && loggedIn)       return '/'
})

app.mount('#app')
