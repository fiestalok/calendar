import axios from 'axios'

const BASE_URL = import.meta.env.VITE_DIRECTUS_URL
let accessToken = null

async function authenticate() {
  const { data } = await axios.post(`${BASE_URL}/auth/login`, {
    email: import.meta.env.VITE_DIRECTUS_EMAIL,
    password: import.meta.env.VITE_DIRECTUS_PASSWORD
  })
  accessToken = data.data.access_token
}

async function request(method, path, body = null, params = null) {
  const call = () => axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    data: body,
    params
  })
  try {
    return (await call()).data.data
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      await authenticate()
      return (await call()).data.data
    }
    throw err
  }
}

export const getReservations = (params = {}) =>
  request('GET', '/items/reservations', null, {
    fields: [
      'id', 'date_start', 'date_end', 'status', 'delivery',
      'delivery_address', 'total_price', 'notes',
      'client.id', 'client.first_name', 'client.last_name',
      'client.email', 'client.phone', 'client.city',
      'articles.articles_id.id', 'articles.articles_id.name',
      'articles.articles_id.images_urls',
      'articles.quantity', 'articles.unit_price'
    ].join(','),
    sort: 'date_start',
    limit: -1,
    ...params
  })

export const patchReservation = (id, data) =>
  request('PATCH', `/items/reservations/${id}`, data)

export { authenticate }
