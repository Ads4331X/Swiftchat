import axios from "axios";
import { getToken } from "@/lib/secureStorage";

export const api = axios.create({
  baseURL: `${process.env.EXPO_PUBLIC_BACKEND_URL}`, // e.g. http://192.168.1.5:5000/api
});
api.interceptors.request.use(async (config) => {
  const token = await getToken("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
