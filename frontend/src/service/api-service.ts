import type { AxiosInstance } from 'axios'
import axios from 'axios'
import { getValidUser } from '@/auth/auth-service'

class APIService {
  private readonly client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    this.client.interceptors.request.use(async (config) => {
      const token = (await getValidUser())?.access_token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })
    this.client.interceptors.response.use(
      (config) => {
        console.info(`received response status: ${config.status}`)
        return config
      },
      (error) => {
        console.error(error)
        return Promise.reject(error)
      },
    )
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }
}

export default new APIService()
