import { createRouter, createWebHistory } from 'vue-router'
import CalendarView from '../views/CalendarView.vue'
import ListView from '../views/ListView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/calendar' },
    { path: '/calendar', component: CalendarView },
    { path: '/list', component: ListView }
  ]
})
