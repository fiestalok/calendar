import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layouts/AppLayout.vue'
import HomeView from '../views/HomeView.vue'
import PlanningView from '../views/PlanningView.vue'
import ClientsView from '../views/ClientsView.vue'
import ContactsView from '../views/ContactsView.vue'
import ProspectsView from '../views/ProspectsView.vue'
import ProduitsView from '../views/ProduitsView.vue'
import ArticlesView from '../views/ArticlesView.vue'
import EntrepotsView from '../views/EntrepotsView.vue'
import FacturesView from '../views/FacturesView.vue'
import FaqView from '../views/FaqView.vue'
import ReservationsView from '../views/ReservationsView.vue'
import GammesView from '../views/GammesView.vue'
import ConsommablesView from '../views/ConsommablesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      component: LoginView,
      meta: { guest: true },
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '',             component: HomeView },
        { path: 'planning',     component: PlanningView },
        { path: 'reservations', component: ReservationsView },
        { path: 'clients',      component: ClientsView },
        { path: 'contacts',     component: ContactsView },
        { path: 'prospects',    component: ProspectsView },
        { path: 'produits',     component: ProduitsView },
        { path: 'articles',     component: ArticlesView },
        { path: 'gammes',         component: GammesView },
        { path: 'consommables',   component: ConsommablesView },
        { path: 'entrepots',    component: EntrepotsView },
        { path: 'factures',     component: FacturesView },
        { path: 'faq',          component: FaqView },
        { path: 'stock',        redirect: '/produits' },
        { path: 'calendar',     redirect: '/planning' },
        { path: 'list',         redirect: '/planning' },
      ],
    },
  ],
})

export default router
